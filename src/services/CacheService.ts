import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LogService } from './LogService';
import { DocResult } from '../models/DocModels';

/**
 * 缓存服务 - 管理文档扫描结果的缓存
 */
export class CacheService {
  private logger: LogService;
  private cacheFilePath: string | null = null;
  private cacheDirPath: string = path.join('.vscode', 'codoc');
  private cacheFileName: string = 'scan-cache.json';

  /**
   * 构造函数
   * @param logger 日志服务实例
   */
  constructor(logger: LogService) {
    this.logger = logger;
  }

  /**
   * 初始化缓存目录和文件路径
   * @param workspaceRoot 工作区根路径
   */
  public initialize(workspaceRoot: string | undefined): void {
    if (!workspaceRoot) {
      this.logger.warn('未打开工作区，无法初始化缓存');
      return;
    }

    // 设置缓存目录和文件路径
    const cacheDirPath = path.join(workspaceRoot, this.cacheDirPath);
    this.cacheFilePath = path.join(cacheDirPath, this.cacheFileName);

    // 确保缓存目录存在
    if (!fs.existsSync(cacheDirPath)) {
      try {
        fs.mkdirSync(cacheDirPath, { recursive: true });
        this.logger.info(`创建缓存目录: ${cacheDirPath}`);
      } catch (error) {
        this.logger.error(`创建缓存目录失败`, error);
        this.cacheFilePath = null;
      }
    }
  }

  /**
   * 保存扫描结果到缓存文件
   * @param scanResult 扫描结果
   * @returns 是否成功保存
   */
  public saveScanResult(scanResult: DocResult, timestamp?: Date | undefined): boolean {
    if (!this.cacheFilePath) {
      this.logger.warn('缓存路径未初始化，无法保存');
      return false;
    }

    try {
      // 确保包含时间戳信息
      const cacheData = {
        timestamp: timestamp ? timestamp.toISOString() : new Date().toISOString(),
        result: scanResult
      };

      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(cacheData, null, 2),
        { encoding: 'utf8' }
      );

      this.logger.info(`扫描结果已缓存到: ${this.cacheFilePath}`);
      return true;
    } catch (error) {
      this.logger.error(`保存缓存文件失败`, error);
      return false;
    }
  }

  /**
   * 从缓存文件加载扫描结果
   * @returns 缓存的扫描结果，如果没有缓存返回 null
   */
  public loadScanResult(): { timestamp: string; result: DocResult } | null {
    if (!this.cacheFilePath || !fs.existsSync(this.cacheFilePath)) {
      this.logger.info('缓存文件不存在，无法加载');
      return null;
    }

    try {
      const cacheContent = fs.readFileSync(this.cacheFilePath, { encoding: 'utf8' });
      const cacheData = JSON.parse(cacheContent);

      // 验证缓存数据格式
      if (!cacheData.timestamp || !cacheData.result) {
        this.logger.error('缓存文件格式错误');
        return null;
      }

      this.logger.info(`从缓存加载扫描结果: ${this.cacheFilePath} (${cacheData.timestamp})`);
      return cacheData;
    } catch (error) {
      this.logger.error(`读取缓存文件失败`, error);
      return null;
    }
  }

  /**
   * 清除缓存文件
   */
  public clearCache(): boolean {
    if (!this.cacheFilePath || !fs.existsSync(this.cacheFilePath)) {
      return true; // 文件已经不存在，视为清除成功
    }

    try {
      fs.unlinkSync(this.cacheFilePath);
      this.logger.info(`已清除缓存文件: ${this.cacheFilePath}`);
      return true;
    } catch (error) {
      this.logger.error(`清除缓存文件失败`, error);
      return false;
    }
  }

  /**
   * 获取缓存状态
   * @returns 缓存状态信息
   */
  public getCacheStatus(): { exists: boolean; timestamp?: string } {
    if (!this.cacheFilePath || !fs.existsSync(this.cacheFilePath)) {
      return { exists: false };
    }

    try {
      const cacheContent = fs.readFileSync(this.cacheFilePath, { encoding: 'utf8' });
      const cacheData = JSON.parse(cacheContent);
      return {
        exists: true,
        timestamp: cacheData.timestamp
      };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    // 目前无需释放资源
  }
}
