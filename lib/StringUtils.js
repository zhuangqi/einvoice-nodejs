/**
 * 字符串工具类
 */
class StringUtils {
  /**
   * 规范化字符串 - 移除空格和特殊符号
   */
  static normalize(str) {
    if (!str) return '';
    return str
      .replace(/\s+/g, '')
      .replace(/　+/g, '')
      .replace(/：/g, ':')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/￥/g, '¥');
  }

  /**
   * 规范化为单个空格和去除前后空格
   */
  static replace(str) {
    if (!str) return '';
    return str
      .replace(/\s+/g, ' ')
      .replace(/　+/g, ' ')
      .trim();
  }

  /**
   * 去除空白字符
   */
  static trim(str) {
    if (!str) return '';
    return str.trim();
  }

  /**
   * 判断是否为空或仅包含空白字符
   */
  static isBlank(str) {
    return !str || str.trim().length === 0;
  }

  /**
   * 判断是否不为空
   */
  static isNotBlank(str) {
    return !StringUtils.isBlank(str);
  }

  /**
   * 分割字符串
   */
  static split(str, separator = ' ') {
    if (!str) return [];
    return str.split(separator).filter((s) => s.length > 0);
  }

  /**
   * 提取数字
   */
  static extractNumber(str) {
    if (!str) return null;
    const match = str.match(/-?\d+(\.\d+)?/);
    return match ? match[0] : null;
  }
}

module.exports = StringUtils;
