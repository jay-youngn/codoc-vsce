import * as path from 'path';
import { DocItem, DocResult } from '../models/DocModels';
import { FileUtils } from './FileUtils';

export class BlockUtils {
  public static readonly blockTypeSet = new Map([
    ['summary', '📝 方案概要'], ['fix', '🐛 BUG修复'], ['decision', '🔍 决策点'],
    ['testFocus', '🧪 测试重点'], ['feature', '✨ 功能点'], ['notice', '❕ 注意'],
    ['comment', '💬 备注'], ['deployment', '🚀 部署说明'], ['performance', '⚡ 性能考虑'],
    ['security', '🔒 安全考虑'], ['deprecated', '⚠️ 弃用'],
  ]);
  public static getBlockTitle(type: string): string { return this.blockTypeSet.get(type) || type; }
  private static commentText(line: string): string | undefined {
    // Remove only the prefix. Markdown indentation remains meaningful.
    return line.match(/^[\t ]*(?:\/\/|\/\*+|\*(?!\/)) ?(.*)$/)?.[1];
  }
  private static cleanBody(lines: string[]): string {
    const nonEmpty = lines.filter(line => line.trim());
    const indent = nonEmpty.length ? nonEmpty.reduce((min, line) => Math.min(min, line.match(/^[\t ]*/)?.[0].length || 0), Infinity) : 0;
    return lines.map(line => line.slice(indent)).join('\n').replace(/^\n+|\n+$/g, '');
  }
  private static metadata(body: string, field: 'req' | 'domain'): string[] {
    let fence = '';
    const values: string[] = [];
    for (const line of body.split('\n')) {
      const marker = line.match(/^[\t ]*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
        continue;
      }
      if (fence) continue;
      const match = line.match(new RegExp(`^- +${field}[：:][\\t ]*(.*)$`, 'i'));
      if (match) values.push(...match[1].split(/[,，]/).map(value => value.trim()).filter(Boolean));
    }
    return [...new Set(values)];
  }
  public static parse(content: string, filePath: string, workspaceRoot: string): DocResult {
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
    const result: DocResult = [];
    const startPattern = /^\s*@(\w+)(?:\(([^)]*)\))?[\t ]+(.+?)\s*$/;
    let open: { type: string; primaryId?: string; title: string; line: number; body: string[] } | undefined;
    let fence = '';
    for (let index = 0; index < lines.length; index++) {
      const text = this.commentText(lines[index]);
      if (!open) {
        const match = text?.match(startPattern);
        if (!match || !this.blockTypeSet.has(match[1])) continue;
        if (match[2] !== undefined && !['summary', 'fix'].includes(match[1])) continue;
        open = { type: match[1], primaryId: match[2]?.trim() || undefined, title: match[3], line: index + 1, body: [] };
        fence = '';
        continue;
      }
      if (text === undefined && lines[index].trim()) throw new Error(`${filePath}:${open.line}: @${open.type} 缺少结束标签`);
      const bodyLine = text ?? '';
      const marker = bodyLine.match(/^[\t ]*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
      }
      if (!fence && bodyLine.trim().toLowerCase() === `@end${open.type}`.toLowerCase()) {
        const body = this.cleanBody(open.body);
        const item: DocItem = {
          type: open.type, ...(open.primaryId ? { primaryId: open.primaryId } : {}), title: open.title,
          workspaceRoot: path.resolve(workspaceRoot), file: path.relative(workspaceRoot, filePath),
          line: open.line, endLine: index + 1, content: body,
          req: this.metadata(body, 'req'), domain: this.metadata(body, 'domain'),
          check_code: FileUtils.getCodeSample(lines, index + 1), check_code_language: FileUtils.detectLanguage(filePath),
        };
        result.push(item);
        open = undefined;
      } else {
        const next = !fence && bodyLine.match(startPattern);
        if (next && this.blockTypeSet.has(next[1])) throw new Error(`${filePath}:${open.line}: @${open.type} 缺少结束标签`);
        open.body.push(bodyLine);
      }
    }
    if (open) throw new Error(`${filePath}:${open.line}: @${open.type} 缺少结束标签`);
    return result;
  }
}
