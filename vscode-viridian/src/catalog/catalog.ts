// the merged catalog: generated types, hand written data types and documents, and overrides

import type {
  BuiltinIds,
  CatalogOverrides,
  DataType,
  DocumentKind,
  DocumentsCatalog,
  FieldSpec,
  GeneratedCatalog,
  RegistryKind,
  TypeEntry,
  TypeRef,
} from "./types.ts";
import { REGISTRY_KINDS } from "./types.ts";
import { parseIdentifier, splitId } from "./identifier.ts";

export interface RegistryInfo {
  kind: RegistryKind;
  label: string;
  // conditions read "inverted", actions read and ignore it
  inverted: "read" | "ignored" | "none";
  // whether origins: falls back to apoli: (only TypeRegistry based registries do)
  aliases: boolean;
  defaultType?: string;
}

export interface ResolvedTypeId {
  // the id as written, with the default namespace filled in
  written: string;
  // the registered id it resolves to
  resolved?: string;
  entry?: TypeEntry;
  error?: string;
}

const LABELS: Record<RegistryKind, string> = {
  power_type: "Power type",
  entity_action: "Entity action",
  bientity_action: "Bi-entity action",
  block_action: "Block action",
  item_action: "Item action",
  entity_condition: "Entity condition",
  bientity_condition: "Bi-entity condition",
  block_condition: "Block condition",
  item_condition: "Item condition",
  damage_condition: "Damage condition",
  fluid_condition: "Fluid condition",
  biome_condition: "Biome condition",
  badge_type: "Badge type",
};

export const EXTENSION_NAMESPACE = "viridian";

export class Catalog {
  readonly builtin: BuiltinIds;
  private readonly registries = new Map<RegistryKind, Map<string, TypeEntry>>();
  private readonly dataTypes = new Map<string, DataType>();
  private readonly documents: Record<DocumentKind, TypeEntry>;
  private readonly pathAliases: GeneratedCatalog["pathAliases"];
  private readonly namespaceAliases: Record<string, string>;

  constructor(generated: GeneratedCatalog, dataTypes: Record<string, DataType>, documents: DocumentsCatalog, overrides: CatalogOverrides) {
    this.builtin = generated.builtin;
    this.pathAliases = generated.pathAliases;
    this.namespaceAliases = generated.namespaceAliases;
    this.documents = documents.documents;

    // hand written types win over generated enums
    for (const source of [generated.dataTypes, dataTypes, documents.dataTypes]) {
      for (const [name, type] of Object.entries(source)) this.dataTypes.set(name, type);
    }

    for (const kind of REGISTRY_KINDS) {
      const entries = new Map<string, TypeEntry>();
      for (const source of [generated.registries[kind], documents.registries[kind]]) {
        for (const [id, entry] of Object.entries(source ?? {})) entries.set(id, structuredClone(entry));
      }
      for (const [id, override] of Object.entries(overrides.registries[kind] ?? {})) {
        const entry = entries.get(id);
        if (!entry) throw new Error(`override for unknown ${kind} "${id}"`);
        applyOverride(entry, override);
      }
      this.registries.set(kind, entries);
    }
  }

  registryInfo(kind: RegistryKind): RegistryInfo {
    return {
      kind,
      label: LABELS[kind],
      inverted: kind.endsWith("_condition") ? "read" : kind.endsWith("_action") ? "ignored" : "none",
      aliases: kind !== "badge_type",
      defaultType: kind === "badge_type" ? "origins:keybind" : undefined,
    };
  }

  entries(kind: RegistryKind): ReadonlyMap<string, TypeEntry> {
    return this.registries.get(kind)!;
  }

  document(kind: DocumentKind): TypeEntry {
    return this.documents[kind];
  }

  // TypeRegistry#resolve: the exact id, then the registry's path aliases, then the namespace aliases
  resolveTypeId(kind: RegistryKind, raw: string): ResolvedTypeId {
    const parsed = parseIdentifier(raw);
    if (!parsed.ok) return { written: raw, error: parsed.error };
    const entries = this.entries(kind);
    const aliases = this.registryInfo(kind).aliases;

    let id = parsed.id;
    for (let guard = 0; guard < 8; guard++) {
      if (entries.has(id)) return { written: parsed.id, resolved: id, entry: entries.get(id) };
      if (!aliases) break;
      const { namespace, path } = splitId(id);
      const aliasedPath = this.pathAliases[kind]?.[path];
      if (aliasedPath) {
        const pathAliased = `${namespace}:${aliasedPath}`;
        if (entries.has(pathAliased)) return { written: parsed.id, resolved: pathAliased, entry: entries.get(pathAliased) };
        id = pathAliased;
      }
      const aliasedNamespace = this.namespaceAliases[splitId(id).namespace];
      if (!aliasedNamespace) break;
      id = `${aliasedNamespace}:${splitId(id).path}`;
    }
    return { written: parsed.id };
  }

  // type ids that are registered, closest first, for "did you mean" messages
  suggestTypeIds(kind: RegistryKind, raw: string, limit = 3): string[] {
    const path = splitId(raw).path;
    return [...this.entries(kind).keys()]
      .map((id) => ({ id, distance: editDistance(path, splitId(id).path) }))
      .filter(({ distance, id }) => distance <= Math.max(2, Math.floor(splitId(id).path.length / 3)))
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map(({ id }) => id);
  }

  // turns a type ref into a data type: named types, list<...>, and <category>_action/_condition
  dataType(ref: TypeRef): DataType {
    if (typeof ref !== "string") return ref;
    const list = ref.match(/^list<(.+)>$/);
    if (list) return { kind: "list", of: list[1]! };
    const named = this.dataTypes.get(ref);
    if (named) return named;
    if ((REGISTRY_KINDS as readonly string[]).includes(ref)) return { kind: "typed", registry: ref as RegistryKind };
    return { kind: "any" };
  }

  hasDataType(name: string): boolean {
    return this.dataTypes.has(name) || (REGISTRY_KINDS as readonly string[]).includes(name);
  }

  // a readable name for a type ref, for hovers and messages
  typeName(ref: TypeRef): string {
    if (typeof ref === "string") return ref;
    switch (ref.kind) {
      case "list":
        return `list<${this.typeName(ref.of)}>`;
      case "weighted_list":
        return `weighted_list<${this.typeName(ref.of)}>`;
      case "map":
        return `map<${this.typeName(ref.of)}>`;
      case "union":
        return ref.of.map((t) => this.typeName(t)).join(" | ");
      case "typed":
        return ref.registry;
      default:
        return ref.kind;
    }
  }
}

function applyOverride(entry: TypeEntry, override: NonNullable<CatalogOverrides["registries"][RegistryKind]>[string]): void {
  if (override.description !== undefined) entry.description = override.description;
  for (const [name, field] of Object.entries(override.fields ?? {})) {
    if (field === null) {
      delete entry.fields[name];
      continue;
    }
    const target: Partial<FieldSpec> = entry.fields[name] ?? {};
    for (const [key, value] of Object.entries(field)) {
      if (value === null) delete target[key as keyof FieldSpec];
      else (target as Record<string, unknown>)[key] = value;
    }
    if (target.type === undefined) throw new Error(`override adds field "${name}" without a type`);
    entry.fields[name] = target as FieldSpec;
  }
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? previous : 1 + Math.min(previous, row[j]!, row[j - 1]!);
      previous = current;
    }
  }
  return row[b.length]!;
}
