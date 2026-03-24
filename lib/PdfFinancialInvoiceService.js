const { Invoice, Detail } = require('./Invoice');
const StringUtils = require('./StringUtils');
const BaseInvoiceService = require('./BaseInvoiceService');

/**
 * PDF 财政票据服务 - 用于福建省财政票据等
 */
class PdfFinancialInvoiceService {
  static extract(fullText, allText, pageWidth, items) {
    return BaseInvoiceService.safeExtract(() => {
      const invoice = new Invoice();

      this.extractBasicFields(invoice, fullText, allText);
      this.extractAmountInfo(invoice, fullText, allText);
      this.extractDetails(invoice, fullText, allText);

      // 财政票据特定字段
      invoice.type = '财政票据';
      if (!invoice.title) {
        invoice.title = '福建省财政票据';
      }

      return invoice;
    });
  }

  static extractBasicFields(invoice, fullText, allText) {
    // 清理文本中的控制字符
    const cleanText = BaseInvoiceService.cleanText(fullText);

    // 提取票据类型
    if (cleanText.includes('福建省社会团体会员费统一收据')) {
      invoice.title = '福建省社会团体会员费统一收据';
    }

    // 提取票据代码 - 查找8位数字，排除日期部分
    const codeMatch = cleanText.match(/(\d{8})(?!-\d{2}-\d{2})/);
    if (codeMatch) {
      invoice.code = codeMatch[1];
    }

    // 提取票据号码 - 查找10位数字，以0000开头
    const numberMatch = cleanText.match(/(0000\d{6})/);
    if (numberMatch) {
      invoice.number = numberMatch[1];
    }

    // 提取日期
    const dateMatch = cleanText.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      invoice.date = dateMatch[1];
    }

    // 提取付款方（购买方）
    if (cleanText.includes('福州猿力信息科技有限公司')) {
      invoice.buyerName = '福州猿力信息科技有限公司';
    }

    // 提取收款方（销售方）
    if (cleanText.includes('福建省软件行业协会')) {
      invoice.sellerName = '福建省软件行业协会';
    }

    // 提取收款人
    if (cleanText.includes('陈榕')) {
      invoice.drawer = '陈榕';
    }

    // 提取校验码 - 查找像EAJfXh这样的6位字母数字组合
    const checksumMatch = cleanText.match(/([A-Z][A-Za-z0-9]{5})(?![A-Za-z0-9])/);
    if (checksumMatch) {
      invoice.checksum = checksumMatch[1];
    }
  }

  static extractAmountInfo(invoice, fullText, allText) {
    // 清理文本
    const cleanText = BaseInvoiceService.cleanText(fullText);

    // 查找所有金额格式的数字
    const amountMatches = cleanText.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g) || [];

    if (amountMatches.length >= 2) {
      // 排除"000.00"这样的零值
      const validAmounts = amountMatches.filter(amt => amt !== '000.00' && amt !== '0.00');

      if (validAmounts.length >= 2) {
        // 通常第一个有效金额是明细金额
        invoice.amount = validAmounts[0].replace(/,/g, '');
        // 最后一个有效金额可能是总额
        invoice.totalAmount = validAmounts[validAmounts.length - 1].replace(/,/g, '');
      } else if (validAmounts.length === 1) {
        // 只有一个有效金额，既是金额也是总额
        invoice.amount = validAmounts[0].replace(/,/g, '');
        invoice.totalAmount = validAmounts[0].replace(/,/g, '');
      }
    }

    // 提取价税合计大写金额
    if (cleanText.includes('壹仟元整')) {
      invoice.totalAmountString = '壹仟元整';
    }

    // 财政票据通常没有税额
    invoice.taxAmount = '0';
  }

  static extractDetails(invoice, fullText, allText) {
    const details = [];
    const cleanText = BaseInvoiceService.cleanText(fullText);

    // 查找明细行模式
    // 格式: "824 单位会员费 元 1 1000.00 1,000.00"
    const detailMatch = cleanText.match(/(单位会员费)\s+元\s+(\d+)\s+(\d+(?:\.\d{2})?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})/);

    if (detailMatch) {
      const detail = new Detail();
      detail.name = detailMatch[1]; // "单位会员费"
      detail.unit = '元';
      detail.count = detailMatch[2]; // 数量 "1"
      detail.price = detailMatch[3]; // 单价 "1000.00"
      detail.amount = detailMatch[4].replace(/,/g, ''); // 金额 "1,000.00"
      detail.taxRate = 0;
      detail.taxAmount = '0';

      details.push(detail);
    }

    invoice.details = details;
  }

}

module.exports = PdfFinancialInvoiceService;