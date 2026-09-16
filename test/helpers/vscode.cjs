const Module = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { minimatch } = require('minimatch');
const manifest = require('../../package.json');

class EventEmitter {
  listeners = new Set();
  event = listener => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; };
  fire(value) { for (const listener of this.listeners) listener(value); }
  dispose() { this.listeners.clear(); }
}
class CancellationTokenSource {
  constructor() {
    this.emitter = new EventEmitter();
    this.token = { isCancellationRequested: false, onCancellationRequested: this.emitter.event };
  }
  cancel() { this.token.isCancellationRequested = true; this.emitter.fire(); }
  dispose() { this.emitter.dispose(); }
}
class Uri {
  constructor(scheme, fsPath, value) { this.scheme = scheme; this.fsPath = fsPath; this.value = value; }
  static file(value) { const resolved = path.resolve(value); return new Uri('file', resolved, pathToFileURL(resolved).href); }
  static parse(value) { return value.startsWith('file:') ? Uri.file(fileURLToPath(value)) : new Uri(value.split(':')[0], value.slice(value.indexOf(':') + 1), value); }
  static joinPath(base, ...parts) { return Uri.file(path.join(base.fsPath, ...parts)); }
  toString() { return this.value; }
}
class Range { constructor(line, character, endLine, endCharacter) { this.start = { line, character }; this.end = { line: endLine, character: endCharacter }; } }
class TreeItem { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } }
class RelativePattern { constructor(base, pattern) { this.baseUri = base.uri || base; this.pattern = pattern; } }
const state = {};
let sequence = 0;
function reset(folders = []) {
  Object.assign(state, {
    folders: folders.map((root, index) => ({ uri: Uri.file(root), name: path.basename(root), index })),
    documents: [], commands: new Map(), contexts: new Map(), calls: [], inputs: [], picks: [],
    messages: [], warnings: [], errors: [], logs: [], writes: [], settings: {}, events: {}, watchers: [], trees: [],
    extensions: new Map(), uiCancellation: new CancellationTokenSource(), findFiles: undefined,
  });
}
reset();
function event(name) { return (state.events[name] ||= new EventEmitter()).event; }
function setting(section, key) {
  const id = section ? `${section}.${key}` : key;
  return state.settings[id] ||= { defaultValue: manifest.contributes.configuration.properties[id]?.default };
}
async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const vscode = {
  Uri, Range, TreeItem, RelativePattern, EventEmitter, CancellationTokenSource,
  CancellationError: class extends Error {}, ThemeIcon: class { constructor(id) { this.id = id; } },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }, ProgressLocation: { Notification: 15 },
  extensions: { getExtension: id => state.extensions.get(id) },
  workspace: {
    get workspaceFolders() { return state.folders; }, get textDocuments() { return state.documents; },
    getWorkspaceFolder(uri) { return [...state.folders].sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length).find(folder => uri.fsPath === folder.uri.fsPath || uri.fsPath.startsWith(folder.uri.fsPath + path.sep)); },
    getConfiguration(section) {
      return {
        get: (key, fallback) => { const s = setting(section, key); return s.workspaceValue ?? s.globalValue ?? s.defaultValue ?? fallback; },
        inspect: key => ({ ...setting(section, key) }),
        update: async (key, value, target) => { setting(section, key)[target === 1 ? 'globalValue' : 'workspaceValue'] = value; state.writes.push({ section, key, value, target }); },
      };
    },
    async findFiles(pattern, exclude, _max, token) {
      if (state.findFiles) return state.findFiles(pattern, exclude, token);
      const root = pattern.baseUri.fsPath;
      return (await walk(root)).filter(file => minimatch(path.relative(root, file), pattern.pattern) && (!exclude || !minimatch(path.relative(root, file), exclude, { dot: true }))).map(Uri.file);
    },
    async openTextDocument(input) {
      const uri = input instanceof Uri ? input : Uri.parse(`untitled:CoDoc-${++sequence}`);
      const content = input instanceof Uri ? await fs.readFile(uri.fsPath, 'utf8') : input.content;
      const doc = { uri, getText: () => content, isDirty: uri.scheme === 'untitled', isUntitled: uri.scheme === 'untitled', languageId: input.language || 'typescript' };
      state.documents.push(doc); return doc;
    },
    fs: {
      async readFile(uri) { try { return await fs.readFile(uri.fsPath); } catch (error) { if (error.code === 'ENOENT') error.code = 'FileNotFound'; throw error; } },
      writeFile: (uri, bytes) => fs.writeFile(uri.fsPath, bytes), createDirectory: uri => fs.mkdir(uri.fsPath, { recursive: true }),
      rename: (a, b) => fs.rename(a.fsPath, b.fsPath),
      delete: uri => fs.unlink(uri.fsPath),
    },
    onDidSaveTextDocument: listener => event('save')(listener), onDidCreateFiles: listener => event('create')(listener),
    onDidDeleteFiles: listener => event('delete')(listener), onDidRenameFiles: listener => event('rename')(listener),
    onDidChangeWorkspaceFolders: listener => event('folders')(listener),
    createFileSystemWatcher() {
      const change = new EventEmitter(), create = new EventEmitter(), remove = new EventEmitter();
      const watcher = { onDidChange: change.event, onDidCreate: create.event, onDidDelete: remove.event, change, create, remove, dispose() { change.dispose(); create.dispose(); remove.dispose(); } };
      state.watchers.push(watcher); return watcher;
    },
  },
  commands: {
    registerCommand(name, fn) { state.commands.set(name, fn); return { dispose: () => state.commands.delete(name) }; },
    async executeCommand(name, ...args) {
      state.calls.push({ name, args });
      if (name === 'setContext') { state.contexts.set(...args); return; }
      if (name === 'vscode.open') {
        const doc = await vscode.workspace.openTextDocument(args[0]);
        return vscode.window.showTextDocument(doc, args[1]);
      }
      return state.commands.get(name)?.(...args);
    },
  },
  window: {
    async showInputBox() { return state.inputs.shift(); },
    async showQuickPick(items) { const choice = state.picks.shift(); return typeof choice === 'function' ? choice(items) : choice; },
    async showInformationMessage(message) { state.messages.push(message); },
    async showWarningMessage(message) { state.warnings.push(message); },
    async showErrorMessage(message) { state.errors.push(message); },
    async withProgress(_options, fn) { return fn({ report() {} }, state.uiCancellation.token); },
    async showTextDocument(document, options) { const editor = { document, selection: options?.selection }; state.activeEditor = editor; return editor; },
    createTreeView(_id, options) { const tree = { ...options, dispose() {} }; state.trees.push(tree); return tree; },
    createOutputChannel() { return { debug() {}, info() {}, warn(message) { state.logs.push(message); }, error(message) { state.logs.push(message); }, dispose() {} }; },
  },
};
function install() {
  const original = Module._load;
  Module._load = function (name, parent, main) { return name === 'vscode' ? vscode : original.call(this, name, parent, main); };
  return () => { Module._load = original; };
}
function context(storage) { return { storageUri: storage ? Uri.file(storage) : undefined, subscriptions: [] }; }
function dispose(ctx) { for (const disposable of ctx.subscriptions) disposable.dispose(); }
const logger = { info() {}, warn(message) { state.logs.push(message); }, error(message) { state.logs.push(message); } };
module.exports = { vscode, state, reset, install, context, dispose, logger };
