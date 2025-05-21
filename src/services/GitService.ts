import { spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { LogService } from './LogService';

/**
 * Git服务 - 处理与Git相关的操作
 */
export class GitService {
  private outputChannel: LogService;

  constructor(outputChannel: LogService) {
    this.outputChannel = outputChannel;
  }

  /**
   * 使用 Git 命令获取修改过的文件列表
   * @param commitId Git 分支名或提交 ID
   * @returns 修改的文件路径列表
   */
  public async getChangedFiles(commitId: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        reject(new Error('未打开工作区文件夹'));
        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;

      // 构建 Git 命令：获取指定 commitId 相对于当前工作区的更改文件列表
      const gitCommand = `git diff --name-only ${commitId}`;

      const gitProcess = spawn('bash', ['-c', gitCommand], {
        cwd: rootPath,
      });

      // 使用数组收集输出，避免大量字符串拼接
      const outputChunks: Buffer[] = [];
      const errorChunks: Buffer[] = [];

      gitProcess.stdout.on('data', (data: Buffer) => {
        outputChunks.push(data);
      });

      gitProcess.stderr.on('data', (data: Buffer) => {
        errorChunks.push(data);
      });

      gitProcess.on('close', (code: number) => {
        if (code !== 0) {
          const errorOutput = Buffer.concat(errorChunks).toString();
          reject(new Error(`Git 命令执行失败: ${errorOutput}`));
          // 清理引用
          outputChunks.length = 0;
          errorChunks.length = 0;
          return;
        }

        // 将输出合并并分割为文件路径列表，并过滤掉空行
        const output = Buffer.concat(outputChunks).toString();
        const files = output.split('\n')
          .filter((line) => line.trim() !== '')
          .map((relativePath) => path.resolve(rootPath, relativePath));

        // 清理引用
        outputChunks.length = 0;
        errorChunks.length = 0;

        resolve(files);
      });

      gitProcess.on('error', (err: Error) => {
        // 清理引用
        outputChunks.length = 0;
        errorChunks.length = 0;
        reject(new Error(`无法执行 Git 命令: ${err.message}`));
      });
    });
  }
}
