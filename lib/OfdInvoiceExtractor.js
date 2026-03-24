const fs = require('fs');
const JSZip = require('jszip');
const { parseStringPromise } = require('xml2js');
const { Invoice, Detail } = require('./Invoice');
const ErrorHandler = require('./ErrorHandler');

/**
 * OFD 发票提取器
 */
class OfdInvoiceExtractor {
  static async extract(filePath) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(fileBuffer);

      // 读取 XML 文件
      const xmlFile = zip.file('Doc_0/Attachs/original_invoice.xml');
      if (!xmlFile) {
        throw new Error('Missing original_invoice.xml');
      }

      const contentFile = zip.file('Doc_0/Pages/Page_0/Content.xml');
      const xmlContent = await xmlFile.async('string');
      const contentXml = contentFile ? await contentFile.async('string') : '';

      // 解析 XML
      const parsed = await parseStringPromise(xmlContent);
      const root = parsed.invoice || parsed.Invoice || {};

      // 创建发票对象
      const invoice = new Invoice();

      // 提取基础信息
      this.extractFromXml(invoice, root);

      // 从 content.xml 中提取标题
      if (contentXml) {
        const titleMatch = contentXml.match(/<ofd:TextCode[^>]*>([^<]*发票[^<]*)<\/ofd:TextCode>/);
        if (titleMatch) {
          invoice.title = titleMatch[1];
        }

        const amountStringMatch = contentXml.match(/圆整<\/ofd:TextCode>([^<]*)/);
        if (amountStringMatch) {
          invoice.totalAmountString = amountStringMatch[1].substring(0, 2);
        }
      }

      return invoice;
    } catch (error) {
      return ErrorHandler.createErrorInvoice(error, 'ofd');
    }
  }

  static extractFromXml(invoice, root) {
    // 基础信息
    invoice.machineNumber = this.getElementValue(root, 'MachineNo');
    invoice.code = this.getElementValue(root, 'InvoiceCode');
    invoice.number = this.getElementValue(root, 'InvoiceNo');
    invoice.date = this.getElementValue(root, 'IssueDate');
    invoice.checksum = this.getElementValue(root, 'InvoiceCheckCode');

    // 金额
    const amount = this.getElementValue(root, 'TaxExclusiveTotalAmount');
    if (amount) invoice.amount = amount;

    const taxTotalStr = this.getElementValue(root, 'TaxTotalAmount');
    if (taxTotalStr) {
      const taxAmount = StringUtils.extractNumber(taxTotalStr);
      if (taxAmount) invoice.taxAmount = taxAmount;
    }

    const totalAmount = this.getElementValue(root, 'TaxInclusiveTotalAmount');
    if (totalAmount) invoice.totalAmount = totalAmount;

    // 人员信息
    invoice.payee = this.getElementValue(root, 'Payee');
    invoice.reviewer = this.getElementValue(root, 'Checker');
    invoice.drawer = this.getElementValue(root, 'InvoiceClerk');
    invoice.password = this.getElementValue(root, 'TaxControlCode');

    // 发票类型
    const title = this.getElementValue(root, 'InvoiceTitle') || invoice.title;
    if (title) {
      invoice.title = title;
      if (title.includes('专用发票')) {
        invoice.type = '专用发票';
      } else if (title.includes('通行费')) {
        invoice.type = '通行费';
      } else {
        invoice.type = '普通发票';
      }
    }

    // 购方信息
    const buyer = this.getElement(root, 'Buyer');
    if (buyer) {
      invoice.buyerName = this.getElementValue(buyer, 'BuyerName');
      invoice.buyerCode = this.getElementValue(buyer, 'BuyerTaxID');
      invoice.buyerAddress = this.getElementValue(buyer, 'BuyerAddrTel');
      invoice.buyerAccount = this.getElementValue(buyer, 'BuyerFinancialAccount');
    }

    // 销方信息
    const seller = this.getElement(root, 'Seller');
    if (seller) {
      invoice.sellerName = this.getElementValue(seller, 'SellerName');
      invoice.sellerCode = this.getElementValue(seller, 'SellerTaxID');
      invoice.sellerAddress = this.getElementValue(seller, 'SellerAddrTel');
      invoice.sellerAccount = this.getElementValue(seller, 'SellerFinancialAccount');
    }

    // 明细
    const goodsInfos = this.getElement(root, 'GoodsInfos');
    if (goodsInfos) {
      const details = [];
      const items = Array.isArray(goodsInfos['GoodsInfo']) ? goodsInfos['GoodsInfo'] : [goodsInfos['GoodsInfo']];

      if (items) {
        for (const item of items) {
          const detail = new Detail();
          detail.name = this.getElementValue(item, 'Item');
          detail.amount = this.getElementValue(item, 'Amount');
          detail.count = this.getElementValue(item, 'Quantity');
          detail.price = this.getElementValue(item, 'Price');
          detail.unit = this.getElementValue(item, 'MeasurementDimension');
          detail.model = this.getElementValue(item, 'Specification');

          const taxAmountStr = this.getElementValue(item, 'TaxAmount');
          if (taxAmountStr) {
            const taxAmount = StringUtils.extractNumber(taxAmountStr);
            if (taxAmount) detail.taxAmount = taxAmount;
          }

          const taxRateStr = this.getElementValue(item, 'TaxScheme');
          if (taxRateStr) {
            const rateNum = parseInt(taxRateStr.replace('%', ''));
            detail.taxRate = (rateNum / 100).toString();
          }

          details.push(detail);
        }
      }

      invoice.details = details;
    }
  }

  /**
   * 获取 XML element
   */
  static getElement(obj, key) {
    if (!obj || !key) return null;
    return obj[key] ? (Array.isArray(obj[key]) ? obj[key][0] : obj[key]) : null;
  }

  /**
   * 获取 XML element 的文本值
   */
  static getElementValue(obj, key) {
    if (!obj || !key) return null;
    const elem = this.getElement(obj, key);
    if (!elem) return null;
    if (typeof elem === 'string') return elem;
    if (elem._) return elem._;
    return null;
  }
}

module.exports = OfdInvoiceExtractor;
