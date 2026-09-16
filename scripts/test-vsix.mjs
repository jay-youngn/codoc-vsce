import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { repositoryRoot, resolveVsixPath, verifyVsix } from './verify-vsix.mjs';

const execute = promisify(execFile);
async function testVsix(vsixPath) {
  const { files, manifest } = await verifyVsix(vsixPath);
  let executable = process.env.VSCODE_EXECUTABLE_PATH || await downloadAndUnzipVSCode({ version: process.env.VSCODE_VERSION || 'stable', cachePath: path.join(repositoryRoot, '.vscode-test') });
  // Recent stable macOS builds renamed the binary; test-electron 2.x expects Electron.
  if (process.platform === 'darwin' && path.basename(executable) === 'Electron' && !await fs.access(executable).then(() => true, () => false)) {
    const renamed = path.join(path.dirname(executable), 'Code');
    await fs.access(renamed);
    executable = renamed;
  }
  // Keep macOS IPC socket paths below the platform's 104-character limit.
  const temporary = await fs.mkdtemp(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'cd-'));
  try {
    const extensions = path.join(temporary, 'extensions');
    const data = path.join(temporary, 'data');
    const tests = path.join(temporary, 'test.cjs');
    await fs.copyFile(path.join(repositoryRoot, 'test/integration/index.cjs'), tests);
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
    const install = await execute(cli, [...args, `--user-data-dir=${data}`, `--extensions-dir=${extensions}`, '--install-extension', vsixPath, '--force'], {
      timeout: 120000, maxBuffer: 4 * 1024 * 1024, shell: process.platform === 'win32',
    });
    console.log(install.stdout.trim());
    const name = (await fs.readdir(extensions)).find(name => name === `${manifest.publisher}.${manifest.name}-${manifest.version}` || name.startsWith(`${manifest.publisher}.${manifest.name}-${manifest.version}-`));
    assert.ok(name, 'The actual VSIX must be installed into the isolated extensions directory');
    const extension = path.join(extensions, name);
    assert.deepEqual(await fs.readFile(path.join(extension, 'dist/extension.js')), files.get('extension/dist/extension.js'));
    for (const scenario of ['multi-root', 'empty']) {
      const workspace = path.join(temporary, 'fixture.code-workspace');
      const folders = ['one', 'two'].map(name => path.join(temporary, name));
      for (const folder of folders) await fs.mkdir(folder, { recursive: true });
      const fixture = title => `\n\n// @decision ${title}\n// - req: API-1\n// - domain: user\n// 中文说明，保留正文。\n// - 列表:\n//   - 嵌套内容\n// @endDecision\nconst value = 1;\n`;
      await fs.writeFile(path.join(folders[0], 'first.ts'), fixture('第一版'));
      await fs.writeFile(path.join(folders[1], 'second.cpp'), fixture('第二目录'));
      await fs.writeFile(workspace, JSON.stringify({ folders: folders.map(folder => ({ path: folder })), settings: { 'telemetry.telemetryLevel': 'off' } }));
      const resultPath = path.join(temporary, `result-${scenario}.json`);
      await runTests({
        vscodeExecutablePath: executable, extensionDevelopmentPath: extension, extensionTestsPath: tests,
        extensionTestsEnv: { CODOC_EXPECTED_PATH: extension, CODOC_RESULT: resultPath, CODOC_SCENARIO: scenario, CODOC_FIXTURE: folders[0], NODE_PATH: '' },
        launchArgs: [
          ...(scenario === 'multi-root' ? [workspace] : ['--new-window']),
          `--user-data-dir=${path.join(temporary, scenario)}`, `--extensions-dir=${extensions}`,
          '--disable-telemetry', '--disable-updates', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
        ],
      });
      const result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
      assert.equal(result.success, true);
      assert.equal(await fs.realpath(result.extensionPath), await fs.realpath(extension));
      console.log(`Installed VSIX passed: VS Code ${result.vscodeVersion}, Node ${result.nodeVersion}, ${scenario}: ${result.checks.join(', ')}`);
    }
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
try { await testVsix(await resolveVsixPath()); }
catch (error) { console.error(error); process.exitCode = 1; }
