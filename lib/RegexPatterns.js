/**
 * 正则表达式模式库 - 参考原 Java 代码
 * 用于提取发票各个字段
 */

class RegexPatterns {
  /**
   * 基础字段模式
   */
  static BASIC_FIELDS = {
    // 机器编号: 12位数字，可能在"机器编号:"或"发票代码机器编号:"后
    machineNumber: /(?:机器编号[:：]|发票代码机器编号[:：])(\d{12})/,
    
    // 发票代码: 12位数字
    code: /发票代码[:：](\d{12})/,
    
    // 发票号码: 8-10位数字
    number: /发票号码[:：](\d{8,10})/,
    
    // 日期: YYYY年MM月DD日 格式
    date: /(\d{4}年\d{1,2}月\d{1,2}日)/,

    // 其他日期格式
    dateDash: /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    dateCompact: /(\d{4}\d{2}\d{2})/,
    
    // 校验码: 20位数字或较长的非空字符序列
    checksum: /校验码[:：](\d{20}|\S{10,})/,
  };

  /**
   * 金额类模式
   */
  static AMOUNT_FIELDS = {
    // 合计金额（不含税）
    amount: /(?:合计|小计)[:：\s]*¥?(\d+\.?\d*)/,
    
    // 税额
    taxAmount: /税额[:：\s]*¥?(\d+\.?\d*)/,
    
    // 价税合计 (大写和小写)
    totalAmount: /价税合计(?:\(大写\))?[:：\s]*([^\(\)]*?)(?:\(小写\))?[:：\s]*¥?(\d+\.?\d*)/,
    
    // 金额+税额组合 (用于全电发票或紧凑布局)
    amountWithTax: /¥?(\d+\.?\d*)\s*¥?(\d+\.?\d*)/,

    // 带空格或分隔符的金额+税额
    amountWithSpace: /¥?(\d+\.?\d*)\s+¥?(\d+\.?\d*)/,
  };

  /**
   * 人名信息模式
   */
  static PERSON_FIELDS = {
    // 收款人 / 复核 / 开票人
    // 更精确的正则表达式，匹配中文名字（2-4个中文字符），使用非贪婪匹配
    people: /收款人[:：](\S{2,4}?)复核[:：](\S{2,4}?)开票人[:：](\S{2,4}?)(?=销售方|$)/,
  };

  /**
   * 购销方信息模式 - 统一优化版
   */
  static PARTY_FIELDS = {
    // 名称：支持空格，支持冒号后的各种字符，直到换行或密码区标记
    name: /名[\s]*称[:：\s]*([^密\n\r]+)/,
    // 纳税人识别号：18位大写字母和数字，支持空格
    code: /(?:纳[\s]*税[\s]*人[\s]*识[\s]*别[\s]*号|识别号)[:：\s]*([A-Z0-9]{15,20})/,
    // 地址、电话：支持多种分隔符，提取地址部分
    address: /地[\s]*址(?:[\s]*[、,，\s]*电[\s]*话)?[:：\s]*([^电\n\r]*)/,
    // 电话：提取电话号码部分
    phone: /电[\s]*话[:：\s]*([^\n\r]+)/,
    // 开户行及账号
    account: /开[\s]*户[\s]*行[\s]*及[\s]*账[\s]*号[:：\s]*([^\n\r]+)/,
    // 电子支付标识
    electronicAccount: /电[\s]*子[\s]*支[\s]*付[\s]*标[\s]*识[:：\s]*([^\n\r]*)/,
  };

  /**
   * 明细表头识别
   */
  static DETAIL_HEADERS = {
    name: /货物或应[\s]*税[\s]*劳[\s]*务[\s]*、[\s]*服[\s]*务[\s]*名[\s]*称/,
    model: /规[\s]*格[\s]*型[\s]*号/,
    unit: /单[\s]*位/,
    quantity: /数[\s]*量/,
    price: /单[\s]*价/,
    amount: /金[\s]*额/,
    taxRate: /税[\s]*率/,
    taxAmount: /税[\s]*额/,
  };

  /**
   * 发票类型识别
   */
  static INVOICE_TYPE = {
    // 普通发票
    regular: /(\S*)通发票/,
    regularCleanup: /[国统一发票监制]/g,
    
    // 专用发票
    special: /(\S*)用发票/,
    specialCleanup: /[国统一发票监制]/g,
    
    // 通行费
    tollFee: /通行费/,
    tollFeeCheck: /车牌号/,
  };

  /**
   * 明细行识别模式
   */
  static DETAIL_LINE = {
    // 税率和金额行: 包含百分比和数字
    taxRateLine: /\S+\d*(%|免税|不征税|出口零税率|普通零税率)\S*/,
    // 数字提取
    number: /^(-?\d+)(\.\d+)?$/,
  };

  /**
   * 电子发票特定模式
   */
  static ELECTRONIC_INVOICE = {
    // 电子发票类型
    type: /电子发票\s*[（(]增值税(专用|普通)发票[）)]/,

    // 合计金额模式
    amountWithTax: /合\s*计\s*¥?\s*(\d+\.\d+)\s+¥?\s*(\d+\.\d+)/,

    // 价税合计（数字）
    totalAmount: /价税合计.*?¥?\s*(\d+\.\d+)/,

    // 价税合计（中文大写）
    totalAmountChinese: /价税合计.*?([壹贰叁肆伍陆柒捌玖拾佰仟万亿圆整]+)/,
  };

  /**
   * 实用模式
   */
  static UTILITY_PATTERNS = {
    // 电子发票号码
    electronicsNumber: /电子发票号码[:：](\d{8,12})/,
  };

  /**
   * 获取特定模式的所有匹配
   * @param {string} text - 文本
   * @param {RegExp} pattern - 正则表达式
   * @returns {Array} 所有匹配的组
   */
  static getAllMatches(text, pattern) {
    const results = [];
    let match;
    // 确保只有一个 'g' 标志
    let flags = pattern.flags || '';
    if (!flags.includes('g')) {
      flags += 'g';
    }
    const globalPattern = new RegExp(pattern.source, flags);
    while ((match = globalPattern.exec(text)) !== null) {
      results.push(match);
    }
    return results;
  }

  /**
   * 尝试多个模式，返回第一个匹配
   * @param {string} text - 文本
   * @param {Array<RegExp>} patterns - 正则表达式数组
   * @returns {object} {match, pattern}
   */
  static tryPatterns(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return { match, pattern };
      }
    }
    return null;
  }

  /**
   * 提取数字型字段值
   */
  static extractNumber(text) {
    if (!text) return null;
    const match = text.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * 提取税率百分比
   */
  static extractTaxRate(text) {
    if (!text || text.includes('免税') || text.includes('不征税')) {
      return 0;
    }
    const match = text.match(/(\d+)%/);
    return match ? parseFloat(match[1]) / 100 : 0;
  }
}

module.exports = RegexPatterns;
