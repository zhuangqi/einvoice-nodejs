const fs = require('fs');
const pdfjs = require('pdfjs-dist/build/pdf');
const { Invoice } = require('./Invoice');
const PdfRegularInvoiceService = require('./PdfRegularInvoiceService');
const PdfFullElectronicInvoiceService = require('./PdfFullElectronicInvoiceService');
const PdfFinancialInvoiceService = require('./PdfFinancialInvoiceService');
const StringUtils = require('./StringUtils');
const ErrorHandler = require('./ErrorHandler');

// 设置 worker - Node.js 环境
const path = require('path');
pdfjs.GlobalWorkerOptions.workerSrc = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'build/pdf.worker.js'
);

/**
 * PDF 发票提取器
 */
class PdfInvoiceExtractor {
  static async extract(filePath) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      // 转换 Buffer 为 Uint8Array
      const pdfData = new Uint8Array(fileBuffer);
      
      // 配置 PDF.js 参数
      const pdfjsOptions = {
        data: pdfData,
        cMapUrl: path.join(
          path.dirname(require.resolve('pdfjs-dist/package.json')),
          'cmaps/'
        ),
        cMapPacked: true,
        standardFontDataUrl: path.join(
          path.dirname(require.resolve('pdfjs-dist/package.json')),
          'standard_fonts/'
        ),
      };
      
      const pdf = await pdfjs.getDocument(pdfjsOptions).promise;

      // 只处理第一页
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      const pageWidth = Math.round(page.view[2]);

      // 获取所有文本 - 按行分组重建文本结构
      let fullText = '';
      const items = [];

      // 按Y坐标排序文本项（从上到下）
      const sortedItems = textContent.items
        .filter(item => item.str && item.str.trim())
        .sort((a, b) => b.transform[5] - a.transform[5]); // Y坐标从大到小

      // 按行分组（Y坐标相近的视为同一行）
      const lines = [];
      let currentLine = [];
      let lastY = null;

      for (const item of sortedItems) {
        const y = Math.round(item.transform[5]);
        if (lastY === null || Math.abs(y - lastY) > 5) { // 5像素容差
          if (currentLine.length > 0) {
            lines.push(currentLine);
          }
          currentLine = [item];
          lastY = y;
        } else {
          currentLine.push(item);
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }

      // 在每行内按X坐标排序并拼接
      for (const line of lines) {
        line.sort((a, b) => a.transform[4] - b.transform[4]); // X坐标从小到大

        let lineText = '';
        for (const item of line) {
          if (lineText && !lineText.endsWith(' ') && !item.str.startsWith(' ')) {
            lineText += ' ';
          }
          lineText += item.str;

          items.push({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
          });
        }

        if (fullText && !fullText.endsWith('\n')) {
          fullText += '\n';
        }
        fullText += lineText;
      }

      // 规范化文本
      let allText = StringUtils.normalize(fullText)
        .replace(/（/g, '(')
        .replace(/）/g, ')')
        .replace(/￥/g, '¥');

      // 判断发票类型
      if (allText.includes('福建省社会团体会员费统一收据') || allText.includes('财政票据')) {
        return PdfFinancialInvoiceService.extract(fullText, allText, pageWidth, items);
      } else if (allText.includes('电子发票')) {
        return PdfFullElectronicInvoiceService.extract(fullText, allText, pageWidth, items);
      } else {
        return PdfRegularInvoiceService.extract(fullText, allText, pageWidth, items);
      }
    } catch (error) {
      return ErrorHandler.createErrorInvoice(error, 'pdf');
    }
  }
}

module.exports = PdfInvoiceExtractor;
