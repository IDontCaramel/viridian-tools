import * as vscode from "vscode";
import { parseIdentifier } from "../catalog/identifier.ts";
import type { DocumentKind } from "../catalog/types.ts";
import { classifyPath, pathFor } from "../datapack/paths.ts";
import { initialDocument } from "./scaffolds.ts";

export const PACK_METADATA = { pack: { description: "A Viridian Origins datapack", min_format: 121, max_format: 121 } };
const encoder = new TextEncoder();
async function exists(uri: vscode.Uri): Promise<boolean> {
  try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
}
export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand("viridian.newDatapack", async () => {
    const parent = (await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Create datapack here" }))?.[0];
    if (!parent) return;
    const name = await vscode.window.showInputBox({ prompt: "Datapack folder name", value: "my-datapack", validateInput: value => /^[a-z0-9_-]+$/.test(value) ? undefined : "Use lowercase letters, numbers, underscores or hyphens." });
    if (!name) return;
    const root = vscode.Uri.joinPath(parent, name);
    if (await exists(root)) { void vscode.window.showErrorMessage("That folder already exists. Choose a new folder name."); return; }
    await vscode.workspace.fs.createDirectory(root);
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(vscode.Uri.joinPath(root, "pack.mcmeta"), { contents: encoder.encode(`${JSON.stringify(PACK_METADATA, null, 2)}\n`) });
    if (!await vscode.workspace.applyEdit(edit)) return;
    await vscode.window.showTextDocument(vscode.Uri.joinPath(root, "pack.mcmeta"));
  }), vscode.commands.registerCommand("viridian.newFile", async (folder?: vscode.Uri) => {
    let root = folder;
    if (root) {
      const classified = classifyPath(`${root.path}/placeholder.json`);
      if (classified) root = root.with({ path: classified.packRoot });
      while (!await exists(vscode.Uri.joinPath(root, "pack.mcmeta"))) {
        const parent = vscode.Uri.joinPath(root, "..");
        if (parent.path === root.path) { root = undefined; break; }
        root = parent;
      }
    }
    if (!root) {
      const packs = await vscode.workspace.findFiles("**/pack.mcmeta");
      const chosen = await vscode.window.showQuickPick(packs.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri: vscode.Uri.joinPath(uri, "..") })), { placeHolder: "Choose the datapack" });
      root = chosen?.uri;
    }
    if (!root) { void vscode.window.showInformationMessage("Create or open a datapack with pack.mcmeta first."); return; }
    const choice = await vscode.window.showQuickPick<vscode.QuickPickItem & { documentKind: DocumentKind }>([
      { label: "Origin", documentKind: "origin" }, { label: "Origin layer", documentKind: "origin_layer" }, { label: "Power", documentKind: "power" },
    ], { placeHolder: "What do you want to create?" });
    if (!choice) return;
    const id = await vscode.window.showInputBox({ prompt: "Namespaced identifier", value: "demo:my_origin", validateInput: value => {
      const parsed = parseIdentifier(value);
      return !parsed.ok ? parsed.error : !value.includes(":") || parsed.id.split(":")[1]!.split("/").some(p => p === ".." || p === "." || p === "") ? "Use namespace:path without empty or relative path segments." : undefined;
    } });
    if (!id) return;
    const uri = vscode.Uri.joinPath(root, pathFor(choice.documentKind, id));
    if (await exists(uri)) { void vscode.window.showErrorMessage("That datapack file already exists."); return; }
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(uri, { contents: encoder.encode(initialDocument(choice.documentKind)) });
    if (await vscode.workspace.applyEdit(edit)) await vscode.window.showTextDocument(uri);
  }));
}
