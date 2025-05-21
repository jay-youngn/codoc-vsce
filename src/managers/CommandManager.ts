import * as vscode from 'vscode';

import { LogService } from '../services/LogService';
import { ResourceManager } from './ResourceManager';
import { GitService } from '../services/GitService';
import { DocumentService } from '../services/DocumentService';
import { DocsViewProvider } from '../providers/DocsViewProvider';
import { CacheService } from '../services/CacheService';
import { DocParser } from '../utils/DocParser';
import { NotificationUtils } from '../utils/common/NotificationUtils';

/**
 * 命令管理器 - 集中管理插件命令注册
 */
export class CommandManager {
  /**
   * 构造函数
   * @param context 扩展上下文
   * @param logger 日志服务
   * @param resourceManager 资源管理器
   * @param gitService Git服务
   * @param documentService 文档服务
   * @param docsViewProvider 文档视图提供者
   * @param cacheService 缓存服务
   */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: LogService,
    private readonly resourceManager: ResourceManager,
    private readonly gitService: GitService,
    private readonly documentService: DocumentService,
    private readonly docsViewProvider?: DocsViewProvider,
    private readonly cacheService?: CacheService
  ) {}

  /**
   * 注册所有命令
   */
  public registerAllCommands(): void {
    this.registerExportDocsCommand();

    // 如果文档视图提供者存在，则注册相关命令
    if (this.docsViewProvider) {
      this.registerDocScannerCommand();
      this.registerViewByTypeCommand();
      this.registerViewByDomainCommand();
      this.registerViewByReqCommand();
      this.registerExportDocsFromViewCommand();

      // 注意：筛选命令已经在 DocsViewProvider 构造函数中注册
    }
  }

  /**
   * 注册导出文档命令
   */
  private registerExportDocsCommand(): void {
    const generateDocsCommand = vscode.commands.registerCommand('codoc.readComments', async () => {
      try {
        // 如果有上一次生成的文档，先尝试清理
        const lastMarkdownFile = this.resourceManager.getLastMarkdownFile();
        if (lastMarkdownFile) {
          this.resourceManager.cleanupTempFile(lastMarkdownFile);
          this.resourceManager.setLastMarkdownFile(null);
        }

        const inputOptions = {
          prompt: '请输入 <Git 分支名> 或 <Commit ID>',
          placeHolder: '例如: master / HEAD / 4efa151 (留空则向前检索10次提交)',
        };

        let commitId = await vscode.window.showInputBox(inputOptions);

        if (!commitId) {
          commitId = 'HEAD~10';
          await NotificationUtils.showAutoHideMessage('已使用默认提交ID: HEAD~10');
        }

        // 使用 Git 命令获取修改过的文件列表
        const changedFiles = await this.gitService.getChangedFiles(commitId);
        if (!changedFiles || changedFiles.length === 0) {
          await NotificationUtils.showAutoHideMessage(`未找到 ${commitId} 中的修改文件`);
          return;
        }

        await this.documentService.processDocs(changedFiles);
      } catch (error: any) {
        await NotificationUtils.showAutoHideError(`文档生成错误: ${error.message}`);
        // 出错时也尝试清理资源
        this.resourceManager.killRunningProcesses();
      }
    });

    this.context.subscriptions.push(generateDocsCommand);
  }

  /**
   * 注册文档扫描命令
   */
  private registerDocScannerCommand(): void {
    if (!this.docsViewProvider) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const docScanner = vscode.commands.registerCommand('codoc.scan', async () => {
      try {
        // 设置初始加载状态
        this.docsViewProvider!.setLoading(true, '正在检索工作区');

        // 同时在窗口中也显示一个简单的指示器
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Window,
          title: 'CoDoc: Scanning...',
          cancellable: false
        }, async () => {
          // 步骤1: 查找文件
          const docParser = new DocParser(workspaceFolders[0].uri.fsPath);

          // 获取项目设置的排除文件清单
          const { FileExcludeUtils } = await import('../utils/FileExcludeUtils');
          const excludePatterns = FileExcludeUtils.getWorkspaceExcludePatterns();

          // 创建全局排除模式字符串
          const excludeGlobPattern = excludePatterns.length > 0
            ? `{${excludePatterns.join(',')}}`
            : null;

          this.logger.info(`使用排除规则: ${excludeGlobPattern || '无'}`);

          // 使用排除文件清单查找需要解析的代码文件
          const files = await vscode.workspace.findFiles(
            '**/*.{js,jsx,ts,tsx,vue,java,go,php}',
            excludeGlobPattern
          );

          // 更新 TreeView 中的状态
          this.docsViewProvider!.setLoading(true, `正在解析 ${files.length} 个文件...`);

          // 步骤2: 解析所有文件
          const filePaths = files.map(file => file.fsPath);

          // 解析文件
          const results = docParser.parseFiles(filePaths);

          // 更新视图并缓存结果
          this.docsViewProvider?.updateDocs(results);

          // 如果有缓存服务，则保存结果
          if (this.cacheService) {
            this.cacheService.saveScanResult(results);
            this.logger.info('文档注释扫描结果已缓存');
          }
        });

        this.logger.info('文档注释扫描完成');
      } catch (error: any) {
        this.logger.error('扫描文档注释时出错:', error);
        await NotificationUtils.showAutoHideError('扫描文档注释时出错: ' + error.message);
      } finally {
        this.docsViewProvider!.setLoading(false);
      }
    });

    this.context.subscriptions.push(docScanner);
  }

  /**
   * 注册按类型查看命令
   */
  private registerViewByTypeCommand(): void {
    if (!this.docsViewProvider) return;

    const viewByType = vscode.commands.registerCommand('codoc.viewByType', () => {
      this.docsViewProvider!.setViewMode('byType');
    });

    this.context.subscriptions.push(viewByType);
  }

  /**
   * 注册按领域查看命令
   */
  private registerViewByDomainCommand(): void {
    if (!this.docsViewProvider) return;

    const viewByDomain = vscode.commands.registerCommand('codoc.viewByDomain', () => {
      this.docsViewProvider!.setViewMode('byDomain');
    });

    this.context.subscriptions.push(viewByDomain);
  }

  /**
   * 注册按需求查看命令
   */
  private registerViewByReqCommand(): void {
    if (!this.docsViewProvider) return;

    const viewByReq = vscode.commands.registerCommand('codoc.viewByReq', () => {
      this.docsViewProvider!.setViewMode('byReq');
    });

    this.context.subscriptions.push(viewByReq);
  }

  /**
   * 注册从视图中导出文档命令
   */
  private registerExportDocsFromViewCommand(): void {
    if (!this.docsViewProvider) return;

    const exportDocs = vscode.commands.registerCommand('codoc.exportDocs', () => {
      this.docsViewProvider!.exportDocs(this.documentService);
    });

    this.context.subscriptions.push(exportDocs);
  }
}
