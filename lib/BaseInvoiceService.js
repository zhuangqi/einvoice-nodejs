const { Invoice, Detail } = require('./Invoice');
const RegexPatterns = require('./RegexPatterns');
const InvoiceValidator = require('./InvoiceValidator');
const ErrorHandler = require('./ErrorHandler');

/**
 * 发票服务基类
 * 提取三个发票服务类的公共方法和逻辑
 */
class BaseInvoiceService {
  /**
   * 提取基础字段 - 通用实现
   * @param {Invoice} invoice - 发票对象
   * @param {string} allText - 规范化后的文本
   * @param {Object} options - 配置选项
   */
  static extractBasicFields(invoice, allText, options = {}) {
    const patterns = options.patterns || RegexPatterns.BASIC_FIELDS;

    for (const [key, pattern] of Object.entries(patterns)) {
      const result = RegexPatterns.tryPatterns(allText, [pattern]);
      if (result) {
        invoice[key] = result.match[1] || result.match[0];
      }
    }
  }

  /**
   * 提取人员信息（签单人、收款人、复核人）
   * @param {Invoice} invoice - 发票对象
   * @param {string} allText - 规范化后的文本
   */
  static extractPersonInfo(invoice, allText) {
    // 开票人 - 匹配直到遇到关键词或标点符号
    const drawerMatch = allText.match(/开票人[:：]\s*([^销售方复核收款人,，。;；\n\r]+?)(?=[销售方复核收款人,，。;；\n\r]|$)/);
    if (drawerMatch) {
      invoice.drawer = drawerMatch[1].trim();
    }

    // 收款人/收款人
    const collectorMatch = allText.match(/收款人[:：]\s*([^开票人复核销售方,，。;；\n\r]+?)(?=[开票人复核销售方,，。;；\n\r]|$)/);
    if (collectorMatch) {
      invoice.collector = collectorMatch[1].trim();
      // 同时设置 payee 字段
      invoice.payee = collectorMatch[1].trim();
    }

    // 复核/复核人
    const reviewerMatch = allText.match(/复核人?[:：]\s*([^开票人收款人销售方,，。;；\n\r]+?)(?=[开票人收款人销售方,，。;；\n\r]|$)/);
    if (reviewerMatch) {
      invoice.reviewer = reviewerMatch[1].trim();
    }
  }

  /**
   * 验证发票数据
   * @param {Invoice} invoice - 发票对象
   */
  static validateInvoice(invoice) {
    const validation = InvoiceValidator.validate(invoice);
    invoice.validationResult = {
      valid: validation.valid,
      warnings: validation.warnings,
      errors: validation.errors,
      suggestions: validation.suggestions
    };

    // 修正常见错误
    if (validation.suggestions && validation.suggestions.length > 0) {
      InvoiceValidator.correctCommonErrors(invoice);
    }
  }

  /**
   * 安全执行提取操作
   * @param {Function} extractFn - 提取函数
   * @param {Array} args - 函数参数
   * @returns {Invoice} 发票对象
   */
  static safeExtract(extractFn, ...args) {
    return ErrorHandler.safeExtract(extractFn, args, 'invoice-service');
  }

  /**
   * 清理文本中的控制字符和特殊字符
   * @param {string} text - 原始文本
   * @returns {string} 清理后的文本
   */
  static cleanText(text) {
    if (!text) return '';

    // 移除控制字符
    let cleaned = text.replace(/[\x00-\x1F\x7F]/g, '');

    // 移除多余的空格和换行
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * 提取日期信息
   * @param {string} text - 文本
   * @returns {string|null} 日期字符串
   */
  static extractDate(text) {
    const datePatterns = [
      RegexPatterns.BASIC_FIELDS.date,
      RegexPatterns.BASIC_FIELDS.dateDash,
      RegexPatterns.BASIC_FIELDS.dateCompact,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 提取纳税人识别号
   * @param {string} text - 文本
   * @returns {Array} 识别号数组
   */
  static extractTaxIds(text) {
    const matches = RegexPatterns.getAllMatches(
      text,
      /纳税人识别号[:：\s]*([\dA-Z]{14,20})/g
    );
    return matches.map(match => match[1]);
  }

  /**
   * 提取购销方名称
   * @param {string} text - 文本
   * @returns {Object} 包含buyerName和sellerName的对象
   */
  static extractPartyNames(text) {
    const result = { buyerName: null, sellerName: null };

    // 方法1：使用区域定位 - 先找到购买方信息区域
    // 查找"购买方信息"或"购"开头的区域
    const buyerAreaMatch = text.match(/(?:购买方信息|购\s*买\s*方\s*信\s*息)[\s\S]*?(?=(?:销售方信息|销\s*售\s*方\s*信\s*息|项目名称|$))/);

    if (buyerAreaMatch) {
      const buyerArea = buyerAreaMatch[0];
      // 在购买方区域内提取名称
      const buyerNameMatch = buyerArea.match(/名\s*称[:：]\s*([^\n\r]+?)(?=\s*(?:统一社会信用代码|纳税人识别号|地址|电话|开户行|$))/);
      if (buyerNameMatch) {
        result.buyerName = buyerNameMatch[1].trim().replace(/\s+/g, ' ');
      }
    } else {
      // 方法2：回退到原来的正则表达式（兼容旧格式）
      const buyerMatch = text.match(/购.*?名称[:：\s]*([^\n\r]+?)(?=\s*销|$)/);
      if (buyerMatch) {
        result.buyerName = buyerMatch[1].trim().replace(/\s+/g, ' ');
      }
    }

    // 方法1：使用区域定位 - 先找到销售方信息区域
    const sellerAreaMatch = text.match(/(?:销售方信息|销\s*售\s*方\s*信\s*息)[\s\S]*?(?=(?:项目名称|价税合计|合计|$))/);

    if (sellerAreaMatch) {
      const sellerArea = sellerAreaMatch[0];
      // 在销售方区域内提取名称
      const sellerNameMatch = sellerArea.match(/名\s*称[:：]\s*([^\n\r]+?)(?=\s*(?:统一社会信用代码|纳税人识别号|地址|电话|开户行|$))/);
      if (sellerNameMatch) {
        result.sellerName = sellerNameMatch[1].trim().replace(/\s+/g, ' ');
      }
    } else {
      // 方法2：回退到原来的正则表达式（兼容旧格式）
      const sellerMatch = text.match(/销.*?名称[:：\s]*([^\n\r]+?)(?=\s*(?:买售方方信|统一社会信用代码|纳税人识别号|项目名称|$))/);
      if (sellerMatch) {
        result.sellerName = sellerMatch[1].trim().replace(/\s+/g, ' ');
      }
    }

    return result;
  }
}

module.exports = BaseInvoiceService;