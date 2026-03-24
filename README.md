# einvoice-cli

电子发票识别 Node.js CLI 工具

支持 PDF 和 OFD 两种电子发票格式识别，输出 JSON 格式的发票信息。

## 📦 安装

```bash
npm install
```

## 🛠️ 使用

### 命令行方式

```bash
node bin/cli.js <pdf_or_ofd_file>

# 或安装全局后
npm install -g .
einvoice /path/to/invoice.pdf
```

### 输出示例

```json
{
  "title": "电子发票（增值税专用发票）",
  "machineNumber": null,
  "code": "35070124",
  "number": "0000600419",
  "date": "2024-12-26",
  "checksum": "EAJfXh",
  "buyerName": "示例科技有限公司",
  "buyerCode": "91350100MA8RXXXXXX",
  "buyerAddress": "福建省福州市鼓楼区示例路123号",
  "buyerAccount": "1234567890123456789",
  "sellerName": "示例行业协会",
  "sellerCode": "51350000MJDXXXXXX",
  "sellerAddress": "福建省福州市鼓楼区示例路456号",
  "sellerAccount": "9876543210987654321",
  "amount": "1000.00",
  "taxAmount": "0",
  "totalAmount": "1000.00",
  "totalAmountString": "壹仟元整",
  "payee": null,
  "reviewer": null,
  "drawer": "示例人员",
  "password": null,
  "type": "financial",
  "details": [
    {
      "name": "单位会员费",
      "model": null,
      "unit": "元",
      "count": "1",
      "price": "1000.00",
      "amount": "1000.00",
      "taxRate": 0,
      "taxAmount": "0"
    }
  ]
}
```

## 📋 支持的发票类型

### 1. 增值税专用发票
- **识别特征**: 包含"电子发票（增值税专用发票）"字样
- **关键字段**: `buyerCode`(购方纳税人识别号), `sellerCode`(销方纳税人识别号), `amount`(金额), `taxAmount`(税额), `totalAmount`(价税合计)
- **示例**: `test4.pdf`

### 2. 普通电子发票
- **识别特征**: 包含"电子发票（普通发票）"字样
- **关键字段**: 与增值税专用发票类似，税率通常为1%、3%、6%、9%、13%等
- **特殊格式**: 支持`*餐饮服务*餐费`等包含星号的项目名称
- **示例**: `test6.pdf`

### 3. 福建省财政票据
- **识别特征**: 包含"福建省社会团体会员费统一收据"字样
- **关键字段**: `code`(票据代码), `number`(票据号码), `checksum`(校验码), `amount`(金额), `totalAmountString`(大写金额)
- **特点**: 无税额(`taxAmount`为0)，明细格式特殊
- **示例**: `test8.pdf`

### 4. 其他发票类型
- **通行费发票**: 包含"通行费"和"车牌号"字样
- **OFD格式发票**: 支持OFD文件格式的电子发票

## ✨ 特性

- ✅ 多类型发票识别（增值税专用发票、普通发票、财政票据等）
- ✅ PDF 和 OFD 双格式支持
- ✅ JSON 格式输出，便于程序处理
- ✅ 字段验证和自动矫正
- ✅ 坐标定位精确提取
- ✅ 多策略降级确保高成功率
- ✅ 无界面，轻量级依赖

## 📚 API 使用

```javascript
const { extractPdf, extractOfd } = require('./lib/extractor');

// 提取 PDF 发票
const invoice = await extractPdf('./invoice.pdf');
console.log(JSON.stringify(invoice, null, 2));

// 提取 OFD 发票
const invoice = await extractOfd('./invoice.ofd');
console.log(JSON.stringify(invoice, null, 2));
```

## 🏗️ 项目结构

```
einvoice-nodejs/
├── bin/
│   └── cli.js              # 命令行入口
├── lib/
│   ├── extractor.js        # 主提取器
│   ├── Invoice.js          # 数据模型
│   ├── RegexPatterns.js    # 正则优化库
│   ├── PDFTextPositionAnalyzer.js # 坐标定位引擎
│   ├── InvoiceValidator.js # 验证框架
│   ├── PdfRegularInvoiceService.js # 普通发票服务
│   ├── PdfFullElectronicInvoiceService.js # 全电发票服务
│   ├── PdfFinancialInvoiceService.js # 财政票据服务
│   ├── PdfInvoiceExtractor.js # PDF 加载器
│   ├── OfdInvoiceExtractor.js # OFD 提取器
│   └── StringUtils.js      # 字符串工具
├── package.json
├── README.md               # 项目文档
└── .gitignore
```

## 📄 许可证

MIT License
