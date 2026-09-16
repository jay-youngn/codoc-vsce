import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import yauzl from 'yauzl';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function resolveVsixPath(args = process.argv.slice(2)) {
  if (args.length === 2 && args[0] === '--vsix') return path.resolve(args[1]);
  assert.equal(args.length, 0, 'Usage: node scripts/verify-vsix.mjs [--vsix PATH]');
  const manifest = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  return path.join(repositoryRoot, `codoc-${manifest.version}.vsix`);
}
function checkPath(name) {
  assert.ok(name && !/[\\\0]/.test(name) && !path.posix.isAbsolute(name) && !/^[A-Za-z]:/.test(name), `Invalid ZIP path: ${name}`);
  assert.ok(name.replace(/\/$/, '').split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe ZIP path: ${name}`);
}
export async function readArchive(file) {
  const archive = await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, strictFileNames: true }, (error, zip) => error ? reject(error) : resolve(zip)));
  return new Promise((resolve, reject) => {
    const files = new Map(), names = new Set();
    let size = 0, failed = false;
    const fail = error => { if (!failed) { failed = true; archive.close(); reject(error); } };
    archive.on('error', fail);
    archive.on('end', () => resolve(files));
    archive.on('entry', entry => {
      try {
        checkPath(entry.fileName);
        assert.ok(!names.has(entry.fileName), `Duplicate ZIP path: ${entry.fileName}`);
        names.add(entry.fileName);
        assert.notEqual((entry.externalFileAttributes >>> 16) & 0o170000, 0o120000, 'ZIP symlinks are not allowed');
        size += entry.uncompressedSize;
        assert.ok(size <= 8 * 1024 * 1024, 'VSIX exceeds 8 MiB unpacked');
        if (entry.fileName.endsWith('/')) { archive.readEntry(); return; }
        archive.openReadStream(entry, (error, stream) => {
          if (error) return fail(error);
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('error', fail);
          stream.on('end', () => { if (!failed) { files.set(entry.fileName, Buffer.concat(chunks)); archive.readEntry(); } });
        });
      } catch (error) { fail(error); }
    });
    archive.readEntry();
  });
}
function verifyBundle(bundle) {
  const builtinRequire = createRequire(import.meta.url);
  const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
  const requested = new Set(), unexpected = new Set();
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports, Buffer, process, console, setTimeout, clearTimeout, setImmediate, clearImmediate,
    __filename: '/isolated/extension.js', __dirname: '/isolated',
    require(name) {
      requested.add(name);
      if (name === 'vscode') return { TreeItem: class {} };
      if (builtins.has(name.replace(/^node:/, ''))) return builtinRequire(name);
      unexpected.add(name);
      throw new Error(`External npm dependency: ${name}`);
    },
  };
  sandbox.global = sandbox;
  vm.runInNewContext(bundle.toString('utf8'), sandbox, { filename: sandbox.__filename, timeout: 10000 });
  assert.deepEqual([...unexpected], []);
  assert.equal(typeof module.exports.activate, 'function');
  assert.equal(typeof module.exports.deactivate, 'function');
  assert.doesNotMatch(bundle.toString('utf8'), /sourceMappingURL=/);
  console.log(`Bundle loads without npm resolution: ${[...requested].sort().join(', ')}`);
}
export async function verifyVsix(vsixPath) {
  const files = await readArchive(vsixPath);
  const expected = [
    '[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json',
    'extension/readme.md', 'extension/changelog.md', 'extension/LICENSE.txt',
    'extension/dist/extension.js', 'extension/dist/THIRD_PARTY_NOTICES.txt',
    'extension/resources/doc.png', 'extension/resources/code.png', 'extension/snippets/comments.code-snippets',
  ];
  assert.deepEqual([...files.keys()].sort(), expected.sort(), 'VSIX contents must match the publication allowlist');
  for (const [name, bytes] of files) assert.ok(bytes.length, `Empty packaged file: ${name}`);
  const manifest = JSON.parse(files.get('extension/package.json').toString('utf8'));
  assert.equal(manifest.main, './dist/extension.js');
  assert.equal(manifest.engines.vscode, '^1.137.0');
  assert.equal(manifest.vsce.dependencies, false);
  assert.ok(!manifest.extensionDependencies?.length, 'Highlighting must remain optional');
  const assets = [manifest.icon, ...manifest.contributes.snippets.map(item => item.path), ...manifest.contributes.viewsContainers.activitybar.map(item => item.icon)];
  for (const asset of assets) assert.ok(files.has(`extension/${asset.replace(/^\.\//, '')}`), `Missing asset: ${asset}`);
  const notices = files.get('extension/dist/THIRD_PARTY_NOTICES.txt').toString('utf8');
  for (const dependency of ['minimatch', 'brace-expansion', 'balanced-match']) assert.ok(notices.includes(`${dependency}@`), `Missing bundled license: ${dependency}`);
  verifyBundle(files.get('extension/dist/extension.js'));
  const size = (await fs.stat(vsixPath)).size;
  console.log(`VSIX verified: ${path.basename(vsixPath)}, ${files.size} files, ${size} bytes; bundle ${files.get('extension/dist/extension.js').length} bytes`);
  return { files, manifest, size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await verifyVsix(await resolveVsixPath()); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
