const assert = require('assert').strict;
const fs = require('fs').promises;
const path = require('path');
const vscode = require('vscode');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (await predicate()) return; await pause(100); }
  throw new Error(message);
}
async function verify() {
  const checks = [];
  const extension = vscode.extensions.getExtension('jay-youngn.codoc');
  assert.ok(extension, 'Installed extension must be discoverable');
  assert.equal(await fs.realpath(extension.extensionPath), await fs.realpath(process.env.CODOC_EXPECTED_PATH));
  assert.equal(vscode.extensions.getExtension('edwinhuish.better-comments-next'), undefined);
  const before = vscode.workspace.getConfiguration('better-comments').inspect('tags');
  await extension.activate();
  assert.ok(extension.isActive);
  const commands = await vscode.commands.getCommands(true);
  for (const command of extension.packageJSON.contributes.commands) assert.ok(commands.includes(command.command));
  assert.deepEqual(vscode.workspace.getConfiguration('better-comments').inspect('tags'), before);
  checks.push('activation', 'command registration', 'no automatic settings changes', 'no highlighting dependency');
  if (process.env.CODOC_SCENARIO === 'empty') {
    assert.equal(vscode.workspace.workspaceFolders, undefined);
    assert.equal(await vscode.commands.executeCommand('codoc.scan'), undefined);
    assert.equal(await vscode.commands.executeCommand('codoc.exportDocs'), undefined);
    checks.push('empty workspace');
  } else {
    assert.equal(vscode.workspace.workspaceFolders.length, 2);
    const docs = await vscode.commands.executeCommand('codoc.scan');
    assert.ok(Array.isArray(docs), 'Scan must complete successfully');
    assert.equal(docs.length, 2); assert.equal(new Set(docs.map(doc => doc.workspaceRoot)).size, 2);
    assert.ok(docs.every(doc => doc.line === 3 && doc.req[0] === 'API-1'));
    checks.push('multi-root scan', 'C++', 'line coordinates');
    for (const command of ['codoc.viewByReq', 'codoc.viewByDomain', 'codoc.viewByType']) await vscode.commands.executeCommand(command);
    await vscode.commands.executeCommand('codoc-tree.focus');
    await pause(500);
    await vscode.commands.executeCommand('list.focusFirst');
    await vscode.commands.executeCommand('list.focusDown');
    await vscode.commands.executeCommand('list.expand');
    await pause(300);
    await vscode.commands.executeCommand('list.focusDown');
    await vscode.commands.executeCommand('list.select');
    await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'file', 'Selecting a tree annotation must open its source');
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor.selection.start.line, 2);
    assert.ok(docs.some(doc => path.resolve(doc.workspaceRoot, doc.file) === editor.document.uri.fsPath));
    checks.push('three view modes', 'tree selection opens exact source line');
    const first = await vscode.commands.executeCommand('codoc.exportDocs');
    assert.equal(first?.scheme, 'untitled');
    const firstDoc = await vscode.workspace.openTextDocument(first);
    assert.equal(firstDoc.languageId, 'markdown');
    assert.ok(firstDoc.getText().includes('第一版'));
    assert.ok(firstDoc.getText().includes('中文说明，保留正文。\n- 列表:\n  - 嵌套内容'));
    const source = path.join(process.env.CODOC_FIXTURE, 'first.ts');
    await fs.writeFile(source, (await fs.readFile(source, 'utf8')).replace('第一版', '保存后更新'));
    await pause(1000);
    const second = await vscode.commands.executeCommand('codoc.exportDocs');
    assert.equal(second?.scheme, 'untitled'); assert.notEqual(second.toString(), first.toString());
    const secondDoc = await vscode.workspace.openTextDocument(second);
    assert.ok(secondDoc.getText().includes('保存后更新'));
    assert.ok(!secondDoc.getText().includes('第一版'));
    assert.equal(firstDoc.isClosed, false);
    assert.ok(firstDoc.getText().includes('第一版'));
    checks.push('fresh Markdown exports', 'retained previous untitled document', 'Chinese and nested body');
  }
  await fs.writeFile(process.env.CODOC_RESULT, JSON.stringify({ success: true, extensionPath: extension.extensionPath, vscodeVersion: vscode.version, nodeVersion: process.versions.node, checks }));
}
exports.run = async () => {
  let timer;
  try { await Promise.race([verify(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CoDoc host integration timed out')), 90000); })]); }
  finally { clearTimeout(timer); }
};
