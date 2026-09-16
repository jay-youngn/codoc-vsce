import * as vscode from 'vscode';
import * as path from 'path';
import { DocItem } from '../models/DocModels';
import { DocGroup } from './types';

export class DocTreeItem extends vscode.TreeItem {
  constructor(label: string, public readonly group?: DocGroup, item?: DocItem) {
    super(label, group ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.contextValue = group?.kind || (item ? 'annotation' : 'status');
    if (item) {
      const uri = vscode.Uri.file(path.resolve(item.workspaceRoot, item.file));
      const line = Math.max(0, item.line - 1);
      this.description = `${path.basename(item.workspaceRoot)}/${item.file}:${item.line}`;
      this.tooltip = `${item.title}\n${uri.fsPath}:${item.line}`;
      this.command = { command: 'vscode.open', title: '打开注释位置', arguments: [uri, { selection: new vscode.Range(line, 0, line, 0) }] };
    }
  }
}
