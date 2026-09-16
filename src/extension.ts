import * as path from 'path';
import * as vscode from 'vscode';
import { CommandManager } from './managers/CommandManager';
import { DocsViewProvider } from './providers/DocsViewProvider';
import { CacheService } from './services/CacheService';
import { ConfigService } from './services/ConfigService';
import { DocumentService } from './services/DocumentService';
import { GitService } from './services/GitService';
import { LogService } from './services/LogService';
import { FileUtils } from './utils/FileUtils';
import { FileExcludeUtils } from './utils/FileExcludeUtils';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new LogService('CoDoc');
  const git = new GitService();
  const view = new DocsViewProvider();
  const cache = new CacheService(context.storageUri, logger);
  const commands = new CommandManager(context, logger, new DocumentService(), view, cache, git, new ConfigService());
  commands.registerAllCommands();
  const tree = vscode.window.createTreeView('codoc-tree', { treeDataProvider: view, showCollapseAll: true });
  const relevant = (uri: vscode.Uri) => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return Boolean(folder && FileUtils.getSupportedCodeExtensions().has(path.extname(uri.fsPath).toLowerCase()) && FileExcludeUtils.filterExcludedFiles([uri.fsPath], folder.uri).length);
  };
  const changed = (uri: vscode.Uri) => { if (relevant(uri)) view.markStale(); };
  const watcher = vscode.workspace.createFileSystemWatcher(FileUtils.getSourceGlob());
  context.subscriptions.push(
    commands, git, tree, view, watcher,
    watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed),
    vscode.workspace.onDidSaveTextDocument(document => changed(document.uri)),
    vscode.workspace.onDidCreateFiles(event => event.files.forEach(changed)),
    vscode.workspace.onDidDeleteFiles(event => event.files.forEach(changed)),
    vscode.workspace.onDidRenameFiles(event => event.files.forEach(file => { changed(file.oldUri); changed(file.newUri); })),
    vscode.workspace.onDidChangeWorkspaceFolders(() => view.markStale()),
    logger,
  );
  view.initialize();
  const revision = view.revision;
  const roots = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
  const snapshot = await cache.loadScanResult(roots);
  if (snapshot && revision === view.revision) view.updateDocs(snapshot.result, snapshot.timestamp, true);
  logger.info('CoDoc 已激活');
}
export function deactivate(): void { /* Resources belong to the extension context. */ }
