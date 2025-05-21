/**
 * 简单测试脚本 - 用于测试正则表达式匹配
 */

// 定义测试用例 - 包含不同格式的注释
const testCases = [
  // 单行注释格式 @summary
  '// @summary(CLOUD-123) 购物车本地缓存方案\n//  - context: 购物车数据需要在多个页面共享\n// @endSummary',

  // docblock 格式 @summary
  '/**\n * @summary(CLOUD-111) 订单处理服务\n *  - context: 订单计算和验证\n * @endSummary\n */',

  // 单行注释格式 @decision
  '// @decision 选择使用 RESTful API\n//  - why: 因为更易于开发\n// @endDecision',

  // docblock 格式 @decision
  '/**\n * @decision 选择使用 RESTful API\n *  - why: 因为更易于开发\n * @endDecision\n */',

  // 单行注释格式 @fix
  '// @fix(BUG-456) 修复订单金额计算错误\n//  - why: 计算顺序错误\n// @endFix',

  // docblock 格式 @fix
  '/**\n * @fix(BUG-111) 账户锁定剩余时间计数问题\n *  - why: 需要确保锁定时间正确释放\n * @endFix\n */'
];

// 定义正则表达式 - 从修改后的代码复制
const regexPatterns = [
  // Summary 模式
  /(?:^|\n)\s*(?:\/\/|\*)\s*@summary\((.*?)\)([\s\S]*?)(?:^|\n)\s*(?:\/\/|\*)\s*@endSummary/g,

  // Decision 模式
  /(?:^|\n)\s*(?:\/\/|\*)\s*@decision\s+(.*?)(?:\r?\n)([\s\S]*?)(?:^|\n)\s*(?:\/\/|\*)\s*@endDecision/g,

  // Fix 模式
  /(?:^|\n)\s*(?:\/\/|\*)\s*@fix\((.*?)\)([\s\S]*?)(?:^|\n)\s*(?:\/\/|\*)\s*@endFix/g
];

// 测试每个正则表达式对每个测试用例
console.log('开始测试正则表达式匹配...\n');

for (let i = 0; i < regexPatterns.length; i++) {
  console.log(`\n===== 正则表达式 ${i + 1} ======`);
  console.log(regexPatterns[i]);

  for (let j = 0; j < testCases.length; j++) {
    console.log(`\n-- 测试用例 ${j + 1} --`);
    console.log(testCases[j]);

    // 创建新的正则实例 (重置内部状态)
    const regex = new RegExp(regexPatterns[i].source, regexPatterns[i].flags);
    const matches = testCases[j].match(regex);

    if (matches) {
      console.log('\n匹配成功!');
      console.log(`匹配数量: ${matches.length}`);

      // 对每个匹配进行详细检查
      let match;
      while ((match = regex.exec(testCases[j])) !== null) {
        console.log('\n匹配详情:');
        console.log(`完整匹配: "${match[0]}"`);
        for (let k = 1; k < match.length; k++) {
          console.log(`捕获组 ${k}: "${match[k]}"`);
        }
      }
    } else {
      console.log('\n未匹配');
    }
  }
}

console.log('\n测试完成');
