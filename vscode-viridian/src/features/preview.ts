import * as vscode from "vscode";
import { getNodeValue } from "jsonc-parser";
import type { DatapackIndex, IndexedFile } from "../datapack/index.ts";
import { classifyPath } from "../datapack/paths.ts";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).join("");
  if (!value || typeof value !== "object") return "";
  const component = value as Record<string, unknown>;
  return (typeof component.text === "string" ? component.text : typeof component.translate === "string" ? component.translate : "") + text(component.extra);
}
function data(file: IndexedFile | undefined): Record<string, unknown> | undefined {
  const root = file?.analysis.parsed.root;
  return root?.type === "object" && !file?.analysis.parsed.syntaxErrors.length ? getNodeValue(root) : undefined;
}
export function renderOriginPreview(uri: string, index: DatapackIndex): string {
  const file = index.files.get(uri);
  const origin = data(file);
  let content = '<p class="muted">Fix the JSON errors to show this origin.</p>';
  if (origin && file) {
    const id = file.analysis.parsed.file.id;
    const levels = ["None", "Low", "Medium", "High"];
    const impact = origin.impact ?? 0;
    const level = typeof impact === "number" ? levels[impact] : typeof impact === "string" ? levels.find(value => value.toLowerCase() === impact.toLowerCase()) : undefined;
    const icon = typeof origin.icon === "string" ? origin.icon : origin.icon && typeof origin.icon === "object" ? (origin.icon as Record<string, unknown>).id : undefined;
    const powers = Array.isArray(origin.powers) ? origin.powers : [];
    const items = powers.map(power => {
      if (typeof power !== "string") return '<li class="muted">Invalid power reference</li>';
      const normalized = power.includes(":") ? power : `minecraft:${power}`;
      const definitions = index.definitions("power", normalized);
      const local = definitions.find(def => index.files.get(def.uri)?.analysis.parsed.file.packRoot === file.analysis.parsed.file.packRoot) ?? definitions[0];
      const details = local ? data(index.files.get(local.uri)) : undefined;
      const description = text(details?.description);
      return `<li><strong>${escape(text(details?.name) || power)}</strong><div class="muted">${escape(power)}</div>${description ? `<p>${escape(description)}</p>` : ""}${normalized.startsWith("viridian:") || (typeof details?.type === "string" && details.type.startsWith("viridian:")) ? '<div class="muted">Viridian only</div>' : ""}${!index.has("power", normalized) ? '<div class="warning">Power not found</div>' : ""}</li>`;
    }).join("");
    content = `<h1>${escape(text(origin.name) || id)}</h1><div class="muted">${escape(id)}</div><p>${escape(text(origin.description))}</p><dl><dt>Difficulty (impact)</dt><dd>${escape(level ?? String(impact))}</dd>${typeof icon === "string" ? `<dt>Icon</dt><dd>${escape(icon)}</dd>` : ""}</dl><h2>Powers <span class="muted">(${powers.length})</span></h2>${powers.length ? `<ul>${items}</ul>` : '<p class="muted">No powers.</p>'}<p class="muted note">Translations appear as keys. Built-in powers are shown by ID.</p>`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 20px; line-height: 1.5; overflow-wrap: anywhere; }
main { max-width: 640px; } h1 { font-size: 24px; font-weight: 600; margin: 0; } h2 { font-size: 16px; font-weight: 600; margin-top: 28px; } p { white-space: pre-wrap; } .muted { color: var(--vscode-descriptionForeground); } .warning { color: var(--vscode-editorWarning-foreground); } dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 20px; } dt { color: var(--vscode-descriptionForeground); } dd { margin: 0; } ul { list-style: none; padding: 0; } li { border-top: 1px solid var(--vscode-panel-border); padding: 12px 0; } li p { margin-bottom: 0; } .note { font-size: 12px; margin-top: 28px; }
</style></head><body><main>${content}</main></body></html>`;
}
export function registerOriginPreview(context: vscode.ExtensionContext, index: DatapackIndex, prepare: (document: vscode.TextDocument) => Promise<unknown>): () => void {
  let panel: vscode.WebviewPanel | undefined;
  let source: vscode.Uri | undefined;
  const refresh = () => { if (panel && source) panel.webview.html = renderOriginPreview(source.toString(), index); };
  context.subscriptions.push(vscode.commands.registerCommand("viridian.previewOrigin", async (uri?: vscode.Uri) => {
    uri ??= vscode.window.activeTextEditor?.document.uri;
    if (!uri || classifyPath(uri.path)?.kind !== "origin") {
      void vscode.window.showInformationMessage("Open an origin JSON file to preview it.");
      return;
    }
    await prepare(await vscode.workspace.openTextDocument(uri));
    source = uri;
    if (!panel) {
      panel = vscode.window.createWebviewPanel("viridian.originPreview", "Origin preview", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { localResourceRoots: [] });
      panel.onDidDispose(() => { panel = undefined; source = undefined; });
    } else panel.reveal(vscode.ViewColumn.Beside, true);
    refresh();
  }), { dispose: () => panel?.dispose() });
  return refresh;
}
