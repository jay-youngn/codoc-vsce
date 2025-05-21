import * as fs from 'fs';
import * as path from 'path';
import { LanguageMap } from '../models/DocModels';
import { FileExcludeUtils } from './FileExcludeUtils';

/**
 * 文件和代码处理工具类
 */
export class FileUtils {
  // 扩展名到语言的映射
  private static extensionMap: LanguageMap = {
    '.py': 'python',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.vue': 'javascript',
    '.php': 'php',
    '.go': 'go',
    '.java': 'java',
    '.lua': 'lua',
    '.rb': 'ruby',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sql': 'sql',
    '.sh': 'bash',
    '.json': 'json',
    '.xml': 'xml',
    '.md': 'markdown',
  };

  /**
   * 过滤文件路径列表，排除不需要处理的文件
   * @param filePaths 文件路径数组
   * @param workspacePath 工作区路径
   * @returns 过滤后的文件路径数组
   */
  public static filterExcludedFiles(filePaths: string[], workspacePath: string): string[] {
    return FileExcludeUtils.filterExcludedFiles(filePaths, workspacePath);
  }

  /**
   * 根据文件扩展名和代码特征检测编程语言
   * @param filePath 文件路径
   * @param codeSample 代码样本
   * @returns 检测到的语言
   */
  public static detectLanguage(filePath: string, codeSample: string): string {
    // 根据文件扩展名判断
    const ext = path.extname(filePath).toLowerCase();
    if (ext in this.extensionMap) {
      return this.extensionMap[ext];
    }

    // 只检查代码的前100个字符，避免处理大量内容
    codeSample = codeSample.length > 100 ? codeSample.substring(0, 100) : codeSample;

    // 根据代码特征判断
    const codeLower = codeSample.toLowerCase();
    if (codeLower.includes('function') && (codeLower.includes('{') || codeLower.includes('=>'))) {
      return 'javascript';
    }
    if (codeLower.includes('def ') && codeLower.includes(':')) {
      return 'python';
    }
    if (codeLower.includes('<template>') || codeLower.includes('<script>')) {
      return 'vue';
    }
    if (codeLower.includes('package ') && codeLower.includes('func ')) {
      return 'go';
    }
    if (codeLower.includes('public class') || codeLower.includes('private class')) {
      return 'java';
    }
    if (codeLower.includes('local ') && codeLower.includes('end')) {
      return 'lua';
    }
    if (codeLower.includes('<?php')) {
      return 'php';
    }

    // 默认
    return 'text';
  }

  /**
   * 读取文件内容
   * @param filePath 文件路径
   * @returns 文件内容和行数组
   */
  public static readFileContent(filePath: string): { content: string, lines: string[] } {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return { content: '', lines: [] };
    }

    try {
      // 获取文件大小
      const fileStats = fs.statSync(filePath);
      const fileSize = fileStats.size;

      // 读取文件内容 - 使用适当的编码
      let codeContent = '';
      let lines: string[] = [];

      try {
        // 对于小文件，一次性读取全部内容
        if (fileSize < 1024 * 1024) {
          codeContent = fs.readFileSync(filePath, { encoding: 'utf8' });
        } else {
          // 大文件处理: 流式读取或分块读取
          const fd = fs.openSync(filePath, 'r');
          const bufferSize = 1024 * 1024;
          const buffer = Buffer.alloc(bufferSize);
          let bytesRead = 0;
          let position = 0;

          do {
            bytesRead = fs.readSync(fd, buffer, 0, bufferSize, position);
            codeContent += buffer.subarray(0, bytesRead).toString('utf8');
            position += bytesRead;

            // 检查是否找到了完整的注释块
            if (this.hasValidDocBlock(codeContent)) {
              break;
            }
          } while (bytesRead === bufferSize);

          fs.closeSync(fd);
        }

        // 分行
        lines = codeContent.split(/\r?\n/);
      } catch (e) {
        // 如果UTF-8解码失败，尝试使用其他编码
        const encodings = ['utf8', 'latin1', 'utf16le', 'ascii'];

        for (const encoding of encodings) {
          try {
            codeContent = fs.readFileSync(filePath, { encoding: encoding as BufferEncoding });
            lines = codeContent.split(/\r?\n/);
            break;
          } catch (encodingError) {
            continue;
          }
        }
      }

      return { content: codeContent, lines };
    } catch (error) {
      console.error(`处理文件 ${filePath} 时出错:`, error);
      return { content: '', lines: [] };
    }
  }

  /**
   * 检查代码中是否有有效的文档注释块
   * @param codeContent 代码内容
   * @returns 是否包含文档注释块
   */
  private static hasValidDocBlock(codeContent: string): boolean {
    return /(?:\/\/|\*)\s*@summary\(.*?\).*?(?:\/\/|\*)\s*@endSummary/s.test(codeContent) ||
      /(?:\/\/|\*)\s*@decision\s+.*?(?:\r?\n).*?(?:\/\/|\*)\s*@endDecision/s.test(codeContent) ||
      /(?:\/\/|\*)\s*@testFocus\s+.*?(?:\r?\n).*?(?:\/\/|\*)\s*@endTestFocus/s.test(codeContent) ||
      /(?:\/\/|\*)\s*@feature\s+.*?(?:\r?\n).*?(?:\/\/|\*)\s*@endFeature/s.test(codeContent) ||
      /(?:\/\/|\*)\s*@fix\(.*?\).*?(?:\/\/|\*)\s*@endFix/s.test(codeContent);
  }

  /**
   * 获取注释块后的代码示例
   * @param lines 代码行数组
   * @param endLineNumber 注释块结束行号
   * @param maxLines 最大获取行数
   * @returns 代码示例
   */
  public static getCodeSample(lines: string[], endLineNumber: number, maxLines: number = 15): string {
    if (endLineNumber >= lines.length) {
      return '';
    }

    const endLine = Math.min(endLineNumber + maxLines, lines.length);
    const codeLines: string[] = [];

    for (let i = endLineNumber; i < endLine; i++) {
      if (lines[i]?.trim()) {
        codeLines.push(lines[i].trimEnd());
      }
    }

    return codeLines.length > 0 ? codeLines.join('\n') : '';
  }

  /**
   * 获取支持的代码文件扩展名集合
   * @returns 扩展名集合
   */
  public static getSupportedCodeExtensions(): Set<string> {
    return new Set([
      '.js', '.ts', '.jsx', '.tsx', '.vue',  // JavaScript/TypeScript
      '.py', '.pyw',                         // Python
      '.java', '.class', '.kt',              // Java/Kotlin
      '.c', '.cpp', '.h', '.hpp',            // C/C++
      '.cs',                                 // C#
      '.go',                                 // Go
      '.php',                                // PHP
      '.rb',                                 // Ruby
      '.swift',                              // Swift
      '.rs',                                 // Rust
      '.lua',                                // Lua
      '.sh', '.bash',                        // Shell
      '.sql'                                 // SQL
    ]);
  }
}
