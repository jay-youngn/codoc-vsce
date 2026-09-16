import * as path from 'path';
import * as vscode from 'vscode';
import { DocResult, UNASSIGNED, associatedIds, checkCancellation, uniqueDocs } from '../models/DocModels';
import { DocParser } from '../utils/DocParser';
import { FileUtils } from '../utils/FileUtils';
import { FileExcludeUtils } from '../utils/FileExcludeUtils';
import { BlockUtils } from '../utils/BlockUtils';
import { ReportGenerator } from '../utils/ReportGenerator';

export class DocumentService {
  public async scanWorkspace(folders: readonly vscode.WorkspaceFolder[], token?: vscode.CancellationToken): Promise<DocResult> {
    const docs: DocResult = [];
    const seen = new Set<string>();
    // More specific roots own files when workspace folders are nested.
    const ordered = [...folders].sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length);
    for (const folder of ordered) {
      checkCancellation(token);
      const patterns = FileExcludeUtils.getWorkspaceExcludePatterns(folder.uri);
      const exclude = patterns.length ? `{${patterns.join(',')}}` : undefined;
      const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, FileUtils.getSourceGlob()), exclude, undefined, token);
      const paths = files.map(file => file.fsPath).filter(file => {
        const owner = ordered.find(candidate => file === candidate.uri.fsPath || file.startsWith(`${candidate.uri.fsPath}${path.sep}`));
        if (owner !== folder || seen.has(file)) return false;
        seen.add(file);
        return true;
      });
      docs.push(...await new DocParser(folder.uri.fsPath).parseFiles(paths, token));
    }
    checkCancellation(token);
    return uniqueDocs(docs);
  }
  public async parseDocuments(root: string, files: string[], token?: vscode.CancellationToken): Promise<DocResult> {
    return new DocParser(root).parseFiles(FileExcludeUtils.filterExcludedFiles(files, vscode.Uri.file(root)), token);
  }
  public async processResultFilter(result: DocResult, token?: vscode.CancellationToken): Promise<DocResult | undefined> {
    checkCancellation(token);
    if (!result.length) { void vscode.window.showInformationMessage('没有可导出的文档注释'); return undefined; }
    const ids = [...new Set(result.flatMap(item => associatedIds(item).length ? associatedIds(item) : [UNASSIGNED]))].sort();
    let selectedIds = ids;
    if (ids.length > 1) {
      const selection = await vscode.window.showQuickPick(ids.map(label => ({ label, picked: true })), { canPickMany: true, title: '选择需求／缺陷编号' }, token);
      checkCancellation(token);
      if (!selection?.length) return undefined;
      selectedIds = selection.map(item => item.label);
    }
    const filtered = result.filter(item => {
      const related = associatedIds(item);
      return (related.length ? related : [UNASSIGNED]).some(id => selectedIds.includes(id));
    });
    const types = [...new Set(filtered.map(item => item.type))];
    if (types.length <= 1) return filtered;
    const chosen = await vscode.window.showQuickPick(types.map(type => ({ label: BlockUtils.getBlockTitle(type), type, picked: true })), { canPickMany: true, title: '选择注释类型' }, token);
    checkCancellation(token);
    if (!chosen?.length) return undefined;
    return filtered.filter(item => chosen.some(type => type.type === item.type));
  }
  public async showMarkdownResult(result: DocResult): Promise<vscode.Uri> {
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: ReportGenerator.generateMarkdown(result) });
    await vscode.window.showTextDocument(document, { preview: false });
    await vscode.commands.executeCommand('markdown.showPreviewToSide', document.uri);
    return document.uri;
  }
}
