// shapes of the catalog json files in catalog/
// generated.json comes from scripts/generate-catalog.ts, the rest is hand written

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const REGISTRY_KINDS = [
  "power_type",
  "entity_action",
  "bientity_action",
  "block_action",
  "item_action",
  "entity_condition",
  "bientity_condition",
  "block_condition",
  "item_condition",
  "damage_condition",
  "fluid_condition",
  "biome_condition",
  "badge_type",
] as const;

export type RegistryKind = (typeof REGISTRY_KINDS)[number];

// a named data type ("int", "modifier", "entity_action"), "list<name>", or an inline type
export type TypeRef = string | DataType;

export type DataType =
  | { kind: "boolean" | "string" | "text" | "nbt" | "any"; description?: string }
  | { kind: "int" | "float" | "double"; min?: number; description?: string }
  // hashTag: a leading # makes it a tag id instead (global power set entity types)
  | { kind: "identifier"; registry?: string; tag?: boolean; hashTag?: boolean; description?: string }
  // calio enums take any case and the index. with a namespace the values are identifiers instead,
  // so they're case sensitive and may be written with or without the namespace
  | { kind: "enum"; values: string[]; aliases?: Record<string, string>; namespace?: string; description?: string }
  // open objects allow fields we don't know about (like the rest of a vanilla recipe)
  | { kind: "object"; fields: Record<string, FieldSpec>; open?: boolean; description?: string }
  | { kind: "map"; of: TypeRef; description?: string }
  | { kind: "union"; of: TypeRef[]; description?: string }
  // calio lists also take a single value, strict ones have to be arrays
  | { kind: "list"; of: TypeRef; strict?: boolean; description?: string }
  | { kind: "weighted_list"; of: TypeRef; description?: string }
  | { kind: "typed"; registry: RegistryKind; description?: string };

export interface FieldSpec {
  type: TypeRef;
  required?: boolean;
  // json value of the default, when it has one
  default?: JsonValue;
  // the default as the mod writes it, when it isn't a plain json value
  defaultText?: string;
  description?: string;
  // accepted without a warning but never read, like the leftover "name" of modifiers. not offered in completions
  ignored?: boolean;
}

export interface TypeEntry {
  description?: string;
  fields: Record<string, FieldSpec>;
  // where the mod reads it, e.g. "power/type/CooldownPowerType.java:20"
  source?: string;
}

export interface BuiltinIds {
  powers: string[];
  origins: string[];
  layers: string[];
}

export interface GeneratedCatalog {
  registries: Partial<Record<RegistryKind, Record<string, TypeEntry>>>;
  pathAliases: Partial<Record<RegistryKind, Record<string, string>>>;
  namespaceAliases: Record<string, string>;
  dataTypes: Record<string, DataType>;
  builtin: BuiltinIds;
}

export type FieldOverride = { [K in keyof FieldSpec]?: FieldSpec[K] | null };

export interface TypeEntryOverride {
  description?: string;
  // a null field removes a field the generator picked up by mistake, a null key removes that key
  fields?: Record<string, FieldOverride | null>;
}

export interface CatalogOverrides {
  registries: Partial<Record<RegistryKind, Record<string, TypeEntryOverride>>>;
}

export const DOCUMENT_KINDS = ["power", "origin", "origin_layer", "badge", "global_power_set"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface DocumentsCatalog {
  // for powers and badges these are the fields every file has next to the fields of its type
  documents: Record<DocumentKind, TypeEntry>;
  dataTypes: Record<string, DataType>;
  registries: Partial<Record<RegistryKind, Record<string, TypeEntry>>>;
}
