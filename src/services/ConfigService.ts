import * as vscode from 'vscode';
import { LogService } from './LogService';

/**
 * 配置服务 - 处理扩展配置相关功能
 */
export class ConfigService {
  private logger: LogService;

  constructor(logger: LogService) {
    this.logger = logger;
  }

  /**
   * 应用Better Comments配置
   */
  public async applyBetterCommentsConfig(): Promise<void> {
    try {
      // 获取扩展配置
      const config = vscode.workspace.getConfiguration('codoc');
      const highlightEnabled = config.get<boolean>('highlightEnabled', true);

      if (!highlightEnabled) {
        this.logger.warn('文档注释高亮功能已禁用');
        return;
      }

      // 检查Better Comments扩展是否已安装
      const betterCommentsExtension = vscode.extensions.getExtension('edwinhuish.better-comments-next');

      if (!betterCommentsExtension) {
        this.logger.warn('未找到Better Comments Next扩展，注释高亮功能将不可用');
        // 提示用户安装Better Comments扩展
        const installAction = '安装扩展';
        const result = await vscode.window.showWarningMessage(
          '要启用注释高亮功能，需要安装Better Comments Next扩展',
          installAction
        );

        if (result === installAction) {
          // 打开VS Code扩展市场
          await vscode.commands.executeCommand(
            'workbench.extensions.installExtension',
            'edwinhuish.better-comments-next'
          );
        }
        return;
      }

      // 确保Better Comments扩展已激活
      if (!betterCommentsExtension.isActive) {
        await betterCommentsExtension.activate();
      }

      // 更新Better Comments配置
      const betterComments = vscode.workspace.getConfiguration('better-comments');

      // 当前插件推荐的配置
      const recommendBetterCommentsTags = config.get<Array<any>>('better-comments.tags', []);
      if (recommendBetterCommentsTags.length < 1) {
        return;
      }

      // 获取现有标签
      const existingTags = betterComments.get<Array<any>>('tags', []);

      // 创建标签映射以便于查找
      const tagMap = new Map();
      const updatedTags = [];
      if (existingTags.length > 0) {
        const filterSources = new Set();
        existingTags.forEach((tag: any) => {
          if (String(tag.source).includes('codoc')) {
            filterSources.add(tag.source);
          }

          tagMap.set(tag.tag, tag);
        });

        recommendBetterCommentsTags.filter((tag: any) => {
          return !filterSources.has(tag.source);
        }).forEach((tag: any) => {
          tagMap.set(tag.tag, tag);
        });
        updatedTags.push(...tagMap.values());
      } else {
        updatedTags.push(...recommendBetterCommentsTags);
      }

      await betterComments.update('tags', updatedTags, vscode.ConfigurationTarget.Global);

      this.logger.info('文档注释高亮配置已应用');
    } catch (error: any) {
      this.logger.error(`应用高亮配置时出错: ${error.message}`);
    }
  }

  /**
   * 释放资源
   */
  public dispose(): void {
    // 当前无需释放资源
  }
}
