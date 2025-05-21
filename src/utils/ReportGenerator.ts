import { BlockUtils } from './BlockUtils';
import { DocItem, DocResult } from '../models/DocModels';

/**
 * 文档报告生成工具类
 */
export class ReportGenerator {
  /**
   * 生成Markdown内容
   * @param result 文档结果对象
   * @returns Markdown字符串
   */
  public static generateMarkdown(result: DocResult): string {
    const lines: string[] = [];
    const processedSections = new Set<string>();

    // 按照需求ID遍历结果
    for (const [reqId, sections] of Object.entries(result)) {
      // 判断是否为BUG修复
      const isBugFix = reqId.match(/^[A-Z]+-\d+$/i) !== null && sections.fix !== undefined;

      if (isBugFix) {
        lines.push(`## 缺陷修复 [${reqId}](https://devops.aliyun.com/projex/bug/${reqId})\n`);
      } else {
        lines.push(`## 需求 [${reqId}](https://devops.aliyun.com/projex/req/${reqId})\n`);
      }

      // 优先处理的章节类型顺序
      const priorityOrder = ['summary', 'testFocus', 'decision', 'feature'];

      // 1. 处理优先章节
      for (const sectionType of priorityOrder) {
        if (sections[sectionType]) {
          const items = sections[sectionType];
          if (!items || items.length < 1) {
            continue;
          }

          const sectionTitle = BlockUtils.getBlockTitle(sectionType);
          lines.push(`### ${sectionTitle}\n`);
          let n = 1;
          for (const item of items) {
            item.sn = n; // 设置序号
            this.appendItemToMarkdown(lines, item, reqId);
            n++;
          }
          processedSections.add(sectionType);
        }
      }

      // 2. 处理其他未被优先处理的章节
      for (const sectionType of Object.keys(sections)) {
        if (processedSections.has(sectionType)) {
          continue;
        }

        const items = sections[sectionType];
        if (items && items.length > 0) {
          const sectionTitle = BlockUtils.getBlockTitle(sectionType);
          lines.push(`### ${sectionTitle}\n`);
          let n = 1;
          for (const item of items) {
            item.sn = n;
            this.appendItemToMarkdown(lines, item, reqId);
            n++;
          }
        }
      }
      processedSections.clear(); // 为下一个 reqId 重置
    }

    return lines.join('\n');
  }

  /**
   * 将文档项添加到Markdown中
   * @param lines 行数组
   * @param item 文档项
   * @param currentReqId 当前需求ID
   */
  private static appendItemToMarkdown(lines: string[], item: DocItem, currentReqId: string): void {
    // 添加标题
    if (item.title) {
      if (item.sn) {
        lines.push(`#### ${item.sn}. ${item.title}\n`);
      } else {
        lines.push(`#### ${item.title}\n`);
      }
    }

    // 创建基本信息行（所属领域和关联需求）
    const headRows: string[] = [];

    let reqLinks: string[] = [];

    // 处理需求ID信息，以表格形式展示并生成链接
    if (item.req && item.req !== currentReqId) { // 不显示当前主需求ID
      let reqs: string[] = [];

      if (typeof item.req === 'string') {
        reqs = [item.req];
      } else if (Array.isArray(item.req)) {
        reqs = item.req;
      }

      if (reqs.length > 0) {
        reqLinks = reqs.map(req => {
          const match = req.match(/^([A-Z]+-\d+)$/i);
          if (match) {
            const reqType = req.includes('BUG-') ? 'bug' : 'req';
            return `[${req}](https://devops.aliyun.com/projex/${reqType}/${req})`;
          }
          return req;
        });
      }
    }

    // 处理领域信息，以表格形式展示
    let domains: string[] = [];
    if (item.domain) {
      if (typeof item.domain === 'string') {
        domains = [item.domain];
      } else if (Array.isArray(item.domain)) {
        domains = item.domain;
      }
    }

    headRows.push(
      `> \`关联需求\`: ${reqLinks.join(', ')}`,
      "",
      `> \`所属领域\`: ${domains.join(', ')}`,
    );

    lines.push(...headRows);
    lines.push('\n');

    // 提取和格式化内容中的字段
    const fields = this.extractFields(item.content);

    // 按照特定顺序显示关键字段
    const keyFieldsOrder = ['context', 'why', 'how', 'risk', 'usecase', 'businessrule', 'checkmethod'];
    this.appendFieldsToMarkdown(lines, fields, keyFieldsOrder);

    // 显示其他非关键字段
    for (const [key, value] of Object.entries(fields)) {
      if (!keyFieldsOrder.includes(key) && key !== 'req' && key !== 'domain') {
        lines.push(`- **${key}**: ${value}`);
      }
    }

    lines.push(`- **注解位置**: \`${item.file}:${item.line}\`\n`);

    // 显示代码片段
    if (item.check_code) {
      this.appendCodeSampleToMarkdown(lines, item);
    }

    lines.push(`---\n`);
  }

  /**
   * 从内容中提取字段
   * @param content 内容字符串
   * @returns 字段映射
   */
  private static extractFields(content: string): { [key: string]: string } {
    if (!content) {
      return {};
    }

    // 使用正则表达式匹配字段行，同时支持英文冒号和中文冒号
    const fieldMatches = content.matchAll(/(?:(?:\/\/|\*)\s*)?-\s+(\w+)[：:]\s*([\s\S]*?)(?=(?:(?:\/\/|\*)\s*)?-\s+\w+[：:]|(?:(?:\/\/|\*)\s*)?@end|\s*\*\/|$)/g);
    const fields: { [key: string]: string } = {};

    for (const fieldMatch of Array.from(fieldMatches)) {
      if (fieldMatch && fieldMatch.length >= 3) {
        const key = fieldMatch[1].toLowerCase().trim();
        // 跳过空key
        if (!key) {
          continue;
        }

        // 获取字段值并预处理
        let value = fieldMatch[2];
        if (!value) {
          continue;
        }

        // 移除行首的注释标记并保留原始缩进
        value = value.replace(/\n(?:(?:\/\/|\*)\s*)?/g, '\n').trim();

        // 标准化缩进和格式
        const lines = value.split('\n');
        if (lines.length > 1) {
          value = lines.map((line) => line.trim()).join('\n');
        } else {
          value = value.trim();
        }

        // 跳过空值
        if (!value) {
          continue;
        }

        fields[key] = value;
      }
    }

    return fields;
  }

  /**
   * 将关键字段添加到Markdown中
   * @param lines 行数组
   * @param fields 字段映射
   * @param keyFieldsOrder 关键字段顺序
   */
  private static appendFieldsToMarkdown(
    lines: string[],
    fields: { [key: string]: string },
    keyFieldsOrder: string[]
  ): void {
    for (const field of keyFieldsOrder) {
      if (fields[field]) {
        let fieldDisplayName = '';
        switch (field) {
          case 'context': fieldDisplayName = '上下文(Context)'; break;
          case 'why': fieldDisplayName = '原因(Why)'; break;
          case 'how': fieldDisplayName = '实现方式(How)'; break;
          case 'risk': fieldDisplayName = '风险点(Risk)'; break;
          case 'case': fieldDisplayName = '案例(Case)'; break;
          case 'usecase': fieldDisplayName = '用例场景(Usecase)'; break;
          case 'businessrule': fieldDisplayName = '业务规则(BusinessRule)'; break;
          case 'checkmethod': fieldDisplayName = '检查方法(CheckMethod)'; break;
          case 'notice': fieldDisplayName = '提示(Notice)'; break;
          default: fieldDisplayName = field;
        }

        // 检查字段值是否包含多行
        const fieldValue = fields[field];
        if (fieldValue.includes('\n')) {
          // 处理多行内容，保持嵌套格式
          const valueLines = fieldValue.split('\n');
          lines.push(`- **${fieldDisplayName}**: ${valueLines[0]}`);

          // 处理剩余行，保留嵌套层级
          for (let i = 1; i < valueLines.length; i++) {
            const line = valueLines[i].trim();
            if (line.startsWith('-')) {
              // 嵌套列表项，增加缩进
              lines.push(`  ${line}`);
            } else if (line) {
              // 普通内容，与上一级对齐
              lines.push(`  ${line}`);
            }
          }
        } else {
          // 单行内容直接添加
          lines.push(`- **${fieldDisplayName}**: ${fieldValue}`);
        }
      }
    }
  }

  /**
   * 将代码示例添加到Markdown中
   * @param lines 行数组
   * @param item 文档项
   */
  private static appendCodeSampleToMarkdown(lines: string[], item: DocItem): void {
    lines.push(`**代码片段**:\n`);

    // 获取代码语言
    const codeLang = item.check_code_language || 'text';
    lines.push(`\`\`\`${codeLang}`);
    if (codeLang === 'php') {
      lines.push(`<?php`);
    }
    lines.push(`// ...existing code...`);

    // 处理代码缩进
    const codeLines = item.check_code!.split('\n');
    if (codeLines.length > 0) {
      // 找出非空行中最小的缩进量
      let minIndent = Number.POSITIVE_INFINITY;
      for (const line of codeLines) {
        if (line.trim()) {  // 忽略空行
          const leadingSpaces = line.length - line.trimStart().length;
          minIndent = Math.min(minIndent, leadingSpaces);
        }
      }

      // 如果找不到有效缩进（所有行都是空行），设为0
      if (minIndent === Number.POSITIVE_INFINITY) {
        minIndent = 0;
      }

      // 删除每行开头的最小缩进量
      for (const line of codeLines) {
        if (line.trim()) {  // 非空行删除共同缩进
          lines.push(`${line.substring(minIndent)}`);
        } else {  // 空行保持空
          lines.push(``);
        }
      }
    }
    lines.push('')
    lines.push(`// ...existing code...`);
    lines.push(`\`\`\`\n`);
  }

  /**
   * 生成JSON内容
   * @param result 文档结果对象
   * @returns JSON字符串
   */
  public static generateJson(result: DocResult): string {
    return JSON.stringify(result, null, 2);
  }
}
