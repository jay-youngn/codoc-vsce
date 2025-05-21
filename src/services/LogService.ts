import * as vscode from 'vscode';

/**
 * 日志服务 - 处理扩展的日志输出
 */
export class LogService {
  private outputChannel: vscode.LogOutputChannel;

  constructor(channelName: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName, { log: true });
  }

  /**
   * 输出调试级别日志
   * @param message 日志消息
   * @param error 可选的错误对象
   */
  public debug(message: string, ...args: any[]): void {
    this.outputChannel.debug(message, ...args);
  }

  /**
   * 输出信息级别日志
   * @param message 日志消息
   * @param error 可选的错误对象
   */
  public info(message: string, ...args: any[]): void {
    this.outputChannel.info(message, ...args);
  }

  /**
   * 输出警告级别日志
   * @param message 日志消息
   * @param error 可选的错误对象
   */
  public warn(message: string, ...args: any[]): void {
    this.outputChannel.warn(message, ...args);
  }

  /**
   * 输出错误级别日志
   * @param message 日志消息
   * @param error 可选的错误对象
   */
  public error(message: string, ...args: any[]): void {
    this.outputChannel.error(message, ...args);
  }

  /**
   * 获取原始输出通道
   */
  public getOutputChannel(): vscode.LogOutputChannel {
    return this.outputChannel;
  }

  /**
   * 清空日志
   */
  public clear(): void {
    this.outputChannel.clear();
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    this.outputChannel.dispose();
  }
}
