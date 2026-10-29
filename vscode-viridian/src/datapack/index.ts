import type { Catalog } from "../catalog/catalog.ts";
import { analyzeText } from "../analysis/document.ts";
import type { Definition, Reference, ReferenceKind, Severity } from "../analysis/analyze.ts";

export interface IndexedLocation { uri: string; offset: number; length: number }
export interface IndexedFile {
  analysis: NonNullable<ReturnType<typeof analyzeText>>;
  text: string;
  lineOffsets: number[];
}
export class DatapackIndex {
  readonly catalog: Catalog;
  readonly files = new Map<string, IndexedFile>();
  private knownIds = new Map<ReferenceKind, Set<string>>();
  constructor(catalog: Catalog) { this.catalog = catalog; }
  update(uri: string, text: string, path = uri): IndexedFile | undefined {
    const analysis = analyzeText(text, path, this.catalog);
    if (!analysis) return undefined;
    const lineOffsets = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineOffsets.push(i + 1);
    const file = { analysis, text, lineOffsets };
    this.files.set(uri, file);
    this.knownIds.clear();
    return file;
  }
  remove(uri: string): void { this.files.delete(uri); this.knownIds.clear(); }
  clear(): void { this.files.clear(); this.knownIds.clear(); }
  definitions(kind: ReferenceKind, id: string): IndexedLocation[] { return this.query("definitions", kind, id); }
  references(kind: ReferenceKind, id: string): IndexedLocation[] { return this.query("references", kind, id); }
  ids(kind: ReferenceKind): string[] {
    return [...this.known(kind)].sort();
  }
  has(kind: ReferenceKind, id: string): boolean { return this.known(kind).has(id); }
  missingReferences(uri: string, severity: Severity | "off" = "warning") {
    if (severity === "off") return [];
    return (this.files.get(uri)?.analysis.references ?? []).filter(ref => !this.has(ref.kind, ref.id)).map(ref => ({
      offset: ref.offset, length: ref.length, severity, code: "missing-reference",
      message: `No ${ref.kind.replaceAll("_", " ")} "${ref.id}" found in the indexed datapacks or built into the mod.`,
    }));
  }
  symbolAt(uri: string, offset: number): Definition | Reference | undefined {
    const analysis = this.files.get(uri)?.analysis;
    return [...analysis?.references ?? [], ...analysis?.definitions.filter(def => def.offset !== analysis.parsed.root?.offset) ?? []]
      .find(ref => ref.offset <= offset && offset < ref.offset + ref.length) ?? analysis?.definitions.find(def => def.offset === offset);
  }
  private known(kind: ReferenceKind): Set<string> {
    let ids = this.knownIds.get(kind);
    if (!ids) {
      ids = new Set(this.builtin(kind));
      for (const file of this.files.values()) for (const def of file.analysis.definitions) if (def.kind === kind) ids.add(def.id);
      this.knownIds.set(kind, ids);
    }
    return ids;
  }
  private builtin(kind: ReferenceKind): string[] {
    return kind === "power" ? this.catalog.builtin.powers : kind === "origin" ? this.catalog.builtin.origins : kind === "origin_layer" ? this.catalog.builtin.layers : [];
  }
  private query(key: "definitions" | "references", kind: ReferenceKind, id: string): IndexedLocation[] {
    const locations: IndexedLocation[] = [];
    for (const [uri, file] of this.files) for (const ref of file.analysis[key]) {
      if (ref.kind === kind && ref.id === id) locations.push({ uri, offset: ref.offset, length: ref.length });
    }
    return locations;
  }
}
