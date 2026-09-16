const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const mock = require('./helpers/vscode.cjs'); mock.install();
const { vscode, state, reset, logger } = mock;
const { GitService } = require('../out/services/GitService');
const { CacheService } = require('../out/services/CacheService');
const { ConfigService } = require('../out/services/ConfigService');
const { DocParser } = require('../out/utils/DocParser');
const { ScanCancelled } = require('../out/models/DocModels');
async function temporary(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codoc-services-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }

test('Git uses validated commits, NUL paths and excludes deleted/untracked files', async t => {
  reset(); const root = await temporary(t);
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=CoDoc Test', '-c', 'user.email=codoc@example.invalid', ...args], { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  const names = ['a b.ts', '中文.ts', 'line\nbreak.ts', 'delete.ts'];
  for (const name of names) await fs.writeFile(path.join(root, name), 'before');
  git('add', '--all'); git('commit', '-qm', 'fixture');
  for (const name of names.slice(0, 3)) await fs.writeFile(path.join(root, name), 'after');
  await fs.unlink(path.join(root, 'delete.ts')); await fs.writeFile(path.join(root, 'untracked.ts'), 'new');
  const service = new GitService(); t.after(() => service.dispose());
  const result = await service.getChangedFiles(root, 'HEAD');
  assert.deepEqual(result.files.map(file => path.basename(file)).sort(), names.slice(0, 3).sort());
  await assert.rejects(service.getChangedFiles(root, 'HEAD; printf should-not-run'), /Git 操作失败/);
  await assert.rejects(service.getChangedFiles(root, '--help'), /Git 操作失败/);
  await assert.rejects(service.getChangedFiles(root, 'missing-reference'), /Git 操作失败/);
  const cts = new vscode.CancellationTokenSource(); cts.cancel();
  await assert.rejects(service.getChangedFiles(root, 'HEAD', cts.token), ScanCancelled);
  const active = new vscode.CancellationTokenSource(); const pending = service.getChangedFiles(root, 'HEAD', active.token); active.cancel();
  await assert.rejects(pending, ScanCancelled);
});
test('cache uses extension storage and validates version, roots, shape and source paths', async t => {
  reset(); const root = await temporary(t); const storage = path.join(root, 'extension-storage');
  const cache = new CacheService(vscode.Uri.file(storage), logger);
  const docs = new DocParser(root).parseContent('// @decision context\n// - req: A-1\n// @endDecision', 'source.ts');
  const timestamp = new Date().toISOString();
  await cache.saveScanResult(docs, [root], timestamp);
  assert.deepEqual((await cache.loadScanResult([root])).result, docs);
  assert.equal(await cache.loadScanResult(['/different']), undefined);
  await assert.rejects(fs.stat(path.join(root, '.vscode')));
  const file = path.join(storage, 'scan-cache-v1.json'); const valid = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const bad of [{ ...valid, version: 2 }, { ...valid, result: [{}] }, { ...valid, result: [{ ...valid.result[0], file: '../outside.ts' }] }]) {
    await fs.writeFile(file, JSON.stringify(bad)); assert.equal(await cache.loadScanResult([root]), undefined);
  }
  await fs.writeFile(file, '{broken'); assert.equal(await cache.loadScanResult([root]), undefined);
  assert.equal(await new CacheService(undefined, logger).loadScanResult([root]), undefined);
});
test('failed cache replacement preserves the preceding successful snapshot', async t => {
  reset(); const root = await temporary(t); const cache = new CacheService(vscode.Uri.file(root), logger);
  await cache.saveScanResult([], [root], '2026-01-01T00:00:00.000Z');
  const rename = vscode.workspace.fs.rename; vscode.workspace.fs.rename = async () => { throw new Error('disk error'); };
  try { await cache.saveScanResult([], [root], '2026-02-01T00:00:00.000Z'); } finally { vscode.workspace.fs.rename = rename; }
  assert.equal((await cache.loadScanResult([root])).timestamp, '2026-01-01T00:00:00.000Z');
});
test('rejected commit after cache preparation preserves the previous cache and removes temporary files', async t => {
  reset(); const root = await temporary(t); const cache = new CacheService(vscode.Uri.file(root), logger);
  await cache.saveScanResult([], [root], '2026-01-01T00:00:00.000Z');
  for (const failure of [new ScanCancelled(), new Error('source changed')]) {
    await assert.rejects(cache.saveScanResult([], [root], '2026-02-01T00:00:00.000Z', () => { throw failure; }), error => error === failure);
    assert.equal((await cache.loadScanResult([root])).timestamp, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(await fs.readdir(root), ['scan-cache-v1.json']);
  }
});
test('highlight apply/update/remove is scoped and idempotent and preserves user tags', async () => {
  reset(); const own = { tag: '!', color: 'red', source: 'user' };
  state.settings['better-comments.tags'] = { globalValue: [own, { source: 'codoc:summary', color: 'old' }], workspaceValue: [{ tag: 'workspace', source: 'custom' }] };
  const config = new ConfigService(); await config.updateTags('apply', vscode.ConfigurationTarget.Global);
  const updated = state.settings['better-comments.tags'].globalValue;
  assert.deepEqual(updated[0], own); assert.equal(updated.filter(tag => tag.source === 'codoc:summary').length, 1);
  assert.notEqual(updated.find(tag => tag.source === 'codoc:summary').color, 'old');
  assert.ok(!updated.some(tag => tag.tag === 'workspace'));
  await config.updateTags('apply', 1); assert.equal(state.writes.length, 1);
  await config.updateTags('remove', 1); assert.deepEqual(state.settings['better-comments.tags'].globalValue, [own]);
  await config.updateTags('remove', 1); assert.equal(state.writes.length, 2);
  assert.deepEqual(state.settings['better-comments.tags'].workspaceValue, [{ tag: 'workspace', source: 'custom' }]);
});
test('workspace highlighting preserves inherited user tags without changing global settings', async () => {
  reset(['/workspace']); const user = [{ tag: '!', source: 'user' }, { tag: 'old', source: 'codoc:fix' }];
  state.settings['better-comments.tags'] = { globalValue: user };
  const config = new ConfigService(); await config.updateTags('remove', 2);
  assert.deepEqual(state.settings['better-comments.tags'].globalValue, user);
  assert.deepEqual(state.settings['better-comments.tags'].workspaceValue, [user[0]]);
  state.settings['codoc.highlightEnabled'] = { globalValue: false };
  await assert.rejects(config.updateTags('apply', 2), /请先启用/);
});
test('manual highlight configuration cancels cleanly and works without dependency installation', async () => {
  reset(['/workspace']); const config = new ConfigService(); await config.configureHighlighting(); assert.equal(state.writes.length, 0);
  state.picks.push(items => items[0], items => items[0]); await config.configureHighlighting();
  assert.equal(state.writes.length, 1); assert.equal(state.warnings.length, 1);
  assert.ok(!state.calls.some(call => call.name === 'workbench.extensions.installExtension'));
});
