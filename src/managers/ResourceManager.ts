import * as fs from 'fs';

import { ChildProcess } from 'child_process';
import { LogService } from '../services/LogService';

/**
 * 资源管理器 - 处理临时文件和子进程的创建与清理
 */
export class ResourceManager {
  private tempFiles: string[] = [];
  private childProcesses: ChildProcess[] = [];
  private logger: LogService;
  private currentDocumentPath: string | null = null;
  private lastMarkdownFile: string | null = null;

  constructor(logger: LogService) {
    this.logger = logger;
  }

  /**
   * 添加临时文件到管理列表
   * @param filePath 文件路径
   */
  public addTempFile(filePath: string): void {
    this.tempFiles.push(filePath);
  }

  /**
   * 添加子进程到管理列表
   * @param process 子进程
   */
  public addChildProcess(process: ChildProcess): void {
    this.childProcesses.push(process);
  }

  /**
   * 设置当前文档路径
   * @param path 文档路径
   */
  public setCurrentDocument(path: string | null): void {
    this.currentDocumentPath = path;
  }

  /**
   * 获取当前文档路径
   */
  public getCurrentDocument(): string | null {
    return this.currentDocumentPath;
  }

  /**
   * 设置最后生成的Markdown文件
   * @param path 文件路径
   */
  public setLastMarkdownFile(path: string | null): void {
    this.lastMarkdownFile = path;
  }

  /**
   * 获取最后生成的Markdown文件
   */
  public getLastMarkdownFile(): string | null {
    return this.lastMarkdownFile;
  }

  /**
   * 清理指定的临时文件
   * @param filePath 文件路径
   */
  public cleanupTempFile(filePath: string): void {
    const index = this.tempFiles.indexOf(filePath);
    if (index !== -1) {
      try {
        // 确认文件存在后再删除
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        this.tempFiles.splice(index, 1);
      } catch (error) {
        this.logger.error(`清理临时文件失败`, error);
      }
    }
  }

  /**
   * 终止所有运行中的子进程
   */
  public killRunningProcesses(): void {
    this.childProcesses.forEach((proc) => {
      try {
        if (proc && !proc.killed) {
          proc.kill('SIGTERM');
        }
      } catch (e) {
        this.logger.error(`终止进程失败`, e);
      }
    });

    // 清空子进程数组
    this.childProcesses = [];
  }

  /**
   * 清理所有临时文件
   */
  public cleanupAllTempFiles(): void {
    this.tempFiles.forEach((file) => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        this.logger.error(`清理临时文件失败`, error);
      }
    });
    this.tempFiles = [];
  }

  /**
   * 释放所有资源
   */
  public dispose(): void {
    this.cleanupAllTempFiles();
    this.killRunningProcesses();
    this.currentDocumentPath = null;
    this.lastMarkdownFile = null;
  }
}
