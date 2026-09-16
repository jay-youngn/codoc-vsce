import * as path from 'path';
import * as vscode from 'vscode';
import { DocItem, DocResult } from '../models/DocModels';
import { BlockUtils } from '../utils/BlockUtils';
import { LogService } from './LogService';

interface Snapshot { version: 1; timestamp: string; roots: string[]; result: DocResult; }
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
function validItem(value: unknown, roots: string[]): value is DocItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<DocItem>;
  if (typeof item.workspaceRoot !== 'string' || !roots.includes(item.workspaceRoot) || typeof item.file !== 'string' || path.isAbsolute(item.file)) return false;
  const relative = path.relative(item.workspaceRoot, path.resolve(item.workspaceRoot, item.file));
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !item.file.includes('\0') &&
    typeof item.type === 'string' && BlockUtils.blockTypeSet.has(item.type) &&
    typeof item.title === 'string' && typeof item.content === 'string' &&
    Number.isInteger(item.line) && (item.line ?? 0) > 0 && Number.isInteger(item.endLine) && (item.endLine ?? 0) >= (item.line ?? 0) &&
    stringArray(item.req) && stringArray(item.domain) &&
    (item.primaryId === undefined || typeof item.primaryId === 'string') &&
    (item.check_code === undefined || typeof item.check_code === 'string') &&
    (item.check_code_language === undefined || typeof item.check_code_language === 'string');
}

export class CacheService {
  constructor(private readonly storage: vscode.Uri | undefined, private readonly logger: LogService) {}
  private get file(): vscode.Uri | undefined { return this.storage && vscode.Uri.joinPath(this.storage, 'scan-cache-v1.json'); }
  public async loadScanResult(roots: string[]): Promise<Snapshot | undefined> {
    if (!this.file) return undefined;
    try {
      const data: unknown = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(this.file)).toString('utf8'));
      if (!data || typeof data !== 'object') return undefined;
      const snapshot = data as Partial<Snapshot>;
      if (snapshot.version !== 1 || typeof snapshot.timestamp !== 'string' || !Number.isFinite(Date.parse(snapshot.timestamp)) ||
        !stringArray(snapshot.roots) || JSON.stringify([...snapshot.roots].sort()) !== JSON.stringify([...roots].sort()) ||
        !Array.isArray(snapshot.result) || !snapshot.result.every(item => validItem(item, roots))) {
        this.logger.warn('扫描缓存不兼容或已损坏，请重新扫描');
        return undefined;
      }
      return snapshot as Snapshot;
    } catch (error) {
      if ((error as { code?: string }).code !== 'FileNotFound') this.logger.warn('无法加载扫描缓存，将使用新扫描结果');
      return undefined;
    }
  }
  public async saveScanResult(result: DocResult, roots: string[], timestamp: string, commit: () => void = () => {}): Promise<void> {
    if (!this.storage || !this.file) { commit(); return; }
    const temporary = vscode.Uri.joinPath(this.storage, 'scan-cache-v1.tmp');
    let prepared = false;
    try {
      try {
        await vscode.workspace.fs.createDirectory(this.storage);
        await vscode.workspace.fs.writeFile(temporary, Buffer.from(JSON.stringify({ version: 1, timestamp, roots, result })));
        prepared = true;
      } catch (error) { this.logger.warn(`缓存准备失败: ${String(error)}`); }
      // Commit synchronously after the last cancellable step. A rejected scan
      // must never replace the preceding successful cache or view.
      commit();
      if (prepared) {
        try { await vscode.workspace.fs.rename(temporary, this.file, { overwrite: true }); }
        catch (error) { this.logger.warn(`扫描成功，但缓存保存失败: ${String(error)}`); }
      }
    } finally {
      await vscode.workspace.fs.delete(temporary).then(() => {}, () => {});
    }
  }
}
