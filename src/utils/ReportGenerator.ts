import * as path from 'path';
import { DocResult, UNASSIGNED, associatedIds, uniqueDocs } from '../models/DocModels';
import { BlockUtils } from './BlockUtils';

function heading(text: string): string {
  return text.replace(/[\r\n]/g, ' ').replace(/[\\`*_[\]<>#]/g, '\\$&');
}
export class ReportGenerator {
  public static generateMarkdown(result: DocResult): string {
    const groups = new Map<string, DocResult>();
    for (const item of uniqueDocs(result)) {
      const id = item.primaryId || item.req[0] || UNASSIGNED;
      const group = groups.get(id) || [];
      group.push(item);
      groups.set(id, group);
    }
    const lines = ['# CoDoc 文档注释', ''];
    for (const [id, items] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`## ${heading(id)}`, '');
      for (const [type, label] of BlockUtils.blockTypeSet) {
        const section = items.filter(item => item.type === type);
        if (!section.length) continue;
        lines.push(`### ${label}`, '');
        for (const item of section) {
          lines.push(`#### ${heading(item.title)}`, '');
          lines.push(`来源：${heading(path.basename(item.workspaceRoot))} / ${heading(item.file)}:${item.line}`, '');
          const related = associatedIds(item);
          if (related.length) lines.push(`关联编号：${related.map(heading).join(', ')}`, '');
          if (item.domain.length) lines.push(`所属领域：${item.domain.map(heading).join(', ')}`, '');
          // Markdown is retained verbatim rather than reduced to key/value fields.
          lines.push(item.content, '');
          if (item.check_code?.trim()) {
            const ticks = Math.max(3, ...[...item.check_code.matchAll(/`+/g)].map(match => match[0].length + 1));
            const fence = '`'.repeat(ticks);
            lines.push('附近代码：', '', `${fence}${item.check_code_language || 'text'}`, item.check_code, fence, '');
          }
          lines.push('---', '');
        }
      }
    }
    return lines.join('\n');
  }
}
