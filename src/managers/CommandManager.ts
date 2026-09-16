import * as vscode from 'vscode';
import { checkCancellation, DocResult, ScanCancelled } from '../models/DocModels';
import { DocsViewProvider } from '../providers/DocsViewProvider';
import { CacheService } from '../services/CacheService';
import { ConfigService } from '../services/ConfigService';
import { DocumentService } from '../services/DocumentService';
import { GitService } from '../services/GitService';
import { LogService } from '../services/LogService';

export class CommandManager implements vscode.Disposable {
  private busy = false;
  private disposed = false;
  private active?: vscode.CancellationTokenSource;
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: LogService,
    private readonly documents: DocumentService,
    private readonly view: DocsViewProvider,
    private readonly cache: CacheService,
    private readonly git: GitService,
    private readonly config: ConfigService,
  ) {}
  public registerAllCommands(): void {
    const register = (name: string, callback: () => unknown | Promise<unknown>) => {
      this.context.subscriptions.push(vscode.commands.registerCommand(name, async () => {
        if (this.disposed) return;
        try { return await callback(); }
        catch (error) {
          if (error instanceof ScanCancelled || error instanceof vscode.CancellationError) return;
          this.logger.error(`CoDoc 操作失败: ${String(error)}`);
          void vscode.window.showErrorMessage(`CoDoc: ${error instanceof Error ? error.message : String(error)}`);
          return undefined;
        }
      }));
    };
    register('codoc.scan', () => this.withProgress(token => this.scan(token)));
    register('codoc.exportDocs', () => this.withProgress(async token => {
      const result = await this.scan(token);
      if (!result) return;
      const selected = await this.documents.processResultFilter(this.view.filterDocs(result), token);
      checkCancellation(token);
      if (selected) return this.documents.showMarkdownResult(selected);
    }));
    register('codoc.readComments', () => this.withProgress(token => this.exportGit(token)));
    register('codoc.viewByType', () => this.view.setViewMode('byType'));
    register('codoc.viewByDomain', () => this.view.setViewMode('byDomain'));
    register('codoc.viewByReq', () => this.view.setViewMode('byReq'));
    register('codoc.filter', async () => {
      const text = await vscode.window.showInputBox({ prompt: '筛选标题、内容、编号或领域' });
      if (text !== undefined) this.view.setFilter(text);
    });
    register('codoc.filterClear', () => this.view.setFilter(''));
    register('codoc.configureHighlighting', () => this.config.configureHighlighting());
  }
  private async withProgress<T>(work: (token: vscode.CancellationToken) => Promise<T>): Promise<T | undefined> {
    if (this.busy) { void vscode.window.showInformationMessage('CoDoc 正在处理另一个操作'); return; }
    this.busy = true;
    this.view.setLoading(true);
    this.active = new vscode.CancellationTokenSource();
    try {
      return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'CoDoc', cancellable: true }, async (_progress, uiToken) => {
        const subscription = uiToken.onCancellationRequested(() => this.active?.cancel());
        try {
          if (uiToken.isCancellationRequested) this.active?.cancel();
          return await work(this.active!.token);
        } finally { subscription.dispose(); }
      });
    } finally {
      this.active?.dispose();
      this.active = undefined;
      this.busy = false;
      if (!this.disposed) this.view.setLoading(false);
    }
  }
  private folders(): readonly vscode.WorkspaceFolder[] | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { void vscode.window.showInformationMessage('请先打开工作区文件夹'); return undefined; }
    return [...folders];
  }
  private warnDirty(): void {
    if (vscode.workspace.textDocuments.some(document => document.isDirty && document.uri.scheme === 'file')) {
      void vscode.window.showWarningMessage('CoDoc 读取已保存的文件；未保存的编辑不会包含在本次结果中。');
    }
  }
  private async scan(token: vscode.CancellationToken): Promise<DocResult | undefined> {
    const folders = this.folders();
    if (!folders) return undefined;
    this.warnDirty();
    const revision = this.view.revision;
    const result = await this.documents.scanWorkspace(folders, token);
    checkCancellation(token);
    if (revision !== this.view.revision) throw new Error('扫描期间文件或工作区已变化，请重新扫描');
    const timestamp = new Date().toISOString();
    await this.cache.saveScanResult(result, folders.map(folder => folder.uri.fsPath), timestamp, () => {
      checkCancellation(token);
      if (revision !== this.view.revision) throw new Error('扫描期间文件或工作区已变化，请重新扫描');
      this.view.updateDocs(result, timestamp);
    });
    return result;
  }
  private async exportGit(token: vscode.CancellationToken): Promise<vscode.Uri | undefined> {
    const folders = this.folders();
    if (!folders) return;
    let folder = folders[0];
    if (folders.length > 1) {
      const selected = await vscode.window.showQuickPick(folders.map(item => ({ label: item.name, description: item.uri.fsPath, folder: item })), { title: '选择 Git 仓库所在工作区目录' }, token);
      if (!selected) return;
      folder = selected.folder;
    }
    const reference = await vscode.window.showInputBox({ prompt: '输入 Git 分支或提交（与已保存工作区比较；不包含未跟踪文件）', value: 'HEAD', placeHolder: 'HEAD' }, token);
    if (reference === undefined) return;
    checkCancellation(token);
    this.warnDirty();
    const changed = await this.git.getChangedFiles(folder.uri.fsPath, reference || 'HEAD', token);
    const result = await this.documents.parseDocuments(changed.root, changed.files, token);
    checkCancellation(token);
    const selected = await this.documents.processResultFilter(result, token);
    checkCancellation(token);
    if (selected) return this.documents.showMarkdownResult(selected);
  }
  public dispose(): void { this.disposed = true; this.active?.cancel(); }
}
