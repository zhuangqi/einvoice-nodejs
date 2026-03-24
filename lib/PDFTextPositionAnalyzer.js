/**
 * PDF 文本位置分析器
 * 用于坐标定位，提取明细行等
 */

class PDFTextPositionAnalyzer {
  /**
   * 初始化
   * @param {Array} items - PDF.js 提取的文本项数组
   */
  constructor(items) {
    this.items = items || [];
    this.keywordPositions = new Map(); // 关键词位置缓存
    this.buildKeywordIndex();
  }

  /**
   * 构建关键词索引
   */
  buildKeywordIndex() {
    const keywords = [
      '机器编号', '税率', '价税合计', '合计', '开票日期',
      '规格型号', '车牌号', '开户行及账号', '开户行', '账号',
      '购买方', '销售方', '名称', '纳税人', '地址', '电话',
      '密', '码', '区', '校验码', '发票代码', '发票号码'
    ];

    keywords.forEach(keyword => {
      const positions = this.findKeywordPositions(keyword);
      if (positions.length > 0) {
        this.keywordPositions.set(keyword, positions);
      }
    });
  }

  /**
   * 查找关键词位置
   * @param {string} keyword - 关键词
   * @returns {Array} 位置数组 [{x, y, text}]
   */
  findKeywordPositions(keyword) {
    const positions = [];
    
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      
      // 检查当前项是否包含关键词的开始
      if (item.text.includes(keyword.charAt(0))) {
        // 尝试从当前位置开始匹配整个关键词
        let matchedText = '';
        let j = i;
        
        while (j < this.items.length && matchedText.length < keyword.length) {
          matchedText += this.items[j].text;
          j++;
        }
        
        if (matchedText.includes(keyword)) {
          positions.push({
            x: item.x,
            y: item.y,
            startIndex: i,
            endIndex: j - 1,
            text: keyword
          });
        }
      }
    }
    
    return positions;
  }

  /**
   * 获取关键词位置
   * @param {string} keyword - 关键词
   * @returns {Array} 位置数组
   */
  getKeywordPosition(keyword) {
    return this.keywordPositions.get(keyword) || [];
  }

  /**
   * 检测明细行区域
   * @returns {object} {top, bottom, left, right}
   */
  detectDetailsRegion() {
    const taxRatePos = this.getKeywordPosition('税率');
    const totalPos = this.getKeywordPosition('价税合计');
    const amountPos = this.getKeywordPosition('合计');

    // 尝试查找表头行
    const headers = this.findDetailHeaders();

    if (taxRatePos.length === 0 || amountPos.length === 0) {
      // 无法定位明细区域 - 缺少关键定位点
      return null;
    }

    const taxY = taxRatePos[0].y;
    const amountY = amountPos[0].y;

    // 计算明细区域的边界
    const region = {
      top: headers.length > 0 ? headers[0].y + 15 : taxY + 5,
      bottom: amountY - 30,
      left: 0,
      right: 600,
      height: amountY - (headers.length > 0 ? headers[0].y + 15 : taxY + 5) - 30
    };

    return region;
  }

  /**
   * 查找明细表头位置
   */
  findDetailHeaders() {
    const headers = [];
    const headerKeywords = ['货物', '劳务', '服务名称', '规格型号', '单位', '数量', '单价', '金额'];

    for (const keyword of headerKeywords) {
      const positions = this.getKeywordPosition(keyword);
      if (positions.length > 0) {
        headers.push(...positions);
      }
    }

    return headers;
  }

  /**
   * 检测购销方信息区域
   * @returns {object} {buyer: {...}, seller: {...}}
   */
  detectPartyRegions() {
    // 尝试查找"购买方"和"销售方"标签位置（最准确）
    const buyerLabelPos = this.getKeywordPosition('购买方');
    const sellerLabelPos = this.getKeywordPosition('销售方');

    if (buyerLabelPos.length > 0 && sellerLabelPos.length > 0) {
      const buyerLabel = buyerLabelPos[0];
      const sellerLabel = sellerLabelPos[0];

      return {
        buyer: {
          x: buyerLabel.x - 10,
          y: buyerLabel.y - 100, // Y 向上增长，内容在标签下方
          width: 350,
          height: 110
        },
        seller: {
          x: sellerLabel.x - 10,
          y: sellerLabel.y - 100,
          width: 350,
          height: 110
        }
      };
    }

    // 备选方案：使用"名称"和"纳税人识别号"组合定位
    const names = this.getKeywordPosition('名称').filter(pos => {
      // 排除明细表头中的"名称"（通常包含"服务"、"项目"、"货物"等）
      const itemText = this.items[pos.startIndex].text;
      const surroundingText = this.items.slice(Math.max(0, pos.startIndex - 5), Math.min(this.items.length, pos.endIndex + 5))
        .map(i => i.text).join('');
      return !surroundingText.includes('服务名称') && !surroundingText.includes('项目名称') && !surroundingText.includes('货物');
    });

    const taxIds = this.getKeywordPosition('纳税人');

    console.log('DEBUG: 过滤后的名称位置:', names.map(n => ({ x: n.x, y: n.y })));
    console.log('DEBUG: 纳税人识别号位置:', taxIds.map(t => ({ x: t.x, y: t.y })));

    if (names.length >= 2) {
      // 按照 Y 坐标排序（PDF 坐标系中 Y 越大位置越高，购买方在上，销售方在下）
      const sortedNames = [...names].sort((a, b) => b.y - a.y);
      
      return {
        buyer: {
          x: sortedNames[0].x - 20,
          y: sortedNames[0].y - 50, // 覆盖名称标签所在的行及上下区域
          width: 350,
          height: 100
        },
        seller: {
          x: sortedNames[sortedNames.length - 1].x - 20,
          y: sortedNames[sortedNames.length - 1].y - 50,
          width: 350,
          height: 100
        }
      };
    }

    // 最后手段：使用硬编码的相对比例位置（根据页面边界，Y 大者在上）
    const bounds = this.getBounds();
    const pageHeight = bounds.maxY - bounds.minY;
    
    return {
      buyer: {
        x: bounds.minX + 50,
        y: bounds.minY + pageHeight * 0.65, // 靠近顶部
        width: 350,
        height: 100
      },
      seller: {
        x: bounds.minX + 50,
        y: bounds.minY + pageHeight * 0.15, // 靠近底部
        width: 350,
        height: 100
      }
    };
  }

  /**
   * 获取矩形区域内的文本
   * @param {object} region - {x, y, width, height}
   * @returns {string} 该区域内的文本
   */
  getTextInRegion(region) {
    if (!region) return '';

    const textItems = this.items.filter(item => {
      return item.x >= region.x &&
        item.x <= region.x + region.width &&
        item.y >= region.y &&
        item.y <= region.y + region.height;
    });

    // 按 y 坐标分组为行，然后按 x 坐标排序
    const lines = {};
    textItems.forEach(item => {
      const y = Math.round(item.y / 10) * 10; // 四舍五入到最近的 10
      if (!lines[y]) lines[y] = [];
      lines[y].push(item);
    });

    // 合并文本
    const sortedYs = Object.keys(lines).sort((a, b) => a - b);
    return sortedYs.map(y => {
      return lines[y]
        .sort((a, b) => a.x - b.x)
        .map(item => item.text)
        .join('');
    }).join('\n');
  }

  /**
   * 获取行分隔的文本
   * @param {object} region - {x, y, width, height}
   * @returns {Array<string>} 按行分割的文本
   */
  getTextLinesInRegion(region) {
    if (!region) return [];

    const textItems = this.items.filter(item => {
      return item.x >= region.x &&
        item.x <= region.x + region.width &&
        item.y >= region.y &&
        item.y <= region.y + region.height;
    });

    // 按 y 坐标分组为行
    const lines = {};
    textItems.forEach(item => {
      const y = Math.round(item.y / 5) * 5; // 更精细的分组
      if (!lines[y]) lines[y] = [];
      lines[y].push(item);
    });

    // 合并并返回
    const sortedYs = Object.keys(lines).sort((a, b) => Number(a) - Number(b));
    return sortedYs.map(y => {
      return lines[y]
        .sort((a, b) => a.x - b.x)
        .map(item => item.text)
        .join('');
    });
  }

  /**
   * 获取文本项的坐标范围
   * @returns {object} {minX, maxX, minY, maxY}
   */
  getBounds() {
    if (this.items.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.items.forEach(item => {
      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x);
      minY = Math.min(minY, item.y);
      maxY = Math.max(maxY, item.y);
    });

    return { minX, maxX, minY, maxY };
  }

  /**
   * 查找密码区位置
   * @returns {object} {x, y} 或 null
   */
  findPasswordRegion() {
    const miPos = this.getKeywordPosition('密');
    const maPos = this.getKeywordPosition('码');
    const quPos = this.getKeywordPosition('区');

    if (miPos.length === 0 || maPos.length === 0 || quPos.length === 0) {
      return null;
    }

    // 找到对齐的密码区
    let maqX = null;
    for (let i = 0; i < miPos.length; i++) {
      const x1 = miPos[i].x;
      for (let j = 0; j < maPos.length; j++) {
        const x2 = maPos[j].x;
        if (Math.abs(x1 - x2) < 5) {
          for (let k = 0; k < quPos.length; k++) {
            const x3 = quPos[k].x;
            if (Math.abs(x2 - x3) < 5) {
              maqX = (x1 + x2 + x3) / 3;
              break;
            }
          }
        }
        if (maqX) break;
      }
      if (maqX) break;
    }

    if (maqX === null) {
      maqX = 370; // 默认值
    }

    const machineNum = this.getKeywordPosition('机器编号');
    const taxRate = this.getKeywordPosition('税率');

    return {
      x: maqX + 10,
      y: machineNum.length > 0 ? machineNum[0].y + 10 : 0,
      width: 100,
      height: taxRate.length > 0 ? taxRate[0].y - (machineNum.length > 0 ? machineNum[0].y : 0) - 5 : 100
    };
  }

  /**
   * 获取所有单一字符的位置（用于细粒度分析）
   * @param {string} char - 单个字符
   * @returns {Array} 位置数组
   */
  findCharPositions(char) {
    return this.items
      .filter(item => item.text === char)
      .map((item, idx) => ({
        x: item.x,
        y: item.y,
        index: idx
      }));
  }
}

module.exports = PDFTextPositionAnalyzer;
