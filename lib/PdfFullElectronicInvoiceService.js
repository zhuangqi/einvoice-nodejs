const { Invoice, Detail } = require('./Invoice');
const RegexPatterns = require('./RegexPatterns');
const InvoiceValidator = require('./InvoiceValidator');
const BaseInvoiceService = require('./BaseInvoiceService');

/**
 * PDF 全电发票服务 - 优化版
 * 整合：正则表达式优化 + 字段验证
 */
class PdfFullElectronicInvoiceService {
  static extract(fullText, allText, pageWidth, items) {
    return BaseInvoiceService.safeExtract(() => {
      const invoice = new Invoice();

      this.extractBasicFields(invoice, allText, items);
      this.extractAmountInfo(invoice, allText, fullText);
      BaseInvoiceService.extractPersonInfo(invoice, allText);
      this.extractDetails(invoice, fullText, allText, items);

      BaseInvoiceService.validateInvoice(invoice);

      return invoice;
    });
  }

  static extractBasicFields(invoice, allText, items) {
    // 使用基类的通用方法
    BaseInvoiceService.extractBasicFields(invoice, allText);

    // 全电发票特定的字段提取
    const electronicsNumberMatch = allText.match(RegexPatterns.UTILITY_PATTERNS.electronicsNumber);
    if (electronicsNumberMatch) {
      invoice.number = electronicsNumberMatch[1];
    }

    // 提取日期（使用基类方法）
    const date = BaseInvoiceService.extractDate(allText);
    if (date) {
      invoice.date = date;
    }

    // 使用坐标信息提取购销方名称
    if (items && items.length > 0) {
      this.extractPartyNamesByCoordinates(invoice, items);
    } else {
      // 回退到文本提取
      const partyNames = BaseInvoiceService.extractPartyNames(allText);
      if (partyNames.buyerName) {
        invoice.buyerName = partyNames.buyerName;
      }
      if (partyNames.sellerName) {
        invoice.sellerName = partyNames.sellerName;
      }
    }

    // 提取纳税人识别号（使用基类方法）
    const taxIds = BaseInvoiceService.extractTaxIds(allText);
    if (taxIds.length > 0) {
      invoice.buyerCode = taxIds[0];
    }
    if (taxIds.length > 1) {
      invoice.sellerCode = taxIds[1];
    }

    this.detectInvoiceType(invoice, allText);
  }

  /**
   * 使用坐标信息提取购销方名称
   * 基于文本项的位置信息进行区域定位
   */
  static extractPartyNamesByCoordinates(invoice, items) {
    // 找到"购"和"销"的位置
    let buyerStartX = null;
    let sellerStartX = null;
    let partyAreaY = null;

    for (const item of items) {
      if (item.text === '购' || item.text === '购买方') {
        buyerStartX = item.x;
        partyAreaY = item.y;
      } else if (item.text === '销' || item.text === '销售方') {
        sellerStartX = item.x;
        partyAreaY = item.y;
      }
    }

    if (!buyerStartX || !sellerStartX || !partyAreaY) {
      return; // 无法定位区域
    }

    // 假设购买方区域在左侧，销售方区域在右侧
    const midX = (buyerStartX + sellerStartX) / 2;

    // 收集购买方区域内的文本项
    let buyerText = '';
    let sellerText = '';

    // 按Y坐标分组
    const itemsByY = {};
    for (const item of items) {
      const y = Math.round(item.y);
      if (!itemsByY[y]) {
        itemsByY[y] = [];
      }
      itemsByY[y].push(item);
    }

    // 按Y坐标排序（从上到下）
    const sortedYs = Object.keys(itemsByY).map(y => parseInt(y)).sort((a, b) => b - a);

    // 找到购买方信息区域（从"购"开始向下）
    for (const y of sortedYs) {
      const lineItems = itemsByY[y];
      lineItems.sort((a, b) => a.x - b.x); // 按X坐标排序

      // 检查是否在购买方或销售方区域
      let lineBuyerText = '';
      let lineSellerText = '';

      for (const item of lineItems) {
        // 根据X坐标判断属于哪个区域
        if (item.x < midX) {
          lineBuyerText += item.text + ' ';
        } else {
          lineSellerText += item.text + ' ';
        }
      }

      buyerText += lineBuyerText.trim() + '\n';
      sellerText += lineSellerText.trim() + '\n';
    }

    // 从购买方文本中提取名称
    const buyerNameMatch = buyerText.match(/名称[:：]\s*([^\n]+?)(?=\s*(?:统一社会信用代码|纳税人识别号|$))/);
    if (buyerNameMatch) {
      invoice.buyerName = buyerNameMatch[1].trim().replace(/\s+/g, ' ');
    } else {
      // 尝试更简单的匹配
      const buyerNameMatch2 = buyerText.match(/名称[:：]\s*([^\n]+)/);
      if (buyerNameMatch2) {
        invoice.buyerName = buyerNameMatch2[1].trim().replace(/\s+/g, ' ');
      }
    }

    // 从销售方文本中提取名称
    const sellerNameMatch = sellerText.match(/名称[:：]\s*([^\n]+?)(?=\s*(?:统一社会信用代码|纳税人识别号|$))/);
    if (sellerNameMatch) {
      invoice.sellerName = sellerNameMatch[1].trim().replace(/\s+/g, ' ');
    } else {
      // 尝试更简单的匹配
      const sellerNameMatch2 = sellerText.match(/名称[:：]\s*([^\n]+)/);
      if (sellerNameMatch2) {
        invoice.sellerName = sellerNameMatch2[1].trim().replace(/\s+/g, ' ');
      }
    }
  }

  static detectInvoiceType(invoice, allText) {
    // 优先匹配完整的发票类型（注意：allText是规范化后的文本，括号可能被替换）
    const fullMatch = allText.match(/电子发票\s*（增值税专用发票）/) ||
                     allText.match(/电子发票（增值税专用发票）/) ||
                     allText.match(/电子发票\s*\(增值税专用发票\)/) ||
                     allText.match(/电子发票\(增值税专用发票\)/) ||
                     allText.match(/电子发票\s*（普通发票）/) ||
                     allText.match(/电子发票（普通发票）/) ||
                     allText.match(/电子发票\s*\(普通发票\)/) ||
                     allText.match(/电子发票\(普通发票\)/);

    if (fullMatch) {
      // 提取完整的发票类型
      const matchText = fullMatch[0];
      if (matchText.includes('增值税专用发票')) {
        invoice.title = '电子发票（增值税专用发票）';
        invoice.type = '专用发票';
      } else if (matchText.includes('普通发票')) {
        invoice.title = '电子发票（普通发票）';
        invoice.type = '普通发票';
      }
    } else if (allText.includes('电子发票')) {
      invoice.title = '电子发票';
      invoice.type = '电子发票';
    } else if (allText.includes('普通发票')) {
      invoice.title = '普通发票';
      invoice.type = '普通发票';
    } else if (allText.includes('增值税专用发票')) {
      invoice.title = '增值税专用发票';
      invoice.type = '专用发票';
    } else if (allText.includes('通行费')) {
      invoice.title = '通行费发票';
      invoice.type = '通行费';
    }
  }

  static extractAmountInfo(invoice, allText, fullText) {
    // 首先尝试从"合计"行提取金额和税额
    const amountMatch = fullText.match(/合\s*计\s*¥?\s*(\d+\.\d+)\s+¥?\s*(\d+\.\d+)/);
    if (amountMatch) {
      invoice.amount = amountMatch[1];
      invoice.taxAmount = amountMatch[2];
    }

    // 如果没找到，尝试其他模式
    if (!invoice.amount) {
      const amountMatch2 = RegexPatterns.tryPatterns(allText, [
        RegexPatterns.AMOUNT_FIELDS.amount,
        RegexPatterns.AMOUNT_FIELDS.amountWithSpace,
      ]);
      if (amountMatch2) {
        const parsed = this.parseAmountString(amountMatch2.match[0]);
        if (parsed.amount) {
          invoice.amount = parsed.amount;
        }
        if (parsed.taxAmount) {
          invoice.taxAmount = parsed.taxAmount;
        }
      }
    }

    // 提取价税合计
    const totalMatch = allText.match(
      /价税合计\s*\(?大写\)?\s*([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)\s*\(?小写\)?\s*¥?\s*(\d+\.\d+)\s*(?=[合计]|$)/
    );
    if (totalMatch) {
      invoice.totalAmountString = totalMatch[1];
      invoice.totalAmount = totalMatch[2];
    }

    // 如果还没找到价税合计，尝试更宽松的模式
    if (!invoice.totalAmount) {
      const totalMatch2 = fullText.match(/价税合计.*?¥?\s*(\d+\.\d+)/);
      if (totalMatch2) {
        invoice.totalAmount = totalMatch2[1];
      }
    }

    // 如果还没找到大写金额，尝试提取
    if (!invoice.totalAmountString) {
      const chineseMatch = allText.match(/价税合计.*?([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/);
      if (chineseMatch) {
        invoice.totalAmountString = chineseMatch[1];
      }
    }

    // 验证金额一致性
    if (invoice.amount && invoice.taxAmount && invoice.totalAmount) {
      const amount = parseFloat(invoice.amount);
      const taxAmount = parseFloat(invoice.taxAmount);
      const totalAmount = parseFloat(invoice.totalAmount);

      if (!isNaN(amount) && !isNaN(taxAmount) && !isNaN(totalAmount)) {
        const diff = Math.abs(totalAmount - (amount + taxAmount));
        if (diff > 0.01) {
          invoice.amountWarning = `金额不匹配: ${amount} + ${taxAmount} ≠ ${totalAmount}`;
        }
      }
    }
  }

  static parseAmountString(amountStr) {
    const parts = amountStr.match(/(\d+\.?\d*)/g) || [];
    return {
      amount: parts[0] || '',
      taxAmount: parts[1] || '',
    };
  }


  static extractDetails(invoice, fullText, allText, items) {
    const details = [];
    const lines = fullText.split('\n');

    let taxRateLineIdx = -1;
    let mergeLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('税率') || line.includes('合计') || line.includes('销售额')) {
        if (line.includes('税率')) {
          taxRateLineIdx = i;
        }
        if (line.includes('合计') && i > taxRateLineIdx) {
          mergeLineIdx = i;
          break;
        }
      }
    }

    if (taxRateLineIdx > 0 && mergeLineIdx > taxRateLineIdx) {
      for (let i = taxRateLineIdx + 1; i < mergeLineIdx; i++) {
        const line = lines[i].trim();
        if (!line || this.isLineIgnorable(line)) continue;

        if (this.isDetailLine(line)) {
          const detail = this.parseDetailLine(line);
          if (detail && detail.amount) {
            details.push(detail);
          }
        }
      }
    }

    invoice.details = details;
  }

  static isLineIgnorable(line) {
    return (
      line.length < 2 ||
      /^[-\s=*]*$/.test(line) ||
      /^\s*$/.test(line) ||
      line.startsWith('商品')
    );
  }

  static isDetailLine(line) {
    // 排除包含"合计"的行
    if (line.includes('合计') || line.includes('合 计')) {
      return false;
    }
    return /\d+%/.test(line) || /免税|不征税|出口零税/.test(line) || /\d+\.\d+/.test(line);
  }

  static parseDetailLine(line) {
    const detail = new Detail();

    line = line.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = line.split(/\s+/);

    if (tokens.length < 2) {
      return null;
    }

    // 特殊处理：如果行以*开头，可能是项目名称包含*
    if (tokens[0] === '*' && tokens.length >= 4) {
      // 尝试重建项目名称
      let nameParts = [];
      let i = 0;

      // 收集直到遇到数字的部分作为项目名称
      while (i < tokens.length && !/^\d+(\.\d+)?$/.test(tokens[i])) {
        nameParts.push(tokens[i]);
        i++;
      }

      if (nameParts.length > 0) {
        detail.name = nameParts.join('');
      }

      // 剩下的tokens从i开始是数字部分
      const numberTokens = tokens.slice(i);

      // 查找税率位置
      const taxRateIdx = numberTokens.findIndex((t) => /\d+%|免税|不征税/.test(t));

      // 金额应该是税率前面的一个数字
      if (taxRateIdx > 0) {
        detail.amount = numberTokens[taxRateIdx - 1];

        // 税率
        if (taxRateIdx >= 0) {
          const taxRateStr = numberTokens[taxRateIdx];
          detail.taxRate = RegexPatterns.extractTaxRate(taxRateStr);
        }

        // 税额是税率后面的数字
        if (taxRateIdx + 1 < numberTokens.length) {
          const nextToken = numberTokens[taxRateIdx + 1];
          if (/^\d+(\.\d+)?$/.test(nextToken)) {
            detail.taxAmount = nextToken;
          }
        }
      }

      return Object.keys(detail).length > 1 ? detail : null;
    }

    // 原来的逻辑（用于非*开头的行）
    const amountIdx = tokens.findIndex((t) => /^\d+(\.\d+)?$/.test(t));
    const taxRateIdx = tokens.findIndex((t) => /\d+%|免税|不征税/.test(t));

    if (amountIdx >= 0) {
      detail.amount = tokens[amountIdx];

      let numCount = 0;
      for (let i = 0; i < amountIdx; i++) {
        if (/^-?\d+(\.\d+)?$/.test(tokens[i])) {
          if (numCount === 0) {
            detail.count = tokens[i];
          } else if (numCount === 1) {
            detail.price = tokens[i];
          }
          numCount++;
        } else {
          if (!detail.name) {
            detail.name = tokens[i];
          } else if (!detail.model) {
            detail.model = tokens[i];
          } else if (!detail.unit) {
            detail.unit = tokens[i];
          }
        }
      }

      if (taxRateIdx >= 0) {
        const taxRateStr = tokens[taxRateIdx];
        detail.taxRate = RegexPatterns.extractTaxRate(taxRateStr);
      }

      if (taxRateIdx >= 0 && taxRateIdx + 1 < tokens.length) {
        const nextToken = tokens[taxRateIdx + 1];
        if (/^\d+(\.\d+)?$/.test(nextToken)) {
          detail.taxAmount = nextToken;
        }
      }
    }

    return Object.keys(detail).length > 1 ? detail : null;
  }
}

module.exports = PdfFullElectronicInvoiceService;
