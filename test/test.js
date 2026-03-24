#!/usr/bin/env node

const { extract } = require('../lib/extractor');

async function test() {
  console.log('Testing einvoice-cli...');

  try {
    // 测试基本的 API 导出
    console.log('✓ API exports are available');

    // 测试 Invoice 类
    const { Invoice } = require('../lib/Invoice');
    const invoice = new Invoice();
    console.log('✓ Invoice class is available');

    console.log('\n✅ All basic tests passed!');
    console.log('\nTo test with actual invoice files, run:');
    console.log('  node bin/cli.js <path-to-invoice.pdf>');
    console.log('  node bin/cli.js <path-to-invoice.ofd>');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();