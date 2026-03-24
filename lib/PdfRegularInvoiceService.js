const { Invoice, Detail } = require('./Invoice');
const StringUtils = require('./StringUtils');
const RegexPatterns = require('./RegexPatterns');
const PDFTextPositionAnalyzer = require('./PDFTextPositionAnalyzer');
const InvoiceValidator = require('./InvoiceValidator');
const BaseInvoiceService = require('./BaseInvoiceService');

/**
 * PDF 普通发票服务 - 优化版
 * 使用完整的正则表达式库、坐标定位和字段验证
 */
class PdfRegularInvoiceService {
  static extract(fullText, allText, pageWidth, items) {
    const invoice = new Invoice();

    // 1. 提取基础字段
    this.extractBasicFields(invoice, allText);

    // 2. 提取金额信息
    this.extractAmountInfo(invoice, allText, fullText);

    // 3. 提取人名信息（签单人）
    BaseInvoiceService.extractPersonInfo(invoice, allText);

    // 4. 尝试使用坐标定位提取购销方信息
    if (items && items.length > 0) {
      const analyzer = new PDFTextPositionAnalyzer(items);
      this.extractPartyInfoByPosition(invoice, analyzer);
      this.extractDetailsByPosition(invoice, analyzer, allText);
    } else {
      // 降级处理：基于文本匹配
      this.extractPartyInfoByText(invoice, fullText, allText);
    }

    // 5. 验证发票数据
    this.validateAndFixPartyInfo(invoice);

    // 6. 验证和修正发票
    BaseInvoiceService.validateInvoice(invoice);

    return invoice;
  }

  /**
   * 提取基础字段
   */
  static extractBasicFields(invoice, allText) {
    // 使用完整的正则表达式库
    const patterns = RegexPatterns.BASIC_FIELDS;

    for (const [key, pattern] of Object.entries(patterns)) {
      const result = RegexPatterns.tryPatterns(allText, [pattern]);
      if (result) {
        invoice[key] = result.match[1] || result.match[0];
      }
    }

    // 发票类型识别
    this.detectInvoiceType(invoice, allText);
  }

  /**
   * 识别发票类型
   */
  static detectInvoiceType(invoice, allText) {
    // 通行费特殊处理
    if (allText.includes('通行费') && allText.includes('车牌号')) {
      invoice.type = '通行费';
      return;
    }

    // 普通发票
    const regularMatch = allText.match(RegexPatterns.INVOICE_TYPE.regular);
    if (regularMatch) {
      let cleanText = regularMatch[1].replace(
        RegexPatterns.INVOICE_TYPE.regularCleanup,
        ''
      );
      // 移除前导的代码等杂质
      cleanText = cleanText.replace(/.*代码[:：]?\d+/, '').trim();
      invoice.title = cleanText + '通发票';
      invoice.type = '普通发票';
      return;
    }

    // 专用发票
    const specialMatch = allText.match(RegexPatterns.INVOICE_TYPE.special);
    if (specialMatch) {
      let cleanText = specialMatch[1].replace(
        RegexPatterns.INVOICE_TYPE.specialCleanup,
        ''
      );
      // 移除前导的代码等杂质
      cleanText = cleanText.replace(/.*代码[:：]?\d+/, '').trim();
      invoice.title = cleanText + '用发票';
      invoice.type = '专用发票';
      return;
    }
  }

  /**
   * 提取金额信息 - 多策略尝试
   */
  static extractAmountInfo(invoice, allText, fullText) {

    // 1. 尝试从 fullText 提取金额和税额，因为它保留了换行和相对位置
    const amountPatterns = [
      /合计[:：\s]*¥?(\d+\.\d+)\s+¥?(\d+\.\d+)/,
      /小计[:：\s]*¥?(\d+\.\d+)\s+¥?(\d+\.\d+)/,
      /¥?(\d+\.\d+)\s+¥?(\d+\.\d+)\s*$/m,
      /¥?(\d+\.\d+)\s+([0-9.]+)\s*$/m // 宽松模式
    ];

    for (const pattern of amountPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        invoice.amount = match[1];
        invoice.taxAmount = match[2];
        console.log(`DEBUG: Using combined pattern ${pattern} found: amount=${invoice.amount}, tax=${invoice.taxAmount}`);
        break;
      }
    }

    // 2. 如果税额提取失败或为 "0"/"1"（误读），尝试显式模式
    if (!invoice.taxAmount || invoice.taxAmount === '0' || invoice.taxAmount === '1' || invoice.taxAmount === '0.00') {
      const taxMatch = allText.match(RegexPatterns.AMOUNT_FIELDS.taxAmount);
      if (taxMatch) {
        invoice.taxAmount = taxMatch[1];
      }
    }

    if (!invoice.amount) {
      const amountMatch = allText.match(RegexPatterns.AMOUNT_FIELDS.amount);
      if (amountMatch) {
        invoice.amount = amountMatch[1];
      }
    }

    // 3. 兜底逻辑：如果税额还是有问题，在合计字样附近的数字中查找
    if (!invoice.taxAmount || invoice.taxAmount === '0' || invoice.taxAmount === '1' || invoice.taxAmount === '0.00' || invoice.taxAmount === invoice.totalAmount) {
      const lines = fullText.split('\n');
      for (const line of lines) {
        if (line.includes('合计') || line.includes('小计')) {
          // 排除掉价税合计这一行，它通常包含总额
          if (line.includes('价税合计')) continue;

          const numbers = line.match(/\d+\.\d+/g);
          if (numbers && numbers.length >= 2) {
            // 如果第一个数字和已有的金额相近，或者没有金额
            if (!invoice.amount || Math.abs(parseFloat(invoice.amount) - parseFloat(numbers[0])) < 0.01) {
              invoice.amount = numbers[0];
              invoice.taxAmount = numbers[1];
              console.log(`DEBUG: Found amount/tax in summary line: ${line} -> ${numbers[0]}, ${numbers[1]}`);
              break;
            }
          }
        }
      }
    }

    // 4. 终极尝试：在 fullText 全文查找符合 a + t = total 的组合
    if (!invoice.taxAmount || invoice.taxAmount === '0' || invoice.taxAmount === '1' || invoice.taxAmount === '0.00' || invoice.taxAmount === invoice.totalAmount) {
      const allNumbers = fullText.match(/\d+\.\d+/g);
      if (allNumbers && allNumbers.length >= 2) {
        // 尝试寻找符合 a + t = total 的组合
        // 如果有 totalAmount，则根据 totalAmount 寻找 a 和 t
        if (invoice.totalAmount) {
          const total = parseFloat(invoice.totalAmount);
          for (let i = allNumbers.length - 1; i >= 0; i--) {
            const num = parseFloat(allNumbers[i]);
            // 如果这个数字本身就是总额（或者非常接近），我们查找它前面的两个数字
            if (Math.abs(num - total) < 0.01) {
              // 查找它前面的两个数字，看看是否相加等于它
              for (let j = i - 1; j >= 1; j--) {
                for (let k = j - 1; k >= 0; k--) {
                  const a = parseFloat(allNumbers[k]);
                  const t = parseFloat(allNumbers[j]);
                  if (Math.abs(a + t - total) < 0.01) {
                    invoice.amount = allNumbers[k];
                    invoice.taxAmount = allNumbers[j];
                    console.log(`DEBUG: Found valid amount/tax combination by total ${total}: ${a} + ${t}`);
                    return;
                  }
                }
              }
            }
          }
        }
        
        // 如果没有明确的总额，或者上面的方法没找到，尝试猜测
        for (let i = allNumbers.length - 1; i >= 1; i--) {
          for (let j = i - 1; j >= 0; j--) {
            const a = parseFloat(allNumbers[j]);
            const t = parseFloat(allNumbers[i]);
            
            // 如果已经有了总额，检查是否匹配
            if (invoice.totalAmount) {
              const total = parseFloat(invoice.totalAmount);
              if (Math.abs(a + t - total) < 0.01) {
                invoice.amount = allNumbers[j];
                invoice.taxAmount = allNumbers[i];
                console.log(`DEBUG: Found valid amount/tax combination: ${a} + ${t} = ${total}`);
                return;
              }
            } else {
              // 如果没有总额，尝试寻找常见的税率关系 (如 3%, 6%, 9%, 13%)
              const rates = [0.03, 0.06, 0.09, 0.13, 0.01];
              for (const r of rates) {
                if (Math.abs(a * r - t) < 0.05) {
                  invoice.amount = allNumbers[j];
                  invoice.taxAmount = allNumbers[i];
                  invoice.totalAmount = (a + t).toFixed(2);
                  console.log(`DEBUG: Found amount/tax by rate ${r}: ${a}, ${t}, guessed total=${invoice.totalAmount}`);
                  return;
                }
              }
            }
          }
        }

        // 最后的最后：如果 test.pdf 这种情况，amount=50.00, tax=3.00, total=53.00
        // allNumbers 可能是 [..., 50.00, 3.00, 53.00]
        if (allNumbers.length >= 3) {
          const last = parseFloat(allNumbers[allNumbers.length - 1]);
          const mid = parseFloat(allNumbers[allNumbers.length - 2]);
          const first = parseFloat(allNumbers[allNumbers.length - 3]);
          
          if (Math.abs(first + mid - last) < 0.01) {
            invoice.amount = allNumbers[allNumbers.length - 3];
            invoice.taxAmount = allNumbers[allNumbers.length - 2];
            invoice.totalAmount = allNumbers[allNumbers.length - 1];
            console.log(`DEBUG: Found triplet: ${first} + ${mid} = ${last}`);
          }
        }
      }
    }

    // 4. 价税合计
    let totalMatch = allText.match(RegexPatterns.AMOUNT_FIELDS.totalAmount);
    if (!totalMatch) {
      // 尝试在 fullText 中查找带空格的价税合计
      totalMatch = fullText.match(/价税合计(?:\(大写\))?[:：\s]*([^\(\)]*?)(?:\(小写\))?[:：\s]*¥?(\d+\.?\d*)/);
    }
    
    // 专门针对 test.pdf 这种标签和金额完全分离的情况
    if (!totalMatch && fullText.includes('价税合计')) {
      // 查找价税合计后面的第一个浮点数
      const parts = fullText.split('价税合计');
      const afterTotal = parts[parts.length - 1]; // 取最后一个价税合计后面
      
      // 寻找大写金额：需要包含圆或整，且长度足够
      const chineseMatch = afterTotal.match(/([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]{2,})/);
      if (chineseMatch) {
        invoice.totalAmountString = chineseMatch[1];
      }

      // 寻找小写金额：跳过大写部分，寻找第一个浮点数
      // 排除掉可能被误认为总额的 amount 或 taxAmount
      const numbers = afterTotal.match(/\d+\.\d+/g) || [];
      for (const n of numbers) {
        // 如果这个数字不等于 amount 且不等于 taxAmount
        // 或者虽然相等但它是独立出现的（比如 total = amount + 0）
        if (n !== invoice.amount && n !== invoice.taxAmount) {
          invoice.totalAmount = n;
          console.log(`DEBUG: Found totalAmount by proximity (filtering): ${invoice.totalAmount}`);
          break;
        }
      }
      
      // 特殊情况：合计金额和价税合计相等（税额为0）
      if (!invoice.totalAmount && invoice.amount && (!invoice.taxAmount || parseFloat(invoice.taxAmount) === 0)) {
        if (afterTotal.includes(invoice.amount)) {
          invoice.totalAmount = invoice.amount;
          console.log(`DEBUG: TotalAmount equals Amount (Tax is 0): ${invoice.totalAmount}`);
        }
      }

      // 如果还是没找到，且有 amount 和 taxAmount，则计算
      if (!invoice.totalAmount && invoice.amount && invoice.taxAmount) {
        invoice.totalAmount = (parseFloat(invoice.amount) + parseFloat(invoice.taxAmount)).toFixed(2);
        console.log(`DEBUG: Calculated totalAmount: ${invoice.totalAmount}`);
      }
    } else if (totalMatch) {
      invoice.totalAmountString = totalMatch[1].trim();
      invoice.totalAmount = totalMatch[2];
    }
    
    // 针对 test.pdf: 如果 totalAmountString 还是空，尝试在大写括号中间找
    if (!invoice.totalAmountString && (fullText.includes('大写') || allText.includes('大写'))) {
      // 更灵活的正则表达式，匹配各种括号和空格
      const combinedText = fullText + allText;
      console.log(`DEBUG: 查找totalAmountString的文本: ${combinedText.substring(0, 300)}...`);

      // 尝试多种模式
      const patterns = [
        /大写[）)）\s]*([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
        /（大写）([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
        /\(大写\)([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
        /价税合计.*[（(].*[)）]([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
        /价税合计.*([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/
      ];

      for (const pattern of patterns) {
        const match = combinedText.match(pattern);
        if (match) {
          invoice.totalAmountString = match[1];
          console.log(`DEBUG: 通过模式 ${pattern} 找到totalAmountString: ${invoice.totalAmountString}`);
          break;
        } else {
          console.log(`DEBUG: 模式 ${pattern} 没有匹配到`);
        }
      }
    }
    
    // 如果最后还是没有 totalAmountString，且有 totalAmount，可以尝试转换（可选，目前先保留）
    if (!invoice.totalAmountString) {
      const chineseNumbers = "壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整";
      const combined = fullText + allText;
      const words = combined.split(/[\s（）()]/);
      for (const word of words) {
        if (word.length >= 3 && [...word].every(char => chineseNumbers.includes(char))) {
          invoice.totalAmountString = word;
          break;
        }
      }
    }
  }


  /**
   * 从销售方文本中提取价税合计大写金额
   */
  static extractTotalAmountStringFromSellerText(invoice, sellerText) {
    console.log(`DEBUG: 尝试从销售方文本提取totalAmountString: ${sellerText.substring(0, 100)}...`);

    // 尝试多种模式
    const patterns = [
      /价税合计\s*[（(]?\s*大写\s*[)）]?\s*([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
      /价税合计（大写）([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
      /价税合计\(大写\)([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
      /价税合计.*([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+圆整)/,
      /（大写）([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
      /\(大写\)([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/
    ];

    for (const pattern of patterns) {
      const match = sellerText.match(pattern);
      if (match) {
        invoice.totalAmountString = match[1];
        console.log(`DEBUG: 使用模式 ${pattern} 找到totalAmountString: ${invoice.totalAmountString}`);
        return;
      }
    }

    // 如果以上模式都没匹配到，尝试查找中文数字
    const chineseNumbers = "壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整";
    const lines = sellerText.split('\n');
    for (const line of lines) {
      if (line.includes('价税合计') || line.includes('大写')) {
        console.log(`DEBUG: 检查包含价税合计或大写的行: ${line}`);
        // 查找连续的中文数字
        let chineseNum = '';
        for (const char of line) {
          if (chineseNumbers.includes(char)) {
            chineseNum += char;
          } else if (chineseNum.length > 0) {
            break;
          }
        }
        if (chineseNum.length >= 3) {
          invoice.totalAmountString = chineseNum;
          console.log(`DEBUG: 从行中提取totalAmountString: ${invoice.totalAmountString}`);
          return;
        }
      }
    }
  }

  /**
   * 使用坐标定位提取购销方信息
   */
  static extractPartyInfoByPosition(invoice, analyzer) {
    // 获取购销方区域
    const regions = analyzer.detectPartyRegions();

    // 提取购买方信息
    if (regions.buyer) {
      const buyerText = analyzer.getTextInRegion(regions.buyer);
      console.log('DEBUG: 购买方文本:', buyerText);
      this.parsePartyInfo(invoice, 'buyer', buyerText);
    }

    // 提取销售方信息
    if (regions.seller) {
      const sellerText = analyzer.getTextInRegion(regions.seller);
      console.log('DEBUG: 销售方文本:', sellerText);
      this.parsePartyInfo(invoice, 'seller', sellerText);

      // 尝试从销售方文本中提取totalAmountString
      if (!invoice.totalAmountString && sellerText.includes('价税合计')) {
        this.extractTotalAmountStringFromSellerText(invoice, sellerText);
      }
    }

    // 提取密码区信息
    const passwordRegion = analyzer.findPasswordRegion();
    if (passwordRegion) {
      const passwordText = analyzer.getTextInRegion(passwordRegion);
      invoice.password = StringUtils.trim(passwordText);
    }
  }

  /**
   * 解析购销方信息
   */
  static parsePartyInfo(invoice, type, text) {
    if (!text) return;

    const patterns = RegexPatterns.PARTY_FIELDS;
    const prefix = type === 'buyer' ? 'buyer' : 'seller';

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        const value = StringUtils.trim(match[1]);
        const fieldName = `${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`;

        // 特殊处理名称字段：如果提取到的名称看起来像门店号而不是公司名称，
        // 尝试在文本中查找更合适的公司名称
        if (key === 'name' && (value.includes('门店号') || value.includes('店号') || /^\d+$/.test(value))) {
          // 尝试在文本中查找公司名称
          const companyNameMatch = text.match(/([\u4e00-\u9fa5（）()]{5,}有限公司|[\u4e00-\u9fa5（）()]{5,}公司|[\u4e00-\u9fa5（）()]{5,}集团)/);
          if (companyNameMatch) {
            invoice[fieldName] = StringUtils.trim(companyNameMatch[1]);
            console.log(`DEBUG: 修正${fieldName}: 从 "${value}" 改为 "${invoice[fieldName]}"`);
            continue;
          }
        }

        invoice[fieldName] = value;
      }
    }
  }

  /**
   * 降级处理：基于文本匹配的购销方信息提取
   */
  static extractPartyInfoByText(invoice, fullText, allText) {
    // 直接从文本中提取购销方信息，不依赖标签
    // 购买方信息通常在"购"字之后，明细之前
    const buyerSectionMatch = fullText.match(/购[\s\S]*?(?=货物或应税劳务|规格型号|单位|数量)/);
    if (buyerSectionMatch) {
      const buyerSection = buyerSectionMatch[0];
      this.parsePartyInfoFromText(invoice, 'buyer', buyerSection);
    }

    // 销售方信息：通常在发票底部，"销"字之后
    const sellerSectionMatch = fullText.match(/销[\s\S]*?(?=收款人|复核|开票人|$)/);
    if (sellerSectionMatch) {
      const sellerSection = sellerSectionMatch[0];
      this.parsePartyInfoFromText(invoice, 'seller', sellerSection);
    }
  }

  /**
   * 从文本段解析购销方信息（改进版）
   */
  static parsePartyInfoFromText(invoice, type, text) {
    const prefix = type === 'buyer' ? 'buyer' : 'seller';

    // 提取名称
    const nameMatch = text.match(/名[\s]*称[:：\s]*([^密\n\r]*)/);
    if (nameMatch) {
      const name = StringUtils.trim(nameMatch[1]);
      if (name && !name.includes('税') && !name.includes('合计')) {
        invoice[`${prefix}Name`] = name;
      }
    }

    // 提取纳税人识别号
    const codeMatch = text.match(/纳[\s]*税[\s]*人[\s]*识[\s]*别[\s]*号[:：\s]*([A-Z0-9]{18})/);
    if (codeMatch) {
      invoice[`${prefix}Code`] = StringUtils.trim(codeMatch[1]);
    }

    // 提取地址（排除电话、纳税人识别号、密码等）
    const addressMatch = text.match(/地[\s]*址[:：\s]*([^电纳密\n\r]*)/);
    if (addressMatch) {
      const address = StringUtils.trim(addressMatch[1]);
      if (address && address !== '、' && !address.match(/^\d{10,}$/)) {
        invoice[`${prefix}Address`] = address;
      }
    }

    // 提取电话
    const phoneMatch = text.match(/电[\s]*话[:：\s]*([^\n\r]*)/);
    if (phoneMatch) {
      const phone = StringUtils.trim(phoneMatch[1]);
      if (phone && phone.match(/\d/)) {
        invoice[`${prefix}Phone`] = phone;
      }
    }

    // 提取开户行及账号
    const accountMatch = text.match(/开[\s]*户[\s]*行[\s]*及[\s]*账[\s]*号[:：\s]*([^\n\r]*)/);
    if (accountMatch) {
      const account = StringUtils.trim(accountMatch[1]);
      if (account && account.length > 5) {
        invoice[`${prefix}Account`] = account;
      }
    }
  }

  /**
   * 使用坐标定位提取明细行
   */
  static extractDetailsByPosition(invoice, analyzer, allText) {
    // 检测明细行区域
    const detailsRegion = analyzer.detectDetailsRegion();
    if (!detailsRegion) {
      return; // 无法定位明细区域
    }

    // 获取明细行的文本
    const detailLines = analyzer.getTextLinesInRegion(detailsRegion);

    const details = [];
    for (const line of detailLines) {
      if (!line || line.length < 5) {
        continue;
      }

      // 检查是否为明细行（包含税率或特殊标记）
      if (this.isDetailLine(line)) {
        const detail = this.parseDetailLine(line);
        if (detail) {
          details.push(detail);
        }
      }
    }

    invoice.details = details;
  }

  /**
   * 判断是否为明细行
   */
  static isDetailLine(text) {
    // 明细行通常包含：
    // 1. 百分比税率
    // 2. 免税、不征税等标记
    // 3. 数字（金额）
    return /\d+%/.test(text) ||
      /免税|不征税|出口零税率|普通零税率/.test(text) ||
      (/\d+/.test(text) && /\d+\.\d+/.test(text));
  }

  /**
   * 解析单条明细行
   */
  static parseDetailLine(line) {
    const detail = new Detail();
    detail.name = '';

    // 规范化
    line = StringUtils.replace(line);
    const items = StringUtils.split(line, ' ');

    if (items.length < 2) {
      return null;
    }

    // 简单情况：只有金额和税额
    if (items.length === 2 && /^\d+/.test(items[0]) && /^\d+/.test(items[1])) {
      detail.amount = items[0];
      detail.taxAmount = items[1];
      return detail;
    }

    // 复杂情况：包含商品信息、数量、单价、税率等
    if (items.length > 2) {
      // 最后三项通常是：金额、税率、税额
      const lastAmount = items[items.length - 3];
      const taxRate = items[items.length - 2];
      const taxAmount = items[items.length - 1];

      if (/^\d+/.test(lastAmount)) {
        detail.amount = lastAmount;

        // 税率处理
        if (/免税|不征税|出口零税率|普通零税率/.test(taxRate)) {
          detail.taxRate = 0;
          detail.taxAmount = 0;
        } else {
          detail.taxRate = RegexPatterns.extractTaxRate(taxRate);
          detail.taxAmount = taxAmount;
        }

        // 提取数量、单价、规格等信息
        let quantity = null;
        let price = null;

        for (let j = 0; j < items.length - 3; j++) {
          if (RegexPatterns.DETAIL_LINE.number.test(items[j])) {
            if (!quantity) {
              quantity = items[j];
            } else {
              price = items[j];
            }
          } else if (items[j].length > 1) {
            // 规格或单位
            if (j + 1 < items.length && !RegexPatterns.DETAIL_LINE.number.test(items[j + 1])) {
              detail.model = items[j];
              detail.unit = items[j + 1];
              j++; // 跳过单位
            }
          }
        }

        if (quantity) detail.count = quantity;
        if (price) detail.price = price;

        return detail;
      }
    }

    return null;
  }

  /**
   * 验证并修正购销方信息
   */
  static validateAndFixPartyInfo(invoice) {
    // 1. 检查名称是否包含明细表头内容
    const headerKeywords = ['规格型号', '单位', '数量', '单价', '金额', '税率', '税额'];
    
    [ 'buyerName', 'sellerName' ].forEach(field => {
      if (invoice[field]) {
        const containsHeader = headerKeywords.some(keyword => invoice[field].includes(keyword));
        if (containsHeader) {
          console.log(`DEBUG: 清除无效的${field}:`, invoice[field]);
          invoice[field] = null;
        }
      }
    });

    // 2. 清理各字段中的杂质文字
    const junkWords = ['买', '码', '注', '方区', '密码区', '购方区', '销售方区', '代码', '售', '购', '销', '密'];
    const fieldsToClean = [
      'buyerName', 'buyerCode', 'buyerAddress', 'buyerAccount',
      'sellerName', 'sellerCode', 'sellerAddress', 'sellerAccount'
    ];

    fieldsToClean.forEach(field => {
      if (invoice[field] && typeof invoice[field] === 'string') {
        let value = invoice[field].trim();
        
        // 特殊处理：如果提取的内容包含字段标签本身，去掉它
        const labels = ['名称', '纳税人识别号', '识别号', '地址', '电话', '开户行及账号'];
        labels.forEach(label => {
          if (value.startsWith(label)) {
            value = value.replace(new RegExp(`^${label}[:：\\s]*`), '').trim();
          }
        });

        // 移除开头和末尾的杂质
        let changed = true;
        while (changed) {
          changed = false;
          for (const word of junkWords) {
            if (value.endsWith(word)) {
              value = value.substring(0, value.length - word.length).trim();
              changed = true;
            }
            if (value.startsWith(word)) {
              value = value.substring(word.length).trim();
              changed = true;
            }
          }
        }

        // 特殊修正：针对 buyerAccount 中的 "区" 等单字
        if (field === 'buyerAccount' && value.length === 1) {
          value = null;
        }

        // 如果清理后只剩下极短的无意义字符，则置空
        if (value && value.length <= 1 && junkWords.some(word => value.includes(word))) {
          value = null;
        }

        invoice[field] = value;
      }
    });

    // 3. 修正具体的字段误提取
    if (invoice.buyerAddress && (invoice.buyerAddress.includes('纳税人识别号') || invoice.buyerAddress.includes('识别号'))) {
      invoice.buyerAddress = null;
    }
    
    // 如果买方税号被提取到了地址里（常见于 test2.pdf）
    if (!invoice.buyerCode && invoice.buyerAddress) {
      const codeMatch = invoice.buyerAddress.match(/[A-Z0-9]{15,20}/);
      if (codeMatch) {
        invoice.buyerCode = codeMatch[0];
        invoice.buyerAddress = null;
      }
    }

    // 4. 如果购销方税号相同，且其中一个是错误的，尝试修复
    if (invoice.buyerCode && invoice.sellerCode && invoice.buyerCode === invoice.sellerCode) {
      if (!invoice.buyerName) {
        invoice.buyerCode = null;
        invoice.buyerAddress = null;
        invoice.buyerAccount = null;
      }
    }

    // 6. 特殊处理：当购买方是个人时，清理无效的地址和账号信息
    if (invoice.buyerName && invoice.buyerName.includes('个人')) {
      console.log(`DEBUG: 检测到购买方为个人: ${invoice.buyerName}`);

      // 清理buyerName：只保留"个人"，去掉后面的数字和特殊字符
      const cleanName = invoice.buyerName.replace(/个人\s*[\d\s<>*\/+\-]*$/, '个人').trim();
      if (cleanName !== invoice.buyerName) {
        console.log(`DEBUG: 清理buyerName: 从 "${invoice.buyerName}" 改为 "${cleanName}"`);
        invoice.buyerName = cleanName;
      }

      // 个人通常没有地址和账号，如果包含特殊字符则清空
      const specialChars = /[<>*\/+]/; // 移除-，因为电话号码中可能包含-
      if (invoice.buyerAddress && specialChars.test(invoice.buyerAddress)) {
        console.log(`DEBUG: 清空包含特殊字符的buyerAddress: ${invoice.buyerAddress}`);
        invoice.buyerAddress = null;
      }

      if (invoice.buyerAccount && specialChars.test(invoice.buyerAccount)) {
        console.log(`DEBUG: 清空包含特殊字符的buyerAccount: ${invoice.buyerAccount}`);
        invoice.buyerAccount = null;
      }

      // 个人通常没有纳税人识别号
      if (invoice.buyerCode && specialChars.test(invoice.buyerCode)) {
        console.log(`DEBUG: 清空包含特殊字符的buyerCode: ${invoice.buyerCode}`);
        invoice.buyerCode = null;
      }
    }

    // 8. 清理名称末尾的常见杂质字
    const nameSuffixes = ['备', '注', '密', '码', '区'];
    ['buyerName', 'sellerName'].forEach(field => {
      if (invoice[field]) {
        let name = invoice[field];
        let changed = true;
        while (changed) {
          changed = false;
          for (const suffix of nameSuffixes) {
            if (name.endsWith(suffix)) {
              name = name.substring(0, name.length - suffix.length).trim();
              changed = true;
              console.log(`DEBUG: 清理${field}末尾的"${suffix}": 从 "${invoice[field]}" 改为 "${name}"`);
            }
          }
        }
        invoice[field] = name;
      }
    });

    // 9. 通用密码区字符检查：如果字段包含密码区字符，清空
    const passwordChars = /[<>*\/+]/; // 注意：不包含-，因为电话号码中可能包含-
    const passwordFields = ['buyerAddress', 'buyerAccount', 'buyerCode', 'sellerAddress', 'sellerAccount', 'sellerCode'];

    passwordFields.forEach(field => {
      if (invoice[field] && passwordChars.test(invoice[field])) {
        console.log(`DEBUG: 清空包含密码区字符的${field}: ${invoice[field]}`);
        invoice[field] = null;
      }
    });

    // 10. 检查地址是否包含无效字符
    if (invoice.buyerAddress === '、') invoice.buyerAddress = null;
    if (invoice.sellerAddress === '、') invoice.sellerAddress = null;
  }
}

module.exports = PdfRegularInvoiceService;
