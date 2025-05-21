const { DocParser } = require('../dist/v2/DocParser');
const path = require('path');

// 获取项目根目录
const projectPath = path.resolve(__dirname, '..');
const parser = new DocParser(projectPath);

// 解析测试文件
const testFile = path.join(__dirname, 'test_templates.js');
parser.parseFile(testFile);

// 输出解析结果
console.log(JSON.stringify(parser.applyFilters(['CLOUD-123', 'CLOUD-789']), null, 2));
