/**
 * 发票字段验证器
 * 对识别的发票进行数据验证和修正
 */

class InvoiceValidator {
  /**
   * 验证发票对象的所有字段
   * @param {Invoice} invoice - 发票对象
   * @returns {object} {valid: boolean, errors: [], warnings: []}
   */
  static validate(invoice) {
    const errors = [];
    const warnings = [];

    // 验证标题
    if (!invoice.title) {
      warnings.push('缺少发票标题');
    } else {
      const titleValidation = this.validateTitle(invoice.title);
      if (!titleValidation.valid) {
        warnings.push(titleValidation.message);
      }
    }

    // 验证发票类型
    if (!invoice.type) {
      warnings.push('缺少发票类型');
    } else {
      const typeValidation = this.validateInvoiceType(invoice.type);
      if (!typeValidation.valid) {
        warnings.push(typeValidation.message);
      }
    }

    // 验证日期
    if (invoice.date) {
      const dateValidation = this.validateDate(invoice.date);
      if (!dateValidation.valid) {
        warnings.push(dateValidation.message);
      }
    } else {
      warnings.push('缺少开票日期');
    }

    // 验证机器编号
    if (invoice.machineNumber) {
      const mnValidation = this.validateMachineNumber(invoice.machineNumber);
      if (!mnValidation.valid) {
        errors.push(mnValidation.message);
      }
    } else {
      warnings.push('缺少机器编号');
    }

    // 验证发票代码
    if (invoice.code) {
      const codeValidation = this.validateInvoiceCode(invoice.code);
      if (!codeValidation.valid) {
        errors.push(codeValidation.message);
      }
    } else {
      warnings.push('缺少发票代码');
    }

    // 验证发票号码
    if (invoice.number) {
      const numberValidation = this.validateInvoiceNumber(invoice.number);
      if (!numberValidation.valid) {
        errors.push(numberValidation.message);
      }
    } else {
      warnings.push('缺少发票号码');
    }

    // 验证金额
    const amountValidation = this.validateAmounts(invoice);
    if (!amountValidation.valid) {
      errors.push(...amountValidation.errors);
      warnings.push(...amountValidation.warnings);
    }

    // 验证购销方信息
    const partyValidation = this.validatePartyInfo(invoice);
    if (!partyValidation.valid) {
      warnings.push(...partyValidation.warnings);
    }

    // 验证校验码
    if (invoice.checksum) {
      const checksumValidation = this.validateChecksum(invoice.checksum);
      if (!checksumValidation.valid) {
        warnings.push(checksumValidation.message);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: this.generateSuggestions(invoice, errors, warnings)
    };
  }

  /**
   * 验证发票标题格式
   */
  static validateTitle(title) {
    const validTitles = ['电子普通发票', '电子专用发票', '普通发票', '专用发票', '通行费'];
    const normalized = title.trim();

    for (const validTitle of validTitles) {
      if (normalized.includes(validTitle)) {
        return { valid: true };
      }
    }

    return {
      valid: false,
      message: `发票标题格式异常: ${title}`
    };
  }

  /**
   * 验证发票类型
   */
  static validateInvoiceType(type) {
    const validTypes = ['普通发票', '专用发票', '通行费', '电子发票', '财政票据'];
    if (validTypes.includes(type)) {
      return { valid: true };
    }

    return {
      valid: false,
      message: `发票类型无效: ${type}`
    };
  }

  /**
   * 验证日期格式
   */
  static validateDate(date) {
    const dateRegex = /(\d{4})年(\d{2})月(\d{2})日/;
    const match = date.match(dateRegex);

    if (!match) {
      return {
        valid: false,
        message: `日期格式异常: ${date}`
      };
    }

    const [, year, month, day] = match.map(x => parseInt(x));

    // 检查日期合理性
    if (month < 1 || month > 12) {
      return {
        valid: false,
        message: `月份无效: ${month}`
      };
    }

    if (day < 1 || day > 31) {
      return {
        valid: false,
        message: `日期无效: ${day}`
      };
    }

    // 检查年份（发票通常不会太旧或太新）
    const currentYear = new Date().getFullYear();
    if (year < 2000 || year > currentYear + 1) {
      return {
        valid: false,
        message: `年份异常: ${year}`
      };
    }

    return { valid: true };
  }

  /**
   * 验证机器编号（12位数字）
   */
  static validateMachineNumber(machineNumber) {
    if (!/^\d{12}$/.test(machineNumber)) {
      return {
        valid: false,
        message: `机器编号格式错误（应为12位数字）: ${machineNumber}`
      };
    }
    return { valid: true };
  }

  /**
   * 验证发票代码（12位数字）
   */
  static validateInvoiceCode(code) {
    if (!/^\d{12}$/.test(code)) {
      return {
        valid: false,
        message: `发票代码格式错误（应为12位数字）: ${code}`
      };
    }
    return { valid: true };
  }

  /**
   * 验证发票号码
   */
  static validateInvoiceNumber(number) {
    // 普通发票号码: 1开头的9-10位数字
    if (!/^\d{8,10}$/.test(number)) {
      return {
        valid: false,
        message: `发票号码格式错误: ${number}`
      };
    }
    return { valid: true };
  }

  /**
   * 验证金额信息
   */
  static validateAmounts(invoice) {
    const errors = [];
    const warnings = [];

    // 检查是否有金额
    if (!invoice.amount && !invoice.totalAmount) {
      warnings.push('缺少金额信息');
      return { valid: true, errors, warnings };
    }

    // 验证金额格式
    const amount = this.parseAmount(invoice.amount);
    const taxAmount = this.parseAmount(invoice.taxAmount);
    const totalAmount = this.parseAmount(invoice.totalAmount);

    if (amount !== null && isNaN(amount)) {
      errors.push(`金额格式错误: ${invoice.amount}`);
    }

    if (taxAmount !== null && isNaN(taxAmount)) {
      warnings.push(`税额格式错误: ${invoice.taxAmount}`);
    }

    if (totalAmount !== null && isNaN(totalAmount)) {
      warnings.push(`价税合计格式错误: ${invoice.totalAmount}`);
    }

    // 验证金额逻辑关系
    if (amount !== null && taxAmount !== null && totalAmount !== null) {
      const calculated = parseFloat((amount + taxAmount).toFixed(2));
      const actual = parseFloat(totalAmount);

      // 允许 0.01 的误差
      if (Math.abs(calculated - actual) > 0.01) {
        warnings.push(
          `金额不匹配: ${amount} + ${taxAmount} = ${calculated}, 而总额为 ${actual}`
        );
      }
    }

    // 金额合理性检查
    if (amount !== null && (amount < 0 || amount > 99999999)) {
      warnings.push(`金额异常（超出合理范围）: ${amount}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证购销方信息
   */
  static validatePartyInfo(invoice) {
    const warnings = [];

    // 检查购买方信息
    if (!invoice.buyerName) {
      warnings.push('缺少购买方名称');
    }
    if (!invoice.buyerCode) {
      warnings.push('缺少购买方税号');
    } else if (!/^[0-9A-Z]{18}$/.test(invoice.buyerCode.trim())) {
      warnings.push(`购买方税号格式异常: ${invoice.buyerCode}`);
    }

    // 检查销售方信息
    if (!invoice.sellerName) {
      warnings.push('缺少销售方名称');
    }
    if (!invoice.sellerCode) {
      warnings.push('缺少销售方税号');
    } else if (!/^[0-9A-Z]{18}$/.test(invoice.sellerCode.trim())) {
      warnings.push(`销售方税号格式异常: ${invoice.sellerCode}`);
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  /**
   * 验证校验码格式
   */
  static validateChecksum(checksum) {
    // 校验码通常是 20 位数字或特殊格式
    if (!/^\d{20}/.test(checksum)) {
      return {
        valid: false,
        message: `校验码格式异常: ${checksum}`
      };
    }
    return { valid: true };
  }

  /**
   * 解析金额字符串
   * @param {string|number} amount - 金额字符串或数字
   * @returns {number} 解析后的数字，或 NaN
   */
  static parseAmount(amount) {
    if (!amount) return null;
    if (typeof amount === 'number') return amount;

    // 提取数字部分
    const match = String(amount).match(/[\d.]+/);
    if (match) {
      const parsed = parseFloat(match[0]);
      return isNaN(parsed) ? NaN : parsed;
    }
    return NaN;
  }

  /**
   * 生成改进建议
   */
  static generateSuggestions(invoice, errors, warnings) {
    const suggestions = [];

    // 根据错误类型提供建议
    if (errors.some(e => e.includes('机器编号'))) {
      suggestions.push('检查 PDF 的机器编号字段是否清晰');
    }

    if (warnings.some(w => w.includes('购买方'))) {
      suggestions.push('使用坐标定位功能重新提取购买方信息');
    }

    if (warnings.some(w => w.includes('金额不匹配'))) {
      suggestions.push('验证金额提取的准确性，可能因文本识别错误导致');
    }

    if (warnings.length > 5) {
      suggestions.push('建议手动审查完整的 PDF 文件');
    }

    return suggestions;
  }

  /**
   * 修正常见的识别错误
   * @param {Invoice} invoice - 发票对象
   * @returns {Invoice} 修正后的发票对象
   */
  static correctCommonErrors(invoice) {
    // 修正数字的常见误识别
    if (invoice.machineNumber) {
      invoice.machineNumber = this.correctNumberString(invoice.machineNumber, 12);
    }

    if (invoice.code) {
      invoice.code = this.correctNumberString(invoice.code, 12);
    }

    if (invoice.number) {
      invoice.number = this.correctNumberString(invoice.number, 10);
    }

    // 修正金额
    if (invoice.amount) {
      invoice.amount = this.correctAmountString(invoice.amount);
    }

    if (invoice.taxAmount) {
      invoice.taxAmount = this.correctAmountString(invoice.taxAmount);
    }

    if (invoice.totalAmount) {
      invoice.totalAmount = this.correctAmountString(invoice.totalAmount);
    }

    return invoice;
  }

  /**
   * 修正数字字符串（移除非数字）
   */
  static correctNumberString(str, expectedLength) {
    if (!str) return null;
    const cleaned = String(str).replace(/[^\d]/g, '');
    return cleaned.length === expectedLength ? cleaned : str;
  }

  /**
   * 修正金额字符串
   */
  static correctAmountString(str) {
    if (!str) return null;
    const cleaned = String(str).replace(/[^\d.]/g, '');
    const match = cleaned.match(/^(\d+\.?\d*)$/);
    return match ? match[1] : str;
  }
}

module.exports = InvoiceValidator;
