import * as vscode from "vscode";
import { readArchive } from "../datapack/archive.ts";

export const ZIP_SCHEME = "viridian-zip";
export class ZipFileSystem implements vscode.FileSystemProvider {
  private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changed.event;
  private readonly archives = new Map<string, Map<string, Uint8Array>>();
  uri(archive: vscode.Uri, entry: string): vscode.Uri {
    return vscode.Uri.from({ scheme: ZIP_SCHEME, path: `/${entry}`, query: new URLSearchParams({ archive: archive.toString() }).toString() });
  }
  async mount(archive: vscode.Uri): Promise<vscode.Uri[]> {
    const files = readArchive(await vscode.workspace.fs.readFile(archive));
    this.archives.set(archive.toString(), files);
    return [...files.keys()].map(entry => this.uri(archive, entry));
  }
  private async files(uri: vscode.Uri) {
    const archive = new URLSearchParams(uri.query).get("archive");
    if (!archive) throw vscode.FileSystemError.FileNotFound(uri);
    if (!this.archives.has(archive)) await this.mount(vscode.Uri.parse(archive));
    return this.archives.get(archive)!;
  }
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const files = await this.files(uri);
    const path = uri.path.slice(1);
    const file = files.get(path);
    const directory = [...files.keys()].some(p => p.startsWith(path ? `${path}/` : ""));
    if (!file && !directory) throw vscode.FileSystemError.FileNotFound(uri);
    return { type: file ? vscode.FileType.File : vscode.FileType.Directory, size: file?.length ?? 0, ctime: 0, mtime: 0, permissions: vscode.FilePermission.Readonly };
  }
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const file = (await this.files(uri)).get(uri.path.slice(1));
    if (!file) throw vscode.FileSystemError.FileNotFound(uri);
    return file;
  }
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const prefix = uri.path === "/" ? "" : `${uri.path.slice(1)}/`;
    const children = new Map<string, vscode.FileType>();
    for (const path of (await this.files(uri)).keys()) if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length);
      const name = rest.split("/")[0]!;
      children.set(name, rest.includes("/") ? vscode.FileType.Directory : vscode.FileType.File);
    }
    return [...children];
  }
  watch(): vscode.Disposable { return new vscode.Disposable(() => {}); }
  writeFile(): never { throw vscode.FileSystemError.NoPermissions("Zipped datapacks are read-only. Extract the pack to edit it."); }
  createDirectory(): never { return this.writeFile(); }
  delete(): never { return this.writeFile(); }
  rename(): never { return this.writeFile(); }
  dispose(): void { this.changed.dispose(); this.archives.clear(); }
}
