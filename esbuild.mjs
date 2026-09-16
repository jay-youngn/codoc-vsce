import * as esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const directory = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
for (const arg of args) if (!['--production', '--watch'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
const production = args.has('--production');
const watch = args.has('--watch');
if (production && watch) throw new Error('Production watch is not supported');
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

async function notices(result) {
  const packages = new Map();
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.split('/').includes('node_modules')) continue;
    let directory = path.dirname(path.resolve(root, input));
    while (directory.split(path.sep).includes('node_modules')) {
      const manifest = await readFile(path.join(directory, 'package.json'), 'utf8').then(JSON.parse).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
      if (manifest?.name && manifest?.version) { packages.set(directory, manifest); break; }
      directory = path.dirname(directory);
    }
  }
  const sections = [];
  for (const [directory, manifest] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const names = (await readdir(directory)).filter(name => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name)).sort();
    if (!names.some(name => /^(licen[cs]e|copying)(\.|$)/i.test(name))) throw new Error(`Missing license: ${manifest.name}`);
    const texts = await Promise.all(names.map(async name => `${name}\n\n${(await readFile(path.join(directory, name), 'utf8')).trim()}`));
    sections.push(`${manifest.name}@${manifest.version}\nLicense: ${manifest.license}\n\n${texts.join('\n\n')}`);
  }
  const legal = result.outputFiles.filter(file => file.path.endsWith('.LEGAL.txt')).map(file => file.text.trim()).filter(Boolean);
  return ['Third-Party Notices', ...sections, ...legal].join('\n\n--------------------\n\n') + '\n';
}
async function save(result) {
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imported of output.imports) {
      if (imported.external && imported.path !== 'vscode' && !builtins.has(imported.path.replace(/^node:/, ''))) throw new Error(`Unbundled dependency: ${imported.path}`);
    }
  }
  const license = await notices(result);
  await mkdir(directory, { recursive: true });
  for (const file of result.outputFiles) if (!file.path.endsWith('.LEGAL.txt')) await writeFile(file.path, file.contents);
  await writeFile(path.join(directory, 'THIRD_PARTY_NOTICES.txt'), license);
  await rm(path.join(directory, 'extension.js.LEGAL.txt'), { force: true });
  if (production) await rm(path.join(directory, 'extension.js.map'), { force: true });
}
const options = {
  absWorkingDir: root, entryPoints: ['src/extension.ts'], outfile: path.join(directory, 'extension.js'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['vscode'],
  minify: production, sourcemap: production ? false : 'linked', write: false, metafile: true,
  legalComments: 'external', banner: { js: '/* Third-party licenses: THIRD_PARTY_NOTICES.txt */' }, logLevel: 'silent',
  plugins: [{ name: 'artifacts', setup(build) {
    build.onStart(() => { if (watch) console.log('[watch] build started'); });
    build.onEnd(async result => {
      const extra = [];
      if (!result.errors.length) { try { await save(result); } catch (error) { extra.push({ text: error.message }); } }
      for (const [kind, messages] of [['error', [...result.errors, ...extra]], ['warning', result.warnings]]) {
        for (const message of messages) console.error(`${message.location?.file || 'esbuild.mjs'}:${message.location?.line || 1}:${(message.location?.column ?? 0) + 1}: ${kind}: ${message.text}`);
      }
      if (watch) console.log('[watch] build finished');
      return { errors: extra };
    });
  } }],
};
if (watch) {
  const context = await esbuild.context(options);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await context.dispose(); process.exit(0); });
  await context.watch();
} else {
  try { await esbuild.build(options); } catch { process.exitCode = 1; }
}
