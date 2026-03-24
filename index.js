/**
 * index.js - 主入口模块
 * 可以直接在 Node.js 中导入使用
 */

const { extract, extractPdf, extractOfd } = require('./lib/extractor');
const { Invoice, Detail } = require('./lib/Invoice');

module.exports = {
  // 主要 API
  extract,           // 自动识别文件格式
  extractPdf,        // 专门处理 PDF
  extractOfd,        // 专门处理 OFD
  
  // 数据模型（如果需要扩展）
  Invoice,
  Detail,
};

// 使用示例
// const einvoice = require('./index');
// const invoice = await einvoice.extract('./invoice.pdf');
// console.log(invoice.toJSON());
