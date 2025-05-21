import * as vscode from 'vscode';

import { LogService } from './services/LogService';
import { GitService } from './services/GitService';
import { ResourceManager } from './managers/ResourceManager';
import { DocumentService } from './services/DocumentService';
import { DocsViewProvider } from './providers/DocsViewProvider';
import { CommandManager } from './managers/CommandManager';
import { ConfigService } from './services/ConfigService';
import { CacheService } from './services/CacheService';

let docsViewProvider: DocsViewProvider;

/**
 * 激活插件时的处理函数
 * @param context 扩展上下下文
 */
export function activate(context: vscode.ExtensionContext): void {
  const logger = new LogService('CoDoc');
  const resourceManager = new ResourceManager(logger);
  const gitService = new GitService(logger);
  const documentService = new DocumentService(logger, resourceManager);
  const configService = new ConfigService(logger);
  const cacheService = new CacheService(logger);

  logger.info('CoDoc 插件已激活');

  if (typeof global.gc === 'function') {
    // 检查是否可以使用手动垃圾回收
    // 添加定期垃圾回收任务（每5分钟执行一次）
    const gcInterval = setInterval(() => {
      if (typeof global.gc === 'function') {
        try {
          global.gc();
          logger.info('已执行计划垃圾回收');
        } catch (e) {
          logger.error(`计划垃圾回收失败: ${e}`);
        }
      }
    }, 5 * 60 * 1000);

    context.subscriptions.push({ dispose: () => clearInterval(gcInterval) });
  } else {
    logger.warn('垃圾回收功能不可用。建议使用 --expose-gc 参数启动 VS Code 以启用此功能。');
  }


  // 应用Better Comments配置
  configService.applyBetterCommentsConfig();

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('codoc.highlightEnabled')) {
        configService.applyBetterCommentsConfig();
      }
    })
  );

  // 监听编辑器关闭事件，用于清理临时文件
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      resourceManager.cleanupTempFile(doc.uri.fsPath);

      // 如果关闭的是当前文档，将引用置空
      if (resourceManager.getCurrentDocument() === doc.uri.fsPath) {
        resourceManager.setCurrentDocument(null);
      }
    }),
  );

  // 监听窗口状态变化，当切换到其他窗口时释放资源
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((windowState) => {
      if (!windowState.focused) {
        // 当VSCode窗口失去焦点时，主动垃圾回收
        if (typeof global.gc === 'function') {
          try {
            global.gc();
          } catch (e) {
            logger.error(`垃圾回收失败: ${e}`);
          }
        }
      }
    }),
  );

  // 初始化文档树视图
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    // 初始化缓存服务
    cacheService.initialize(workspaceFolders[0].uri.fsPath);

    // 创建文档视图提供者，并传入缓存服务
    docsViewProvider = new DocsViewProvider(workspaceFolders[0].uri.fsPath, cacheService);
    const treeView = vscode.window.createTreeView('codoc-tree', {
      treeDataProvider: docsViewProvider,
      showCollapseAll: true
    });

    // 监听视图可见性变化，当视图首次可见时加载缓存数据
    context.subscriptions.push(
      treeView.onDidChangeVisibility((e) => {
        if (e.visible) {
          docsViewProvider.onViewActivated();
        }
      })
    );

    // 加入到上下文订阅中以便在扩展停用时清理
    context.subscriptions.push(treeView, docsViewProvider);

    // 更新命令管理器以使用文档视图提供者
    const docsCommandManager = new CommandManager(
      context,
      logger,
      resourceManager,
      gitService,
      documentService,
      docsViewProvider,
      cacheService
    );

    // 注册所有命令
    docsCommandManager.registerAllCommands();
  }

  // 将服务实例添加到上下文订阅中以确保适当释放
  context.subscriptions.push(
    { dispose: () => logger.dispose() },
    { dispose: () => resourceManager.dispose() },
    { dispose: () => configService.dispose() },
    { dispose: () => cacheService }
  );
}

/**
 * 当插件停用时被调用
 */
export function deactivate(): void {
  // 插件停用时的资源释放已在各个服务的dispose方法中处理
}
