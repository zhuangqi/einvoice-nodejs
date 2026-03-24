#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { extract } = require('../lib/extractor');

const packageJson = require('../package.json');

program.version(packageJson.version).description(packageJson.description);

program
  .argument('<file>', 'PDF or OFD invoice file path')
  .action(async (filePath) => {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      // 检查文件格式
      const ext = path.extname(filePath).toLowerCase();
      if (!['.pdf', '.ofd'].includes(ext)) {
        console.error('Error: Unsupported file format. Only PDF and OFD are supported.');
        process.exit(1);
      }


      // 提取发票信息
      const invoice = await extract(filePath);

      // 输出 JSON
      const jsonOutput = invoice.toJSON();
      // 如果发票有错误信息，也输出
      if (invoice.extractionError) {
        jsonOutput.extractionError = invoice.extractionError;
      }
      if (invoice.error) {
        jsonOutput.error = invoice.error;
      }
      if (invoice.errorStack) {
        jsonOutput.errorStack = invoice.errorStack;
      }
      console.log(JSON.stringify(jsonOutput, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
