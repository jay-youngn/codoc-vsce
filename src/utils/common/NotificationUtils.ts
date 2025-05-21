import * as vscode from 'vscode';

/**
 * 通知工具类 - 提供增强的通知功能
 */
export class NotificationUtils {
  /**
   * 显示一个会自动隐藏的信息消息
   * @param message 要显示的消息内容
   * @param hideAfterMs 显示的毫秒数，默认3000ms (3秒)
   * @returns Promise<void>
   */
  public static async showAutoHideMessage(message: string, hideAfterMs: number = 3000): Promise<void> {
    // 在状态栏显示消息
    const disposable = vscode.window.setStatusBarMessage(message);

    // 同时在通知区域显示消息，但不等待用户交互
    vscode.window.showInformationMessage(message);

    // 设定计时器，到期后清除状态栏消息
    return new Promise((resolve) => {
      setTimeout(() => {
        disposable.dispose(); // 清除状态栏消息
        resolve();
      }, hideAfterMs);
    });
  }

  /**
   * 显示一个会自动隐藏的警告消息
   * @param message 要显示的消息内容
   * @param hideAfterMs 显示的毫秒数，默认3000ms (3秒)
   * @returns Promise<void>
   */
  public static async showAutoHideWarning(message: string, hideAfterMs: number = 3000): Promise<void> {
    // 在状态栏显示消息
    const disposable = vscode.window.setStatusBarMessage(`⚠️ ${message}`);

    // 同时在通知区域显示消息，但不等待用户交互
    vscode.window.showWarningMessage(message);

    // 设定计时器，到期后清除状态栏消息
    return new Promise((resolve) => {
      setTimeout(() => {
        disposable.dispose(); // 清除状态栏消息
        resolve();
      }, hideAfterMs);
    });
  }

  /**
   * 显示一个会自动隐藏的错误消息
   * @param message 要显示的消息内容
   * @param hideAfterMs 显示的毫秒数，默认4000ms (4秒，比普通消息稍长)
   * @returns Promise<void>
   */
  public static async showAutoHideError(message: string, hideAfterMs: number = 4000): Promise<void> {
    // 在状态栏显示消息
    const disposable = vscode.window.setStatusBarMessage(`❌ ${message}`);

    // 同时在通知区域显示消息，但不等待用户交互
    vscode.window.showErrorMessage(message);

    // 设定计时器，到期后清除状态栏消息
    return new Promise((resolve) => {
      setTimeout(() => {
        disposable.dispose(); // 清除状态栏消息
        resolve();
      }, hideAfterMs);
    });
  }
}
