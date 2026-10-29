// completion candidates at a position, independent of vscode

import type { Node } from "jsonc-parser";
import { EXTENSION_NAMESPACE } from "../catalog/catalog.ts";
import type { FieldSpec, RegistryKind, TypeEntry, TypeRef } from "../catalog/types.ts";
import type { ReferenceKind } from "./analyze.ts";
import { describeEntry, describeField } from "./describe.ts";
import { locate, type Located } from "./locate.ts";
import { propertyNames, type Schema, type SchemaType } from "./schema.ts";

export interface Candidate {
  label: string;
  kind: "property" | "type" | "value" | "reference" | "snippet";
  // vscode snippet syntax
  insertText: string;
  detail?: string;
  documentation?: string;
  // the text to replace, defaults to the word at the cursor
  range?: { offset: number; length: number };
  filterText?: string;
  sortText?: string;
}

export interface CompletionSources {
  // known ids of powers, origins, layers and badges, from the workspace and the mod
  ids(kind: ReferenceKind): string[];
}

const REFERENCE_KINDS: Record<string, ReferenceKind> = {
  power: "power",
  origin: "origin",
  origin_layer: "origin_layer",
  badge: "badge",
};

export function complete(text: string, root: Node | undefined, offset: number, schema: Schema, sources: CompletionSources): Candidate[] {
  if (!root || root.type !== "object") return [];
  const located = locate(text, root, offset, schema);
  if (!located) return [];
  return located.at === "key" ? completeKeys(located, schema) : completeValue(located, schema, sources);
}

function completeKeys(located: Extract<Located, { at: "key" }>, schema: Schema): Candidate[] {
  const { shape, object, key } = located;
  const present = new Set(propertyNames(object));
  if (key) present.delete(key.value as string);
  const property = key?.parent;
  const hasValue = property?.colonOffset !== undefined;
  const needsType = shape.typed && !shape.typed.typeNode && schema.catalog.registryInfo(shape.typed.registry).defaultType === undefined;

  const candidates: Candidate[] = [];
  for (const [name, spec] of Object.entries(shape.fields)) {
    if (present.has(name) || shape.hidden.has(name)) continue;
    const value = hasValue ? "" : `: ${valueSnippet(spec.type, schema, spec)}`;
    candidates.push({
      label: name,
      kind: "property",
      insertText: `"${name}"${value}`,
      filterText: `"${name}"`,
      detail: fieldDetail(spec, schema),
      documentation: describeField(name, spec, schema.catalog),
      range: key ? { offset: key.offset, length: key.length } : undefined,
      // the type first, then required fields, then the rest in catalog order
      sortText: `${name === "type" && needsType ? 0 : spec.required ? 1 : 2}${String(candidates.length).padStart(3, "0")}`,
    });
  }
  return candidates;
}

function completeValue(located: Extract<Located, { at: "value" }>, schema: Schema, sources: CompletionSources): Candidate[] {
  const { node, field } = located;
  const range = node && node.type !== "object" && node.type !== "array" ? { offset: node.offset, length: node.length } : undefined;
  // only offer replacements for a value that's being typed, not inside objects or arrays
  if (node && (node.type === "object" || node.type === "array")) return [];

  // the type id of an action, condition, power or badge
  if (field?.name === "type" && field.shape.typed) {
    return typeCandidates(field.shape.typed.registry, schema, range, false);
  }

  const type = node ? schema.variant(node, located.type) : located.type;
  if (!type) return [];
  return valueCandidates(type, schema, sources, range, field?.spec);
}

function valueCandidates(type: SchemaType, schema: Schema, sources: CompletionSources, range: Candidate["range"], spec?: FieldSpec): Candidate[] {
  switch (type.kind) {
    case "boolean":
      return ["true", "false"].map((v) => ({ label: v, kind: "value", insertText: v, range, sortText: spec?.default === (v === "true") ? "0" : "1" }));
    case "enum": {
      const values = type.namespace ? type.values.map((v) => `${type.namespace}:${v}`) : type.values;
      return values.map((v) => quoted(v, "value", range, spec?.default === v || `${type.namespace}:${spec?.default}` === v ? "0" : "1"));
    }
    case "identifier": {
      const kind = type.registry ? REFERENCE_KINDS[type.registry] : undefined;
      return kind ? sources.ids(kind).map((id) => quoted(id, "reference", range)) : [];
    }
    case "typed":
      // a whole action or condition object, one snippet per type
      return range ? [] : typeCandidates(type.registry, schema, undefined, true);
    case "union":
      return type.of.flatMap((member) => valueCandidates(schema.resolve(member), schema, sources, range, spec));
    case "list":
      return valueCandidates(schema.resolve(type.of), schema, sources, range, spec);
    default:
      return [];
  }
}

// type ids of a registry, either as a string value or as whole objects with their required fields
function typeCandidates(registry: RegistryKind, schema: Schema, range: Candidate["range"], asObject: boolean): Candidate[] {
  const info = schema.catalog.registryInfo(registry);
  const candidates: Candidate[] = [];
  for (const [id, entry] of schema.catalog.entries(registry)) {
    const extension = id.startsWith(`${EXTENSION_NAMESPACE}:`);
    const detail = extension ? `${info.label} (Viridian only)` : info.label;
    const documentation = describeEntry(id, entry, registry, schema.catalog);
    if (asObject) {
      candidates.push({
        label: id,
        kind: "snippet",
        insertText: objectSnippet(id, entry, schema),
        filterText: id,
        detail,
        documentation,
      });
    } else {
      candidates.push({ ...quoted(id, "type", range), detail, documentation });
    }
  }
  return candidates;
}

function quoted(value: string, kind: Candidate["kind"], range: Candidate["range"], sortText?: string): Candidate {
  const insertText = `"${escapeSnippet(value)}"`;
  return { label: value, kind, insertText, filterText: `"${value}"`, range, sortText };
}

// an object with the type and its required fields filled in
export function objectSnippet(id: string, entry: TypeEntry, schema: Schema, extraRequired: Record<string, FieldSpec> = {}): string {
  const lines = [`\t"type": "${id}"`];
  let tab = 1;
  for (const [name, spec] of Object.entries({ ...extraRequired, ...entry.fields })) {
    if (!spec.required || name === "type") continue;
    lines.push(`\t"${name}": ${valueSnippet(spec.type, schema, spec, () => tab++)}`);
  }
  return `{\n${lines.join(",\n")}$0\n}`;
}

// a placeholder value for a field, as a snippet
export function valueSnippet(ref: TypeRef, schema: Schema, spec?: FieldSpec, nextTab: () => number = () => 1): string {
  const type = schema.resolve(ref);
  const tab = nextTab();
  switch (type.kind) {
    case "boolean":
      return spec?.default === true ? `\${${tab}|true,false|}` : `\${${tab}|false,true|}`;
    case "int":
    case "float":
    case "double":
      return `\${${tab}:${typeof spec?.default === "number" ? spec.default : 0}}`;
    case "enum": {
      const values = type.namespace ? type.values.map((v) => `${type.namespace}:${v}`) : type.values;
      return `"\${${tab}|${values.map(escapeChoice).join(",")}|}"`;
    }
    case "list":
    case "weighted_list":
      return `[$${tab}]`;
    case "object":
    case "map":
    case "document":
      return `{$${tab}}`;
    case "typed":
      return `{\n\t\t"type": "$${tab}"\n\t}`;
    case "union":
      return valueSnippet(type.of[0]!, schema, spec, () => tab);
    case "any":
      return `$${tab}`;
    default:
      return `"$${tab}"`;
  }
}

function fieldDetail(spec: FieldSpec, schema: Schema): string {
  return `${schema.catalog.typeName(spec.type)}${spec.required ? " (required)" : ""}`;
}

function escapeSnippet(value: string): string {
  return value.replace(/[$}\\]/g, "\\$&");
}

function escapeChoice(value: string): string {
  return value.replace(/[$}\\,|]/g, "\\$&");
}

