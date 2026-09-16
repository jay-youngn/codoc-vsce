import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import type { CancellationToken } from 'vscode';
import { ScanCancelled, checkCancellation } from '../models/DocModels';

export class GitService {
  private readonly running = new Map<ChildProcess, () => void>();
  private disposed = false;

  private run(cwd: string, args: string[], token?: CancellationToken): Promise<Buffer> {
    checkCancellation(token);
    if (this.disposed) return Promise.reject(new ScanCancelled());
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd, shell: false, windowsHide: true });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let bytes = 0;
      let settled = false;
      let cancelSubscription: { dispose(): void } | undefined;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cancelSubscription?.dispose();
        this.running.delete(child);
        if (error) reject(error);
        else resolve(Buffer.concat(stdout));
      };
      const stop = (error: Error) => { finish(error); child.kill(); };
      const timer = setTimeout(() => stop(new Error('Git 操作超时')), 60_000);
      const cancel = () => stop(new ScanCancelled());
      this.running.set(child, cancel);
      cancelSubscription = token?.onCancellationRequested(cancel);
      if (token?.isCancellationRequested) cancel();
      child.stdout?.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) stop(new Error('Git 输出过大，无法安全处理'));
        else stdout.push(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => { if (stderr.length < 64) stderr.push(chunk); });
      child.on('error', error => finish(new Error(`无法运行 Git: ${error.message}`)));
      child.on('close', code => finish(code === 0 ? undefined : new Error(`Git 操作失败: ${Buffer.concat(stderr).toString('utf8').trim() || code}`)));
    });
  }

  public async getChangedFiles(workspacePath: string, reference: string, token?: CancellationToken): Promise<{ root: string; files: string[] }> {
    const root = (await this.run(workspacePath, ['rev-parse', '--show-toplevel'], token)).toString('utf8').trimEnd();
    // Resolve the user input to a commit before using it in diff; never invoke a shell.
    const commit = (await this.run(root, ['rev-parse', '--verify', '--end-of-options', `${reference.trim() || 'HEAD'}^{commit}`], token)).toString('utf8').trim();
    if (!/^[a-f0-9]{40,64}$/i.test(commit)) throw new Error('无法解析提交引用');
    const output = await this.run(root, ['diff', '--name-only', '-z', '--diff-filter=ACMRT', commit, '--'], token);
    return { root, files: output.toString('utf8').split('\0').filter(Boolean).map(file => path.resolve(root, file)) };
  }
  public dispose(): void {
    this.disposed = true;
    for (const cancel of [...this.running.values()]) cancel();
  }
}
