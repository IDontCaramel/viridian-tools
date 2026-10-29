import assert from "node:assert/strict";
import * as vscode from "vscode";
import Mocha from "mocha";
import { renderOriginPreview } from "../../src/features/preview.ts";
import { DatapackIndex } from "../../src/datapack/index.ts";
import { loadCatalog } from "../../src/catalog/load.ts";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) { if (check()) return; await pause(100); }
  assert.fail("Timed out waiting for extension diagnostics");
}
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", timeout: 30000 });
  mocha.suite.emit("pre-require", globalThis, "integration", mocha);
  suite("Viridian extension", () => {
    const root = vscode.workspace.workspaceFolders![0]!.uri;
    const uri = (path: string) => vscode.Uri.joinPath(root, "pack", path);
    suiteSetup(async () => {
      const extension = vscode.extensions.getExtension("caramel.vscode-viridian");
      assert.ok(extension); await extension.activate();
      await vscode.commands.executeCommand("viridian.reindex");
    });
    test("origin preview opens beside the editor and safely renders live data", async () => {
      const document = await vscode.workspace.openTextDocument(uri("data/demo/origins/bird.json"));
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("viridian.previewOrigin");
      await until(() => vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputWebview && tab.label === "Origin preview")));
      const index = new DatapackIndex(loadCatalog());
      const path = "/pack/data/demo/origins/test.json";
      index.update(path, JSON.stringify({ name: "<script>bad</script>", impact: "HIGH", powers: ["demo:test"] }));
      index.update("/pack/data/demo/powers/test.json", JSON.stringify({ type: "apoli:dummy", name: "Flight", description: "Fly freely" }));
      const html = renderOriginPreview(path, index);
      assert.ok(html.includes("&lt;script&gt;bad&lt;/script&gt;"));
      assert.ok(html.includes("High"));
      assert.ok(html.includes("Fly freely"));
      index.update(path, '{"name": "Updated", "impact": 0}');
      assert.ok(renderOriginPreview(path, index).includes("Updated"));
      assert.ok(renderOriginPreview(path, index).includes("No powers."));
      index.update(path, '{');
      assert.ok(renderOriginPreview(path, index).includes("Fix the JSON errors"));
    });
    test("diagnostics, completion, hover, definition and references", async () => {
      const document = await vscode.workspace.openTextDocument(uri("data/demo/origins/bird.json"));
      await vscode.window.showTextDocument(document);
      await until(() => vscode.languages.getDiagnostics(document.uri).some(d => d.source === "Viridian" && d.code === "missing-reference"));
      const problems = vscode.languages.getDiagnostics(document.uri).filter(d => d.source === "Viridian");
      assert.ok(problems.some(d => d.code === "unknown-field"));
      const position = document.positionAt(document.getText().indexOf("demo:flight_toggle") + 3);
      const completions = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", document.uri, position);
      assert.ok(completions?.items.some(item => item.label === "demo:flight_toggle"));
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", document.uri, position);
      assert.ok(hovers?.some(item => item.contents.some(content => (typeof content === "string" ? content : content.value).includes("Defined in"))), JSON.stringify(hovers));
      const definitions = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", document.uri, position);
      assert.ok(definitions?.some(item => item.uri.path.endsWith("powers/flight.json") && item.range.start.line === 2));
      const references = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", document.uri, position);
      assert.ok(references?.some(item => item.uri.toString() === document.uri.toString()));
      const powerDocument = await vscode.workspace.openTextDocument(uri("data/demo/powers/flight.json"));
      const typePosition = powerDocument.positionAt(powerDocument.getText().indexOf("apoli:multiple") + 7);
      const types = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", powerDocument.uri, typePosition);
      assert.ok(types?.items.some(item => item.label === "apoli:resource"));
      const typeHovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", powerDocument.uri, typePosition);
      assert.ok(typeHovers?.some(item => item.contents.some(content => (typeof content === "string" ? content : content.value).includes("Power type"))), JSON.stringify(typeHovers));
    });
    test("unsaved edits refresh references and validation settings", async () => {
      const document = await vscode.workspace.openTextDocument(uri("data/demo/origins/bird.json"));
      const editor = await vscode.window.showTextDocument(document);
      const original = document.getText();
      const missing = original.indexOf("demo:missing");
      await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(missing), document.positionAt(missing + "demo:missing".length)), "demo:flight"));
      await until(() => !vscode.languages.getDiagnostics(document.uri).some(d => d.source === "Viridian" && d.code === "missing-reference"));
      const config = vscode.workspace.getConfiguration("viridian.validation");
      await config.update("enable", false, vscode.ConfigurationTarget.Global);
      await until(() => !vscode.languages.getDiagnostics(document.uri).some(d => d.source === "Viridian"));
      await config.update("enable", true, vscode.ConfigurationTarget.Global);
      await until(() => vscode.languages.getDiagnostics(document.uri).some(d => d.code === "unknown-field" && d.source === "Viridian"));
      await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), original));
    });
    test("file watcher refreshes missing references on create and delete", async () => {
      const origin = uri("data/demo/origins/bird.json");
      const power = uri("data/demo/powers/missing.json");
      await vscode.workspace.fs.writeFile(power, new TextEncoder().encode('{"type":"apoli:dummy"}'));
      await until(() => !vscode.languages.getDiagnostics(origin).some(d => d.source === "Viridian" && d.code === "missing-reference"));
      await vscode.workspace.fs.delete(power);
      await until(() => vscode.languages.getDiagnostics(origin).some(d => d.source === "Viridian" && d.code === "missing-reference"));
    });
    test("zipped datapacks are indexed and readable through the readonly filesystem", async () => {
      const archive = vscode.Uri.joinPath(root, "archive.zip");
      const origin = vscode.Uri.from({ scheme: "viridian-zip", path: "/nested/data/zipped/origins/test.json", query: new URLSearchParams({ archive: archive.toString() }).toString() });
      const document = await vscode.workspace.openTextDocument(origin);
      await vscode.window.showTextDocument(document);
      const definitions = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", origin, document.positionAt(document.getText().indexOf("zipped:test") + 2));
      assert.equal(definitions?.[0]?.uri.scheme, "viridian-zip");
      assert.ok((await vscode.workspace.fs.stat(origin)).permissions! & vscode.FilePermission.Readonly);
      await assert.rejects(async () => vscode.workspace.fs.writeFile(origin, new TextEncoder().encode("{}")));
      assert.ok(!vscode.languages.getDiagnostics(origin).some(d => d.code === "missing-reference"));
    });
  });
  await new Promise<void>((resolve, reject) => mocha.run(failures => failures ? reject(new Error(`${failures} integration tests failed`)) : resolve()));
}
