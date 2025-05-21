import * as path from 'path';
import { DocItem, DocResult } from '../models/DocModels';
import { FileUtils } from './FileUtils';

/**
 * 注释块解析器接口
 */
export interface BlockParser {
  pattern: RegExp;
  parse(match: RegExpExecArray, content: string, filePath: string, projectPath: string, lines: string[]): {
    blockType: string;
    reqId: string;
    item: DocItem;
  };
}

class BlockTypeSet extends Map<string, string> {
  public listStandardTypes() {
    return Array.from(this.keys()).filter(type => type !== 'fix' && type !== 'summary');
  }
  public listIdentifiableTypes() {
    return ['summary', 'fix'];
  }
}

/**
 * 注释块解析工具类
 */
export class BlockUtils {
  public static blockTypeSet = new BlockTypeSet([
    ['summary', '📝 方案概要'],
    ['fix', '🐛 BUG修复'],
    ['decision', '🔍 决策点'],
    ['testFocus', '🧪 测试重点'],
    ['feature', '✨ 功能点'],
    ['notice', '❕ 注意'],
    ['comment', '💬 备注'],
    ['deployment', '🚀 部署说明'],
    ['performance', '⚡ 性能考虑'],
    ['security', '🔒 安全考虑'],
    ['deprecated', '⚠️ 弃用'],
  ]);

  /**
   * 解析需求ID列表
   * @param content 内容
   * @param defaultId 默认ID
   * @returns 需求ID信息
   */
  public static parseReqIds(content: string, defaultId: string): {
    reqId: string,
    reqIds: string[]
  } {
    // 同时支持带注释标记(//或*)和不带注释标记的格式
    const reqMatch = content.match(/(?:(?:\/\/|\*)\s*)?-\s+req:\s*(.*?)(?=(?:(?:\/\/|\*)\s*)?\n|-\s+\w+:|\s*\*\/|$)/i);
    let reqId = defaultId; // 默认值
    let reqIds: string[] = [];

    if (reqMatch && reqMatch[1]) {
      const reqContent = reqMatch[1].trim();
      // 提取所有需求ID并存储到数组中
      const reqIdMatches = reqContent.match(/[A-Z]+-\d+/gi);
      if (reqIdMatches && reqIdMatches.length > 0) {
        reqIds = reqIdMatches;
        reqId = reqIdMatches[0]; // 保留第一个ID作为主键
      } else {
        // 如果没有找到格式化的需求ID，则按照逗号分割
        const splitIds = reqContent.split(/[,，]/).map(item => item.trim()).filter(Boolean);
        if (splitIds.length > 0) {
          reqIds = splitIds;
          reqId = splitIds[0];
        }
      }
    }

    // 确保单个ID也会被添加到reqIds数组中
    if (reqIds.length === 0 && reqId !== defaultId) {
      reqIds.push(reqId);
    }

    return { reqId, reqIds };
  }

  /**
   * 解析领域信息
   * @param content 内容
   * @returns 领域数组
   */
  public static parseDomains(content: string): string[] {
    // 同时支持带注释标记(//或*)和不带注释标记的格式
    const domainMatch = content.match(/(?:(?:\/\/|\*)\s*)?-\s+domain:\s*(.*?)(?=(?:(?:\/\/|\*)\s*)?\n|-\s+\w+:|\s*\*\/|$)/i);
    if (domainMatch && domainMatch[1]) {
      const domainContent = domainMatch[1].trim();
      // 按中英文逗号分割，并去除每个项目的前后空格
      return domainContent.split(/[,，]/).map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * 提取注释块的标题
   * @param content 内容
   * @returns 标题
   */
  public static extractTitle(content: string): string {
    const titleMatch = content.match(/^\s*(?:\/\/|\*)\s*(.*?)(?:\n|$)/);
    return titleMatch ? titleMatch[1].trim() : '';
  }

  /**
   * 向结果对象添加文档项
   * @param result 结果对象
   * @param reqId 需求ID
   * @param blockType 块类型
   * @param item 文档项
   */
  public static addToResult(result: DocResult, reqId: string, blockType: string, item: DocItem): void {
    if (!result[reqId]) {
      result[reqId] = {};
    }

    if (!result[reqId][blockType]) {
      result[reqId][blockType] = [];
    }

    result[reqId][blockType].push(item);
  }

  /**
   * 创建所有支持的注释块解析器
   * @returns 解析器列表
   */
  public static createBlockParsers(): BlockParser[] {
    return [
      ...this.blockTypeSet
        .listIdentifiableTypes()
        .map(tag => BlockUtils.createIdentifiableParser(tag)),

      ...this.blockTypeSet
        .listStandardTypes()
        .map(tag => BlockUtils.createStandardParser(tag)),
    ];
  }

  /**
   * 清理注释内容，移除每行前面的注释标记和额外空格
   * @param content 包含注释标记的内容
   * @returns 清理后的内容
   */
  public static cleanCommentContent(content: string): string {
    if (!content) return '';

    // 按行分割内容
    const lines = content.split(/\r?\n/);

    // 清理每行内容
    const cleanedLines = lines.map(line => {
      // 移除行首的注释标记和空格（同时支持//和*注释标记）
      return line.replace(/^\s*(?:\/\/|\*)\s*/, '');
    });

    // 重新组合内容
    return cleanedLines.join('\n');
  }

  public static getNormalParseFunction() {
    return (content: string, filePath: string, projectPath: string, lines: string[]) => {
      const parsers = BlockUtils.createBlockParsers();
      const result: DocResult = {};

      for (const parser of parsers) {
        const regex = new RegExp(parser.pattern.source, parser.pattern.flags);
        let match;

        // 重置正则表达式状态
        while ((match = regex.exec(content)) !== null) {
          const { blockType, reqId, item } = parser.parse(match, content, filePath, projectPath, lines);
          BlockUtils.addToResult(result, reqId, blockType, item);
        }
      }

      return result;
    };
  }

  /**
   * 获取章节标题
   * @param blockType 章节类型
   * @returns 格式化的章节标题
   */
  public static getBlockTitle(blockType: string): string {
    return this.blockTypeSet.get(blockType) || blockType;
  }

  /**
   * 解析注释块的通用细节
   * @param match 正则匹配结果
   * @param content 文件内容
   * @param filePath 文件路径
   * @param projectPath 项目路径
   * @param lines 文件行数组
   * @param needsCheckCode 是否需要提取检查代码
   * @returns 包含部分 DocItem 和内部内容的对象
   */
  private static _parseBlockDetails(
    match: RegExpExecArray,
    content: string,
    filePath: string,
    projectPath: string,
    lines: string[],
    needsCheckCode: boolean
  ): { partialItem: Omit<DocItem, 'req' | 'title' | 'content'> } {
    // 计算起始行号
    const startIndex = match.index || 0;
    const lineNumber = content.substring(0, startIndex).split(/\r?\n/).length;

    const relativeFilePath = path.relative(projectPath, filePath);

    const partialItem: Omit<DocItem, 'req' | 'title' | 'content'> = {
      file: relativeFilePath,
      line: lineNumber,
    };

    if (needsCheckCode) {
      // 计算注释块结束的行号并获取代码示例
      const endIndex = (match.index || 0) + match[0].length;
      const endLineNumber = content.substring(0, endIndex).split(/\r?\n/).length;
      const checkCode = FileUtils.getCodeSample(lines, endLineNumber);
      if (checkCode) {
        // 将原始注释块和代码示例拼接在一起
        partialItem.check_code = `${match[0]}\n${checkCode}`;
        partialItem.check_code_language = FileUtils.detectLanguage(filePath, checkCode.substring(0, 100));
      }
    }

    return {
      partialItem,
    };
  }

  /**
   * 创建通用解析器
   * @param tag 标签名称
   * @returns 解析器
   */
  private static createStandardParser(tag: string): BlockParser {
    // endTag 是 tag 的首字母大写
    const endTag = tag.charAt(0).toUpperCase() + tag.slice(1);
    return {
      pattern: new RegExp(
        // 开始标记：以行首开始或者前面是换行（且之后没有换行），然后是注释符号
        `(?:^|\\n(?!\\n))(?:\\s*(?://|\\*)\\s*@${tag}\\s+)` +
        // 标题部分：捕获到换行符
        `(.+?)(?:\\r?\\n)` +
        // 内容部分：任意字符（非贪婪）直到结束标记
        `([\\s\\S]*?)` +
        // 结束标记：行首或换行后，可能有空白，然后是注释符号和结束标记
        `(?:^|\\n)\\s*(?://|\\*)\\s*@end(?:${tag}|${endTag})`,
        'g'
      ),
      parse(match, content, filePath, projectPath, lines) {
        const title = match[1]?.trim() || '';
        const { partialItem } = BlockUtils._parseBlockDetails(match, content, filePath, projectPath, lines, true);

        const innerContent = BlockUtils.cleanCommentContent(match[2] || '');
        const domains = BlockUtils.parseDomains(innerContent);
        const { reqId, reqIds } = BlockUtils.parseReqIds(innerContent, '???');

        // 创建文档项
        const item: DocItem = {
          ...partialItem,
          title: title,
          content: innerContent,
          req: reqIds.length > 0 ? reqIds : reqId,
          domain: domains,
        };

        return {
          blockType: tag,
          reqId,
          item
        };
      }
    };
  }

  /**
   * 创建带ID标识符的解析器
   * @param tag 标签名称
   * @returns 解析器
   */
  private static createIdentifiableParser(tag: string): BlockParser {
    // endTag 是 tag 的首字母大写
    const endTag = tag.charAt(0).toUpperCase() + tag.slice(1);
    return {
      pattern: new RegExp(
        // 开始标记：以行首开始或者前面是换行（且之后没有换行），然后是注释符号
        `(?:^|\\n(?!\\n))(?:\\s*(?://|\\*)\\s*@${tag}\\()` +
        // reqId 部分
        `(.*?)` +
        // 右括号和空格
        `\\)\\s+` +
        // 标题部分：捕获到换行符
        `(.*?)(?:\\r?\\n)` +
        // 内容部分：任意字符（非贪婪）直到结束标记
        `([\\s\\S]*?)` +
        // 结束标记
        `(?:^|\\n)\\s*(?://|\\*)\\s*@end(?:${tag}|${endTag})`,
        'g'
      ),
      parse(match, content, filePath, projectPath, lines) {
        const { partialItem } = BlockUtils._parseBlockDetails(match, content, filePath, projectPath, lines, true);

        const innerContent = BlockUtils.cleanCommentContent(match[3] || '');
        const domains = BlockUtils.parseDomains(innerContent);
        const primaryReqId = match[1]?.trim() || '???';
        let title = match[2]?.trim() || '';
        if (!title) {
          title = BlockUtils.extractTitle(innerContent);
        }

        // 解析内容中额外的需求ID关联，并将主 ID 也包含进去
        const { reqId, reqIds } = BlockUtils.parseReqIds(innerContent, primaryReqId);

        // 创建文档项
        const item: DocItem = {
          ...partialItem,
          title: title,
          content: innerContent,
          req: reqIds.length > 0 ? reqIds : reqId,
          domain: domains,
        };

        return {
          blockType: tag,
          reqId: reqId,
          item
        };
      }
    };
  }
}
