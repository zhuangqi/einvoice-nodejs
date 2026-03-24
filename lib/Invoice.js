/**
 * 发票类
 */
class Invoice {
  constructor() {
    // 基础信息
    this.title = null;
    this.type = null;

    // 发票编号相关
    this.machineNumber = null;
    this.code = null;
    this.number = null;
    this.date = null;
    this.checksum = null;

    // 购买方信息
    this.buyerName = null;
    this.buyerCode = null;
    this.buyerAddress = null;
    this.buyerAccount = null;

    // 销售方信息
    this.sellerName = null;
    this.sellerCode = null;
    this.sellerAddress = null;
    this.sellerAccount = null;

    // 金额相关
    this.amount = null;
    this.taxAmount = null;
    this.totalAmount = null;
    this.totalAmountString = null;

    // 签章信息
    this.payee = null;
    this.reviewer = null;
    this.drawer = null;
    this.password = null;

    // 明细
    this.details = [];
    
    // 错误信息
    this.error = null;
  }

  toJSON() {
    return {
      title: this.title,
      machineNumber: this.machineNumber,
      code: this.code,
      number: this.number,
      date: this.date,
      checksum: this.checksum,
      buyerName: this.buyerName,
      buyerCode: this.buyerCode,
      buyerAddress: this.buyerAddress,
      buyerAccount: this.buyerAccount,
      sellerName: this.sellerName,
      sellerCode: this.sellerCode,
      sellerAddress: this.sellerAddress,
      sellerAccount: this.sellerAccount,
      amount: this.amount,
      taxAmount: this.taxAmount,
      totalAmount: this.totalAmount,
      totalAmountString: this.totalAmountString,
      payee: this.payee,
      reviewer: this.reviewer,
      drawer: this.drawer,
      password: this.password,
      type: this.type,
      details: this.details,
      ...(this.error && { error: this.error }),
    };
  }
}

/**
 * 发票明细类
 */
class Detail {
  constructor() {
    this.name = '';
    this.model = null;
    this.unit = null;
    this.count = null;
    this.price = null;
    this.amount = null;
    this.taxRate = null;
    this.taxAmount = null;
  }

  toJSON() {
    return {
      name: this.name,
      model: this.model,
      unit: this.unit,
      count: this.count,
      price: this.price,
      amount: this.amount,
      taxRate: this.taxRate,
      taxAmount: this.taxAmount,
    };
  }
}

module.exports = { Invoice, Detail };
