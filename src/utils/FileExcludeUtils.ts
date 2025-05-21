import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import * as path from 'path';

/**
 * 文件排除工具类 - 处理文件排除规则相关功能
 */
export class FileExcludeUtils {

  /**
   * 获取VS Code设置中的文件排除规则
   * @returns 排除模式字符串数组
   */
  public static getWorkspaceExcludePatterns(): string[] {
    // 获取VSCode文件排除设置
    const config = vscode.workspace.getConfiguration();
    const filesExclude = config.get<Record<string, boolean>>('files.exclude', {});
    const searchExclude = config.get<Record<string, boolean>>('search.exclude', {});

    // 合并排除规则
    const excludePatterns: string[] = [];

    // 添加默认排除规则
    excludePatterns.push('**/node_modules/**', '**/vendor/**', '**/dist/**', '**/out/**', '**/.git/**');

    // 添加用户设置的排除规则
    for (const pattern in filesExclude) {
      if (filesExclude[pattern]) {
        excludePatterns.push(pattern);
      }
    }

    for (const pattern in searchExclude) {
      if (searchExclude[pattern]) {
        excludePatterns.push(pattern);
      }
    }

    return excludePatterns;
  }

  /**
   * 检查文件路径是否应该被排除
   * @param filePath 文件路径
   * @param workspacePath 工作区路径
   * @param excludePatterns 排除模式数组
   * @returns 是否应该排除
   */
  public static shouldExcludeFile(
    filePath: string,
    workspacePath: string,
    excludePatterns: string[]
  ): boolean {
    // 获取相对路径（相对于工作区）
    const relativePath = path.relative(workspacePath, filePath);

    // 检查是否匹配任何排除模式
    for (const pattern of excludePatterns) {
      if (minimatch(relativePath, pattern)) {
        return true;
      }

      // 处理带*的绝对路径模式
      if (pattern.startsWith('/') && minimatch(filePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 过滤文件列表，排除不需要处理的文件
   * @param filePaths 文件路径数组
   * @param workspacePath 工作区路径
   * @returns 过滤后的文件路径数组
   */
  public static filterExcludedFiles(filePaths: string[], workspacePath: string): string[] {
    const excludePatterns = this.getWorkspaceExcludePatterns();

    return filePaths.filter(filePath => !this.shouldExcludeFile(filePath, workspacePath, excludePatterns));
  }
}
