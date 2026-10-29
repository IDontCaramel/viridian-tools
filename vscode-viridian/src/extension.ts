import * as vscode from "vscode";
import { printParseErrorCode } from "jsonc-parser";
import { loadCatalog } from "./catalog/load.ts";
import { DatapackIndex, type IndexedLocation } from "./datapack/index.ts";
import { classifyPath } from "./datapack/paths.ts";
import { complete } from "./analysis/complete.ts";
import { hover } from "./analysis/hover.ts";
import { scaffolds } from "./features/scaffolds.ts";
import { registerCommands } from "./features/commands.ts";
import { ZIP_SCHEME, ZipFileSystem } from "./features/zip.ts";

import { registerOriginPreview } from "./features/preview.ts";

const FILES = "**/data/*/{powers,origins,origin_layers,badges,global_powers}/**/*.{json,jsonc,json5}";
const decoder = new TextDecoder();
export function activate(context: vscode.ExtensionContext): void {
  const index = new DatapackIndex(loadCatalog());
  const diagnostics = vscode.languages.createDiagnosticCollection("viridian");
  const output = vscode.window.createOutputChannel("Viridian");
  const zip = new ZipFileSystem();
  context.subscriptions.push(diagnostics, output, zip,
    vscode.workspace.registerFileSystemProvider(ZIP_SCHEME, zip, { isCaseSensitive: true, isReadonly: true }));
  const openedArchives = new Map<string, vscode.Uri>();
  let pending: Promise<void> = Promise.resolve();
  const enqueue = (job: () => Promise<void>) => {
    pending = pending.then(job).catch(error => { output.appendLine(String(error)); });
    return pending;
  };
  function range(uri: string, offset: number, length: number): vscode.Range {
    const lines = index.files.get(uri)?.lineOffsets ?? [0];
    const position = (value: number) => {
      let low = 0, high = lines.length;
      while (low + 1 < high) { const mid = (low + high) >>> 1; if (lines[mid]! <= value) low = mid; else high = mid; }
      return new vscode.Position(low, value - lines[low]!);
    };
    return new vscode.Range(position(offset), position(offset + length));
  }
  const location = (item: IndexedLocation) => new vscode.Location(vscode.Uri.parse(item.uri), range(item.uri, item.offset, item.length));
  let refreshPreview = () => {};
  function publish(): void {
    refreshPreview();
    diagnostics.clear();
    for (const [uri, file] of index.files) {
      const settings = vscode.workspace.getConfiguration("viridian.validation", vscode.Uri.parse(uri));
      if (!settings.get("enable", true)) continue;
      const unknown = settings.get<"warning" | "information" | "off">("unknownFields", "warning");
      const missing = settings.get<"warning" | "information" | "off">("missingReferences", "warning");
      const problems = [...file.analysis.problems, ...index.missingReferences(uri, missing)];
      const items: vscode.Diagnostic[] = [];
      for (const problem of problems) {
        if (problem.code === "unknown-field" && unknown === "off") continue;
        const level = problem.code === "unknown-field" ? unknown : problem.severity;
        const severity = level === "error" ? vscode.DiagnosticSeverity.Error : level === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
        const diagnostic = new vscode.Diagnostic(range(uri, problem.offset, problem.length), problem.message, severity);
        diagnostic.code = problem.code; diagnostic.source = "Viridian"; items.push(diagnostic);
      }
      for (const error of file.analysis.parsed.syntaxErrors) {
        const diagnostic = new vscode.Diagnostic(range(uri, error.offset, Math.max(1, error.length)), printParseErrorCode(error.error), vscode.DiagnosticSeverity.Error);
        diagnostic.source = "Viridian"; diagnostic.code = "syntax"; items.push(diagnostic);
      }
      diagnostics.set(vscode.Uri.parse(uri), items);
    }
  }
  async function isPackFile(uri: vscode.Uri): Promise<boolean> {
    const file = classifyPath(uri.path);
    if (!file) return false;
    try { await vscode.workspace.fs.stat(uri.with({ path: `${file.packRoot}/pack.mcmeta` })); return true; }
    catch { return false; }
  }
  async function update(uri: vscode.Uri): Promise<void> {
    if (!await isPackFile(uri)) { index.remove(uri.toString()); return; }
    const open = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString() && !document.isClosed);
    try { index.update(uri.toString(), open?.getText() ?? decoder.decode(await vscode.workspace.fs.readFile(uri)), uri.path); }
    catch { index.remove(uri.toString()); }
  }
  async function mount(uri: vscode.Uri): Promise<vscode.Uri[]> {
    try { return await zip.mount(uri); }
    catch (error) { output.appendLine(`Cannot read ${uri.fsPath}: ${error}`); return []; }
  }
  async function scan(): Promise<void> {
    index.clear();
    for (const uri of await vscode.workspace.findFiles(FILES)) await update(uri);
    const archives = new Map(openedArchives);
    for (const archive of await vscode.workspace.findFiles("**/*.zip")) archives.set(archive.toString(), archive);
    for (const archive of archives.values()) for (const uri of await mount(archive)) if (classifyPath(uri.path)) await update(uri);
    for (const document of vscode.workspace.textDocuments) if (classifyPath(document.uri.path)) await update(document.uri);
    publish();
  }
  const ready = enqueue(scan);
  async function prepare(document: vscode.TextDocument) {
    await ready;
    await enqueue(async () => { await update(document.uri); publish(); });
    return index.files.get(document.uri.toString());
  }
  const selector: vscode.DocumentSelector = [{ scheme: "file", pattern: FILES }, { scheme: ZIP_SCHEME, pattern: FILES }];
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, {
      async provideCompletionItems(document, position) {
        const file = await prepare(document);
        if (!file) return [];
        const candidates = document.getText().trim() === "" ? scaffolds(file.analysis.parsed.file.kind)
          : complete(file.text, file.analysis.parsed.root, document.offsetAt(position), file.analysis.parsed.schema, index);
        return candidates.map(candidate => {
          const kinds = { property: vscode.CompletionItemKind.Property, type: vscode.CompletionItemKind.Class, value: vscode.CompletionItemKind.Value, reference: vscode.CompletionItemKind.Reference, snippet: vscode.CompletionItemKind.Snippet };
          const item = new vscode.CompletionItem(candidate.label, kinds[candidate.kind]);
          item.insertText = new vscode.SnippetString(candidate.insertText);
          item.detail = candidate.detail;
          item.documentation = candidate.documentation ? new vscode.MarkdownString(candidate.documentation) : undefined;
          item.filterText = candidate.filterText; item.sortText = candidate.sortText;
          if (candidate.range) item.range = range(document.uri.toString(), candidate.range.offset, candidate.range.length);
          else item.range = new vscode.Range(position, position);
          return item;
        });
      },
    }, '"', ":"),
    vscode.languages.registerHoverProvider(selector, {
      async provideHover(document, position) {
        const file = await prepare(document); if (!file) return;
        const info = hover(file.analysis.parsed.root, document.offsetAt(position), file.analysis.parsed.schema,
          (kind, id) => index.definitions(kind, id).map(def => vscode.Uri.parse(def.uri).path).concat(index.has(kind, id) && !index.definitions(kind, id).length ? ["Viridian built-in data"] : []));
        return info ? new vscode.Hover(new vscode.MarkdownString(info.markdown), range(document.uri.toString(), info.offset, info.length)) : undefined;
      },
    }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        await prepare(document);
        const symbol = index.symbolAt(document.uri.toString(), document.offsetAt(position));
        return symbol ? index.definitions(symbol.kind, symbol.id).map(location) : [];
      },
    }),
    vscode.languages.registerReferenceProvider(selector, {
      async provideReferences(document, position, options) {
        await prepare(document);
        const symbol = index.symbolAt(document.uri.toString(), document.offsetAt(position));
        return symbol ? [...index.references(symbol.kind, symbol.id), ...options.includeDeclaration ? index.definitions(symbol.kind, symbol.id) : []].map(location) : [];
      },
    }),
    vscode.workspace.onDidOpenTextDocument(document => { if (classifyPath(document.uri.path)) void enqueue(async () => { await update(document.uri); publish(); }); }),
    vscode.workspace.onDidChangeTextDocument(event => { if (classifyPath(event.document.uri.path)) void enqueue(async () => { await update(event.document.uri); publish(); }); }),
    vscode.workspace.onDidCloseTextDocument(document => { if (classifyPath(document.uri.path)) void enqueue(async () => { await update(document.uri); publish(); }); }),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration("viridian.validation")) publish(); }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void enqueue(scan); }),
    vscode.commands.registerCommand("viridian.reindex", () => enqueue(scan)),
    vscode.commands.registerCommand("viridian.openZip", async (uri?: vscode.Uri) => {
      uri ??= (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Datapack zip": ["zip"] } }))?.[0];
      if (!uri) return;
      openedArchives.set(uri.toString(), uri);
      let entries: vscode.Uri[] = [];
      await enqueue(async () => { entries = await mount(uri!); for (const entry of entries) if (classifyPath(entry.path)) await update(entry); publish(); });
      const selected = await vscode.window.showQuickPick(entries.filter(entry => index.files.has(entry.toString())).map(entry => ({ label: entry.path.slice(1), uri: entry })), { placeHolder: "Open a datapack file, read-only" });
      if (selected) await vscode.window.showTextDocument(selected.uri);
    }),
  );
  const watcher = vscode.workspace.createFileSystemWatcher("**/{data/**,pack.mcmeta,*.zip}");
  context.subscriptions.push(watcher);
  for (const event of [watcher.onDidCreate, watcher.onDidChange, watcher.onDidDelete]) context.subscriptions.push(event(uri => {
    if (uri.path.endsWith(".zip") || uri.path.endsWith("/pack.mcmeta")) void enqueue(scan);
    else if (classifyPath(uri.path)) void enqueue(async () => { await update(uri); publish(); });
  }));
  refreshPreview = registerOriginPreview(context, index, prepare);
  registerCommands(context);
}
