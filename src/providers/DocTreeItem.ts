import * as vscode from 'vscode';
import * as path from 'path';

import { DocItem } from '../models/DocModels';

/**
 * 文档树节点类型
 */
export class DocTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    private readonly workspaceRoot: string,
    public readonly command?: vscode.Command,
    public readonly description?: string,
    public readonly docItem?: DocItem,
    public readonly contextValue?: string
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = contextValue;
    if (docItem) {
      this.tooltip = `${docItem.title}\n${docItem.file}:${docItem.line}`;
      const absolutePath = path.isAbsolute(docItem.file) ? docItem.file : path.join(workspaceRoot, docItem.file);
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(absolutePath), { selection: new vscode.Range(docItem.line, 0, docItem.line, 0) }]
      };
    }
  }
}
