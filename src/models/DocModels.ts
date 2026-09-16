/** One annotation at one source location. IDs never replace its source identity. */
export interface DocItem {
  type: string;
  primaryId?: string;
  req: string[];
  domain: string[];
  workspaceRoot: string;
  file: string;
  /** One-based coordinates; convert only at the VS Code boundary. */
  line: number;
  endLine: number;
  title: string;
  content: string;
  check_code?: string;
  check_code_language?: string;
}
export type DocResult = DocItem[];
export const UNASSIGNED = '未关联需求';
export function associatedIds(item: DocItem): string[] {
  return [...new Set([item.primaryId, ...item.req].filter((id): id is string => Boolean(id)))];
}
export function sourceKey(item: DocItem): string {
  return JSON.stringify([item.workspaceRoot, item.file, item.line, item.type]);
}
export function uniqueDocs(items: DocResult): DocResult {
  return [...new Map(items.map(item => [sourceKey(item), item])).values()];
}
export interface Cancellation { readonly isCancellationRequested: boolean; }
export class ScanCancelled extends Error {
  constructor() { super('操作已取消'); this.name = 'ScanCancelled'; }
}
export function checkCancellation(token?: Cancellation): void {
  if (token?.isCancellationRequested) throw new ScanCancelled();
}
