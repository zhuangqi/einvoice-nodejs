const { Invoice } = require('./Invoice');

/**
 * 统一错误处理工具类
 */
class ErrorHandler {
  /**
   * 创建错误发票对象
   * @param {Error|string} error - 错误对象或错误消息
   * @param {string} source - 错误来源（如 'pdf', 'ofd', 'extractor'）
   * @returns {Invoice} 包含错误信息的发票对象
   */
  static createErrorInvoice(error, source = 'unknown') {
    const errorInvoice = new Invoice();
    errorInvoice.title = 'error';
    errorInvoice.type = 'error';
    errorInvoice.extractionError = typeof error === 'string' ? error : error.message;
    errorInvoice.errorSource = source;

    // 保留堆栈信息用于调试
    if (error instanceof Error && error.stack) {
      errorInvoice.errorStack = error.stack;
    }

    // 设置验证结果为无效
    errorInvoice.validationResult = {
      valid: false,
      warnings: [],
      errors: [`提取失败: ${errorInvoice.extractionError}`],
      suggestions: ['请检查文件格式是否正确']
    };

    return errorInvoice;
  }

  /**
   * 安全执行提取操作
   * @param {Function} extractFn - 提取函数
   * @param {Array} args - 函数参数
   * @param {string} source - 错误来源
   * @returns {Invoice} 发票对象（成功或错误）
   */
  static safeExtract(extractFn, args = [], source = 'extractor') {
    try {
      return extractFn(...args);
    } catch (error) {
      console.error(`${source} 提取异常:`, error.message);
      return this.createErrorInvoice(error, source);
    }
  }

  /**
   * 检查是否为错误发票
   * @param {Invoice} invoice - 发票对象
   * @returns {boolean} 是否为错误发票
   */
  static isErrorInvoice(invoice) {
    return invoice && (
      invoice.title === 'error' ||
      invoice.type === 'error' ||
      !!invoice.extractionError ||
      !!invoice.error
    );
  }

  /**
   * 获取错误信息
   * @param {Invoice} invoice - 发票对象
   * @returns {string|null} 错误信息
   */
  static getErrorMessage(invoice) {
    if (!this.isErrorInvoice(invoice)) {
      return null;
    }

    return invoice.extractionError || invoice.error || '未知错误';
  }

  /**
   * 统一格式化错误输出
   * @param {Invoice} invoice - 发票对象
   * @returns {Object} 格式化的错误信息
   */
  static formatError(invoice) {
    if (!this.isErrorInvoice(invoice)) {
      return null;
    }

    return {
      success: false,
      error: this.getErrorMessage(invoice),
      source: invoice.errorSource || 'unknown',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ErrorHandler;