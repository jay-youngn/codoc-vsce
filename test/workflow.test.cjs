const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const mock = require('./helpers/vscode.cjs'); mock.install();
const { vscode, state, reset, context, dispose, logger } = mock;
const { activate } = require('../out/extension');
const { DocsViewProvider } = require('../out/providers/DocsViewProvider');
const { DocTreeItem } = require('../out/providers/DocTreeItem');
const { DocumentService } = require('../out/services/DocumentService');
const { DocParser } = require('../out/utils/DocParser');
const { CommandManager } = require('../out/managers/CommandManager');
const { BlockUtils } = require('../out/utils/BlockUtils');
const { ConfigService } = require('../out/services/ConfigService');
const { CacheService } = require('../out/services/CacheService');
const source = title => `// @decision ${title}\n// - req: API-1\n// - domain: user\n// @endDecision`;
async function temporary(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codoc-workflow-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
function manager(documents, overrides = {}) {
  const ctx = context(); const view = new DocsViewProvider(); const saved = [];
  const cache = { saveScanResult: async (...args) => { args[3]?.(); saved.push(args); } };
  const git = { getChangedFiles: async () => { throw new Error('unexpected Git invocation'); } };
  const commands = new CommandManager(ctx, logger, documents, view, cache, overrides.git || git, new ConfigService());
  commands.registerAllCommands(); ctx.subscriptions.push(commands);
  return { ctx, view, saved };
}

test('every tag expands, all requirement associations are visible, and type/domain results deduplicate', () => {
  reset(['/root']); const view = new DocsViewProvider();
  const docs = [...BlockUtils.blockTypeSet.keys()].flatMap(type => new DocParser('/root').parseContent(`// @${type} ${type}\n// - req: A-1, A-2\n// - domain: user\n// @end${type}`, `${type}.ts`));
  view.updateDocs([...docs, ...docs], new Date().toISOString());
  const groups = view.getChildren().filter(node => node.group); assert.equal(groups.length, 11);
  for (const group of groups) assert.equal(view.getChildren(group).length, 1);
  view.setViewMode('byDomain'); assert.equal(view.getChildren(view.getChildren()[1]).length, 11);
  view.setViewMode('byReq'); assert.deepEqual(view.getChildren().filter(node => node.group).map(node => node.group.key), ['A-1', 'A-2']);
  view.setFilter('A-2'); assert.equal(view.getChildren().filter(node => node.group).length, 2);
  view.dispose();
});
test('source navigation converts one-based lines exactly once', () => {
  reset();
  for (const prefix of ['', '\n\n\n']) {
    const doc = new DocParser('/root').parseContent(prefix + source('位置'), 'a.ts')[0];
    const node = new DocTreeItem(doc.title, undefined, doc);
    assert.equal(node.command.arguments[0].fsPath, '/root/a.ts');
    assert.equal(node.command.arguments[1].selection.start.line, prefix.split('\n').length - 1);
  }
});
test('multi-root scanning respects root ownership, C++ and exclusion settings', async t => {
  const dir = await temporary(t); const nested = path.join(dir, 'nested'); await fs.mkdir(nested);
  await fs.writeFile(path.join(dir, 'a.cpp'), source('outer'));
  await fs.writeFile(path.join(nested, 'a.cpp'), source('inner'));
  await fs.mkdir(path.join(dir, 'node_modules')); await fs.writeFile(path.join(dir, 'node_modules', 'ignored.ts'), source('ignored'));
  reset([dir, nested]);
  const docs = await new DocumentService().scanWorkspace(state.folders);
  assert.equal(docs.length, 2); assert.deepEqual(new Set(docs.map(item => item.workspaceRoot)), new Set([dir, nested]));
  assert.ok(docs.every(item => item.file === 'a.cpp'));
});
test('export rescans saved content and creates separate untitled Markdown documents', async t => {
  const dir = await temporary(t); const file = path.join(dir, 'source.ts'); await fs.writeFile(file, source('before'));
  reset([dir]); const m = manager(new DocumentService()); t.after(() => dispose(m.ctx));
  await vscode.commands.executeCommand('codoc.scan');
  await fs.writeFile(file, source('after')); m.view.markStale();
  state.documents.push({ isDirty: true, uri: vscode.Uri.file(file) });
  const first = await vscode.commands.executeCommand('codoc.exportDocs');
  const second = await vscode.commands.executeCommand('codoc.exportDocs');
  assert.equal(first.scheme, 'untitled'); assert.notEqual(first.toString(), second.toString());
  const exports = state.documents.filter(doc => doc.isUntitled);
  assert.equal(exports.length, 2); assert.ok(exports.every(doc => doc.getText().includes('after') && !doc.getText().includes('before')));
  assert.ok(state.warnings.length > 0); assert.equal(state.errors.length, 0);
  assert.ok(!state.calls.some(call => /closeActiveEditor|toggleLock/.test(call.name)));
});
test('scan errors, cancellation and concurrent changes cannot replace the last successful snapshot', async () => {
  for (const scenario of ['error', 'cancel', 'change']) {
    reset(['/workspace']); let m;
    const docs = { scanWorkspace: async () => {
      if (scenario === 'error') throw new Error('read failed');
      if (scenario === 'cancel') state.uiCancellation.cancel();
      if (scenario === 'change') m.view.markStale();
      return [];
    } };
    m = manager(docs); await vscode.commands.executeCommand('codoc.scan');
    assert.equal(m.saved.length, 0); assert.equal(state.contexts.get('codoc.scanEnabled'), true);
    assert.equal(state.errors.length, scenario === 'cancel' ? 0 : 1); dispose(m.ctx);
  }
});
test('canceling Git input never starts Git; empty input explicitly means HEAD', async () => {
  reset(['/workspace']); const calls = [];
  const m = manager({ parseDocuments: async () => [], processResultFilter: async () => undefined }, { git: { getChangedFiles: async (...args) => { calls.push(args); return { root: '/workspace', files: [] }; } } });
  await vscode.commands.executeCommand('codoc.readComments'); assert.equal(calls.length, 0);
  state.inputs.push(''); await vscode.commands.executeCommand('codoc.readComments');
  assert.equal(calls[0][1], 'HEAD'); dispose(m.ctx);
});
test('Git export uses the explicitly selected workspace root', async () => {
  reset(['/one', '/two']); const calls = [];
  const m = manager({ parseDocuments: async () => [], processResultFilter: async () => undefined }, { git: { getChangedFiles: async (...args) => { calls.push(args); return { root: '/two', files: [] }; } } });
  state.picks.push(items => items[1]); state.inputs.push('main'); await vscode.commands.executeCommand('codoc.readComments');
  assert.equal(calls[0][0], '/two'); assert.equal(calls[0][1], 'main'); dispose(m.ctx);
});
test('empty-workspace activation registers commands without configuration writes or dependency installation', async () => {
  reset(); const ctx = context(); await activate(ctx);
  assert.ok(state.commands.has('codoc.scan')); assert.ok(state.commands.has('codoc.configureHighlighting'));
  await vscode.commands.executeCommand('codoc.scan'); assert.match(state.messages.at(-1), /打开工作区/);
  assert.equal(state.writes.length, 0); assert.equal(state.errors.length, 0);
  dispose(ctx); assert.equal(state.commands.size, 0);
});
test('file lifecycle events mark a successful snapshot stale and are disposed', async t => {
  const dir = await temporary(t); const file = path.join(dir, 'a.ts'); await fs.writeFile(file, source('saved'));
  reset([dir]); const ctx = context(path.join(dir, 'storage')); await activate(ctx);
  await vscode.commands.executeCommand('codoc.scan');
  const view = state.trees[0].treeDataProvider;
  state.events.save.fire({ uri: vscode.Uri.file(file) }); assert.match(view.getChildren()[0].label, /待刷新/);
  state.events.rename.fire({ files: [{ oldUri: vscode.Uri.file(file), newUri: vscode.Uri.file(path.join(dir, 'b.ts')) }] });
  assert.ok(view.revision >= 3); dispose(ctx); assert.equal(state.events.save.listeners.size, 0);
});
test('filter selection cancellation does not produce a document', async () => {
  reset(); const docs = new DocParser('/root').parseContent(source('one') + '\n' + source('two').replace('API-1', 'API-2'));
  assert.equal(await new DocumentService().processResultFilter(docs), undefined);
  assert.equal(state.documents.length, 0);
});
test('progress cancellation closes a pending export selection without creating a document', async () => {
  reset(['/workspace']); const docs = new DocParser('/workspace').parseContent(source('one') + '\n' + source('two').replace('API-1', 'API-2'));
  const service = new DocumentService(); service.scanWorkspace = async () => docs;
  const m = manager(service); const original = vscode.window.showQuickPick;
  vscode.window.showQuickPick = (_items, _options, token) => new Promise(resolve => {
    assert.ok(token, 'The selection must receive the progress cancellation token');
    const subscription = token.onCancellationRequested(() => { subscription.dispose(); resolve(undefined); });
    state.uiCancellation.cancel();
  });
  try {
    assert.equal(await vscode.commands.executeCommand('codoc.exportDocs'), undefined);
    assert.equal(state.documents.length, 0); assert.equal(state.errors.length, 0);
    assert.equal(state.contexts.get('codoc.scanEnabled'), true);
  } finally { vscode.window.showQuickPick = original; dispose(m.ctx); }
});
test('a delayed startup cache cannot overwrite a new scan or resurrect a disposed view', async t => {
  const dir = await temporary(t); await fs.writeFile(path.join(dir, 'a.ts'), source('fresh'));
  const original = CacheService.prototype.loadScanResult;
  try {
    for (const scenario of ['scan', 'dispose']) {
      reset([dir]); let release;
      CacheService.prototype.loadScanResult = () => new Promise(resolve => { release = resolve; });
      const ctx = context(); const activation = activate(ctx); const view = state.trees[0].treeDataProvider;
      if (scenario === 'scan') await vscode.commands.executeCommand('codoc.scan');
      else dispose(ctx);
      release({ version: 1, timestamp: new Date().toISOString(), roots: [dir], result: new DocParser(dir).parseContent(source('obsolete')) });
      await activation;
      const labels = view.getChildren().flatMap(group => group.group ? view.getChildren(group).map(item => item.label) : []);
      assert.ok(!labels.includes('obsolete'));
      if (scenario === 'scan') { assert.deepEqual(labels, ['fresh']); dispose(ctx); }
    }
  } finally { CacheService.prototype.loadScanResult = original; }
});
test('cancellation while preparing the cache cannot publish new scan results', async t => {
  const dir = await temporary(t); await fs.writeFile(path.join(dir, 'a.ts'), source('fresh'));
  reset([dir]); const storage = path.join(dir, 'storage'); const cache = new CacheService(vscode.Uri.file(storage), logger);
  await cache.saveScanResult([], [dir], '2026-01-01T00:00:00.000Z');
  const ctx = context(storage); await activate(ctx);
  const original = vscode.workspace.fs.writeFile;
  vscode.workspace.fs.writeFile = async (...args) => { await original(...args); state.uiCancellation.cancel(); };
  try {
    assert.equal(await vscode.commands.executeCommand('codoc.scan'), undefined);
    assert.equal((await cache.loadScanResult([dir])).timestamp, '2026-01-01T00:00:00.000Z');
    assert.equal(state.trees[0].treeDataProvider.getChildren().filter(item => item.group).length, 0);
    assert.equal(state.errors.length, 0);
  } finally { vscode.workspace.fs.writeFile = original; dispose(ctx); }
});
