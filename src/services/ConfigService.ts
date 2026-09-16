import * as vscode from 'vscode';

type Tag = Record<string, unknown>;
function owned(tag: Tag): boolean { return typeof tag.source === 'string' && tag.source.startsWith('codoc:'); }
function tags(value: unknown): Tag[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Better Comments 标签配置必须是对象数组');
  return value as Tag[];
}
export class ConfigService {
  public async configureHighlighting(): Promise<void> {
    const action = await vscode.window.showQuickPick([
      { label: '应用／更新 CoDoc 高亮', action: 'apply' as const },
      { label: '移除 CoDoc 高亮', action: 'remove' as const },
    ], { title: '配置 Better Comments 高亮（仅处理 CoDoc 标签）' });
    if (!action) return;
    const targets = [{ label: '用户设置（可清理旧版全局标签）', target: vscode.ConfigurationTarget.Global }];
    if (vscode.workspace.workspaceFolders?.length) targets.unshift({ label: '工作区设置', target: vscode.ConfigurationTarget.Workspace });
    const target = await vscode.window.showQuickPick(targets, { title: '选择配置作用域' });
    if (!target) return;
    await this.updateTags(action.action, target.target);
    void vscode.window.showInformationMessage(action.action === 'apply' ? 'CoDoc 高亮配置已应用' : '所选作用域中的 CoDoc 高亮已移除');
    if (action.action === 'apply' && !vscode.extensions.getExtension('edwinhuish.better-comments-next')) {
      void vscode.window.showWarningMessage('高亮配置已保存；安装 Better Comments Next 后生效。扫描和导出无需该扩展。');
    }
  }
  public async updateTags(action: 'apply' | 'remove', target: vscode.ConfigurationTarget): Promise<void> {
    const codoc = vscode.workspace.getConfiguration('codoc');
    if (action === 'apply' && !codoc.get<boolean>('highlightEnabled', true)) throw new Error('请先启用 codoc.highlightEnabled，再运行配置高亮命令');
    const config = vscode.workspace.getConfiguration('better-comments');
    const inspected = config.inspect<unknown>('tags');
    const ownValue = target === vscode.ConfigurationTarget.Global ? inspected?.globalValue : inspected?.workspaceValue;
    // Read the chosen scope, not a higher-precedence workspace/folder override.
    const inherited = target === vscode.ConfigurationTarget.Global ? inspected?.defaultValue : inspected?.globalValue ?? inspected?.defaultValue;
    const existing = tags(ownValue ?? inherited ?? []);
    const next = existing.filter(tag => !owned(tag));
    if (action === 'apply') {
      const recommended = tags(codoc.get<unknown>('better-comments.tags', [])).filter(owned);
      if (!recommended.length) throw new Error('未配置有效的 CoDoc 高亮标签');
      next.push(...recommended);
    }
    if (JSON.stringify(next) !== JSON.stringify(existing)) await config.update('tags', next, target);
  }
}
