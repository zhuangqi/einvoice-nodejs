/**
 * 统一的发票提取器入口
 */
const PdfInvoiceExtractor = require('./PdfInvoiceExtractor');
const OfdInvoiceExtractor = require('./OfdInvoiceExtractor');
const ErrorHandler = require('./ErrorHandler');

async function extract(filePath) {
  return ErrorHandler.safeExtract(async () => {
    if (filePath.toLowerCase().endsWith('.ofd')) {
      return OfdInvoiceExtractor.extract(filePath);
    } else if (filePath.toLowerCase().endsWith('.pdf')) {
      return PdfInvoiceExtractor.extract(filePath);
    } else {
      throw new Error('Unsupported file format. Only PDF and OFD are supported.');
    }
  }, [], 'extractor');
}

module.exports = {
  extract,
  extractPdf: PdfInvoiceExtractor.extract,
  extractOfd: OfdInvoiceExtractor.extract,
};
