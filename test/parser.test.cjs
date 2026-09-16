const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DocParser } = require('../out/utils/DocParser');
const { BlockUtils } = require('../out/utils/BlockUtils');
const { FileUtils } = require('../out/utils/FileUtils');
const { associatedIds, ScanCancelled } = require('../out/models/DocModels');
const { ReportGenerator } = require('../out/utils/ReportGenerator');
const root = '/example/project';
const block = (type, body = '- req: API-1', title = '工程约束') => `// @${type} ${title}\n${body.split('\n').map(line => '// ' + line).join('\n')}\n// @end${type.replace(/\(.*/, '').replace(/^./, c => c.toUpperCase())}`;
const parser = () => new DocParser(root);

test('all eleven tag types, line comments and documentation comments', () => {
  for (const type of BlockUtils.blockTypeSet.keys()) {
    const tag = ['summary', 'fix'].includes(type) ? `${type}(ID-123)` : type;
    const source = block(tag);
    for (const text of [source, '/**\n' + source.replace(/^\/\//gm, ' *') + '\n */']) {
      const docs = parser().parseContent(text, 'example.go');
      assert.equal(docs.length, 1); assert.equal(docs[0].type, type); assert.equal(docs[0].title, '工程约束');
      assert.deepEqual(docs[0].req, ['API-1']);
    }
  }
});
test('all five shipped templates and their DocBlock variants parse after placeholder expansion', async () => {
  const snippets = JSON.parse(await fs.readFile(path.resolve(__dirname, '../snippets/comments.code-snippets'), 'utf8'));
  assert.equal(Object.keys(snippets).length, 10);
  for (const [name, snippet] of Object.entries(snippets)) {
    let source = snippet.body.join('\n').replace(/\$\{\d+:([^}]*)\}/g, '$1');
    if (name.startsWith('[DocBlock]')) source = '/**\n * ' + source + '\n */';
    const docs = parser().parseContent(source);
    assert.equal(docs.length, 1, name);
    assert.ok(['summary', 'decision', 'testFocus', 'fix', 'feature'].includes(docs[0].type), name);
  }
});
test('primary bug ID survives related requirements and all associations are searchable', () => {
  const p = parser(); const docs = p.parseContent(block('fix(BUG-456)', '- req: API-1, API-2\n- domain: user，order'));
  assert.equal(docs[0].primaryId, 'BUG-456'); assert.deepEqual(docs[0].req, ['API-1', 'API-2']);
  assert.deepEqual(associatedIds(docs[0]), ['BUG-456', 'API-1', 'API-2']);
  assert.equal(p.applyFilters(docs, ['API-2']).length, 1);
  const md = p.generateMarkdown(docs); assert.match(md, /## BUG-456/); assert.doesNotMatch(md, /devops\.aliyun/);
});
test('IDs are optional and arbitrary identifiers are not truncated', () => {
  const p = parser(); assert.deepEqual(associatedIds(p.parseContent(block('decision', '原因'))[0]), []);
  assert.deepEqual(p.parseContent(block('decision', '- req: TEAM-123-extra, user/value'))[0].req, ['TEAM-123-extra', 'user/value']);
  assert.match(p.generateMarkdown(p.parseContent(block('summary()', '背景'))), /未关联需求/);
});
test('source locations remain one-based with BOM, leading blanks, CRLF and docblocks', () => {
  for (const [prefix, line] of [['', 1], ['\n\n\n', 4], ['// header\n', 2], ['/**\n', 2]]) {
    for (const newline of ['\n', '\r\n']) {
      const text = (prefix + (prefix === '/**\n' ? block('decision').replace(/^\/\//gm, ' *') + '\n */' : block('decision'))).replace(/\n/g, newline);
      assert.equal(parser().parseContent('\uFEFF' + text)[0].line, line);
    }
  }
});
test('Markdown preserves Chinese fields, free text, nesting, fences and explicit links', () => {
  const body = '- req: API-1\n这里是自由正文。\n- 中文字段: 保留内容\n- businessRule:\n  - nested: 不应变成顶层字段\n- checkMethod:\n  ```yaml\n  - req: NOT-A-REAL-LINK\n  ```\n[证据](./evidence.md)';
  const docs = parser().parseContent(block('testFocus', body));
  assert.equal(docs[0].content, body); assert.deepEqual(docs[0].req, ['API-1']);
  assert.ok(ReportGenerator.generateMarkdown(docs).includes(body));
});
test('tags shown inside a fenced example do not close the enclosing annotation', () => {
  const body = '- req: API-1\n```text\n@endDecision\n@feature example\n```';
  const docs = parser().parseContent(block('decision', body));
  assert.equal(docs.length, 1); assert.equal(docs[0].content, body);
});
test('incomplete annotations fail explicitly instead of exporting partial success', () => {
  assert.throws(() => parser().parseContent('// @decision missing\n// why'), /缺少结束标签/);
  assert.throws(() => parser().parseContent('// @decision missing\nconst x = 1;'), /缺少结束标签/);
});
test('successive content parses and empty inputs cannot retain previous results', () => {
  const p = parser(); assert.equal(p.parseContent(block('decision')).length, 1);
  assert.equal(p.parseContent(block('decision')).length, 1); assert.deepEqual(p.parseContent(''), []);
});
test('complete large-file reads, C++ support, duplicate files and independent batches', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codoc-parser-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'large.cpp');
  await fs.writeFile(file, block('decision') + '\n' + '// filler\n'.repeat(120000) + block('deprecated', '- req: API-2', '尾部标注'));
  const p = new DocParser(dir); const docs = await p.parseFiles([file, file]);
  assert.equal(docs.length, 2); assert.equal(docs[1].title, '尾部标注');
  assert.deepEqual(await p.parseFiles([]), []); assert.equal((await p.parseFiles([file])).length, 2);
  assert.ok(FileUtils.getSupportedCodeExtensions().has('.cpp')); assert.ok(!FileUtils.getSupportedCodeExtensions().has('.class'));
});
test('read errors and cancellation reject the whole parse', async () => {
  await assert.rejects(parser().parseFiles(['/missing/file.ts']), /无法读取/);
  await assert.rejects(parser().parseFiles([], { isCancellationRequested: true }), ScanCancelled);
});
test('existing repository example retains both bug IDs and all annotations', async () => {
  const fixture = path.resolve(__dirname, 'test-workspace/src/example.js');
  const docs = await new DocParser(path.dirname(fixture)).parseFiles([fixture]);
  assert.ok(docs.some(item => item.primaryId === 'BUG-456'));
  assert.ok(docs.some(item => item.primaryId === 'BUG-111'));
  assert.ok(ReportGenerator.generateMarkdown(docs).includes('其他自定义内容: 111'));
});
