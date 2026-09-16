import * as path from 'path';
import * as vscode from 'vscode';
import { minimatch } from 'minimatch';

export class FileExcludeUtils {
  public static getWorkspaceExcludePatterns(root: vscode.Uri): string[] {
    const config = vscode.workspace.getConfiguration(undefined, root);
    const patterns = new Set(['**/node_modules/**', '**/vendor/**', '**/dist/**', '**/out/**', '**/.git/**']);
    for (const setting of ['files.exclude', 'search.exclude']) {
      const configured = config.get<Record<string, unknown>>(setting, {});
      for (const [pattern, enabled] of Object.entries(configured)) if (enabled === true) patterns.add(pattern);
    }
    return [...patterns];
  }
  public static filterExcludedFiles(files: string[], root: vscode.Uri): string[] {
    const patterns = this.getWorkspaceExcludePatterns(root);
    return files.filter(file => !patterns.some(pattern => minimatch(path.relative(root.fsPath, file).split(path.sep).join('/'), pattern, { dot: true })));
  }
}
