import * as path from 'path';
import * as fs from 'fs';

import { DocItem, DocResult } from '../models/DocModels';
import { FileUtils } from './FileUtils';
import { BlockUtils, BlockParser } from './BlockUtils';
import { ReportGenerator } from './ReportGenerator';

/**
 * 文档解析工具类 - 支持四种标准文档注释格式
 * 1. @summary - 方案概要模板
 * 2. @decision - 决策点注释模板
 * 3. @testFocus - 测试重点模板
 * 4. @fix - BUG修复注释模板
 */
export class DocParser {
  private result: DocResult = {};
  private projectPath: string;
  private blockParsers: BlockParser[];

  /**
   * 构造函数
   * @param projectPath 项目根路径
   */
  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.blockParsers = BlockUtils.createBlockParsers();
  }

  /**
   * 根据文件扩展名和代码特征检测编程语言
   * @param filePath 文件路径
   * @param codeSample 代码样本
   * @returns 检测到的语言
   * @deprecated 使用 FileUtils.detectLanguage 代替
   */
  public detectLanguage(filePath: string, codeSample: string): string {
    return FileUtils.detectLanguage(filePath, codeSample);
  }

  /**
   * 解析文件中的文档注释
   * @param filePath 文件路径
   * @returns 更新后的结果对象
   */
  public parseFile(filePath: string): DocResult {
    console.log(`解析文件: ${filePath}`);
    if (!path.isAbsolute(filePath)) {
      filePath = path.resolve(this.projectPath, filePath);
    }

    try {
      // 读取文件内容
      const { content, lines } = FileUtils.readFileContent(filePath);

      // 如果内容为空，直接返回
      if (!content) {
        console.log(`文件为空: ${filePath}`);
        return this.result;
      }

      // 对每种解析器应用解析
      for (const parser of this.blockParsers) {
        // 创建新的正则表达式实例，避免全局模式的状态保留问题
        const regex = new RegExp(parser.pattern.source, parser.pattern.flags);
        let match;

        // 直接在原始内容上执行正则匹配
        while ((match = regex.exec(content)) !== null) {
          // 解析匹配内容
          const { blockType, reqId, item } = parser.parse(match, content, filePath, this.projectPath, lines);

          // 确保reqId有效
          if (reqId && blockType) {
            BlockUtils.addToResult(this.result, reqId, blockType, item);
            console.log(`成功解析 [${blockType}] 块，需求ID: ${reqId}`);
          }
        }
      }

      return this.result;
    } catch (error) {
      console.error(`处理文件 ${filePath} 时出错:`, error);
      return this.result;
    }
  }

  /**
   * 批量解析文件
   * @param filePaths 文件路径列表
   * @returns 解析结果
   */
  public parseFiles(filePaths: string[]): DocResult {
    console.log(`开始解析文件，共 ${filePaths.length} 个`);

    // 获取支持的代码文件扩展名集合
    const supportedCodeExtensions = FileUtils.getSupportedCodeExtensions();

    // 过滤出支持的代码文件类型
    const supportedFiles = filePaths.filter((filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      return path.isAbsolute(filePath) &&
             fs.existsSync(filePath) &&
             fs.statSync(filePath).isFile() &&
             supportedCodeExtensions.has(ext);
    });

    // 从工作区设置中过滤掉排除的文件
    const processableFiles = FileUtils.filterExcludedFiles(supportedFiles, this.projectPath);

    console.log(`符合条件的文件: ${supportedFiles.length} 个，排除后: ${processableFiles.length} 个`);

    // 处理每个文件
    for (const filePath of processableFiles) {
      this.parseFile(filePath);
    }

    // 结果排序
    this.result = Object.fromEntries(
      Object.entries(this.result).sort(([a], [b]) => a.localeCompare(b)),
    );

    // 打印解析结果统计
    const reqCount = Object.keys(this.result).length;
    console.log(`解析完成，共发现 ${reqCount} 个需求相关的文档块`);

    return this.result;
  }

  /**
   * 直接从文本内容解析文档块 (用于测试)
   * @param content 文本内容
   * @param filePath 文件路径 (可选)
   * @returns 解析结果
   */
  public parseContent(content: string, filePath: string = 'test.ts'): DocResult {
    if (!content) {
      return this.result;
    }

    const lines = content.split(/\r?\n/);

    // 对每种解析器应用解析
    for (const parser of this.blockParsers) {
      const regex = new RegExp(parser.pattern.source, parser.pattern.flags);
      let match;

      // 重置正则表达式状态
      while ((match = regex.exec(content)) !== null) {
        const { blockType, reqId, item } = parser.parse(match, content, filePath, this.projectPath, lines);
        BlockUtils.addToResult(this.result, reqId, blockType, item);
      }
    }

    return this.result;
  }

  /**
   * 应用过滤器
   * @param filters 需求ID过滤器
   * @returns 过滤后的结果
   */
  public applyFilters(filters: string[]): DocResult {
    if (!filters || filters.length === 0) {
      return this.result;
    }

    const filteredResult: DocResult = {};

    for (const reqId of Object.keys(this.result)) {
      if (filters.includes(reqId)) {
        filteredResult[reqId] = this.result[reqId];
      }
    }

    return filteredResult;
  }

  /**
   * 生成Markdown内容
   * @param result 文档结果对象
   * @returns Markdown字符串
   */
  public generateMarkdown(result: DocResult): string {
    return ReportGenerator.generateMarkdown(result);
  }

  /**
   * 生成JSON内容
   * @param result 文档结果对象
   * @returns JSON字符串
   */
  public generateJson(result: DocResult): string {
    return ReportGenerator.generateJson(result);
  }

  /**
   * 重置结果
   */
  public reset(): void {
    this.result = {};
  }
}
