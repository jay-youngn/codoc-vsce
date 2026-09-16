import * as vscode from 'vscode';
import { DocItem, DocResult, UNASSIGNED, associatedIds, uniqueDocs } from '../models/DocModels';
import { BlockUtils } from '../utils/BlockUtils';
import { DocTreeItem } from './DocTreeItem';
import { ViewMode } from './types';

export class DocsViewProvider implements vscode.TreeDataProvider<DocTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<DocTreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this.emitter.event;
  private docs: DocResult = [];
  private mode: ViewMode = 'byType';
  private filterText = '';
  private busy = false;
  private timestamp?: string;
  private historical = false;
  private stale = false;
  public revision = 0;

  public updateDocs(result: DocResult, timestamp: string, historical = false): void {
    this.revision++;
    this.docs = uniqueDocs(result);
    this.timestamp = timestamp;
    this.historical = historical;
    this.stale = false;
    this.refresh();
  }
  public markStale(): void { this.revision++; this.stale = true; this.refresh(); }
  public setViewMode(mode: ViewMode): void { this.mode = mode; this.refresh(); }
  public setLoading(busy: boolean): void { if (busy) this.revision++; this.busy = busy; this.refresh(); }
  public setFilter(text: string): void { this.filterText = text; this.refresh(); }
  public filterDocs(docs: DocResult): DocResult {
    const query = this.filterText.trim().toLowerCase();
    return uniqueDocs(docs).filter(item => !query || [item.title, item.content, item.primaryId || '', ...item.req, ...item.domain].join('\n').toLowerCase().includes(query));
  }
  private hasRequirement(item: DocItem, id: string): boolean {
    const ids = associatedIds(item);
    return ids.length ? ids.includes(id) : id === UNASSIGNED;
  }
  public getTreeItem(item: DocTreeItem): vscode.TreeItem { return item; }
  public getChildren(parent?: DocTreeItem): DocTreeItem[] {
    let docs = this.filterDocs(this.docs);
    if (parent?.group) {
      const group = parent.group;
      if (group.kind === 'req') {
        docs = docs.filter(item => this.hasRequirement(item, group.key));
        return [...new Set(docs.map(item => item.type))].sort().map(type => {
          const node = new DocTreeItem(BlockUtils.getBlockTitle(type), { kind: 'type', key: type, reqId: group.key });
          node.description = `(${docs.filter(item => item.type === type).length})`;
          return node;
        });
      }
      docs = docs.filter(item => group.kind === 'domain' ? item.domain.includes(group.key) : item.type === group.key);
      if (group.reqId) docs = docs.filter(item => this.hasRequirement(item, group.reqId!));
      return docs.map(item => new DocTreeItem(item.title, undefined, item));
    }
    if (parent) return [];
    let status = this.timestamp ? `扫描时间：${new Date(this.timestamp).toLocaleString()}` : '文档注释待扫描';
    if (this.historical) status = `历史扫描结果，请重新扫描更新 · ${status}`;
    if (this.stale) status = `文件已变化，待刷新 · ${status}`;
    if (this.busy) status = '正在处理文档注释…';
    const info = new DocTreeItem(status);
    info.iconPath = new vscode.ThemeIcon(this.busy ? 'sync~spin' : this.stale || this.historical ? 'history' : 'info');
    const kind = this.mode === 'byType' ? 'type' : this.mode === 'byDomain' ? 'domain' : 'req';
    const keys = new Set(docs.flatMap(item => kind === 'type' ? [item.type] : kind === 'domain' ? item.domain : associatedIds(item).length ? associatedIds(item) : [UNASSIGNED]));
    return [info, ...[...keys].sort().map(key => new DocTreeItem(kind === 'type' ? BlockUtils.getBlockTitle(key) : key, { kind, key }))];
  }
  private refresh(): void {
    const ready = !this.busy;
    const workspace = Boolean(vscode.workspace.workspaceFolders?.length);
    const contexts: Record<string, boolean> = {
      'codoc.scanEnabled': ready && workspace, 'codoc.exportEnabled': ready && workspace,
      'codoc.viewModeEnabled': ready, 'codoc.filterEnabled': ready,
      'codoc.filterClearEnabled': ready && Boolean(this.filterText), 'codoc.isFiltering': Boolean(this.filterText),
    };
    for (const [key, value] of Object.entries(contexts)) void vscode.commands.executeCommand('setContext', key, value);
    this.emitter.fire();
  }
  public initialize(): void { this.refresh(); }
  public dispose(): void { this.revision++; this.emitter.dispose(); }
}
