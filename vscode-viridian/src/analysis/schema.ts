// what each json node in a datapack file is supposed to be

import type { Node } from "jsonc-parser";
import { EXTENSION_NAMESPACE, type Catalog, type ResolvedTypeId } from "../catalog/catalog.ts";
import type { DataType, DocumentKind, FieldSpec, RegistryKind, TypeRef } from "../catalog/types.ts";

export interface FileContext {
  kind: DocumentKind;
  // the file's own id, which `*` in identifiers stands for
  id: string;
}

// a data type, or a whole file (sub-powers of multiple powers are documents too)
export type SchemaType = DataType | { kind: "document"; document: DocumentKind; subPower?: boolean };

export interface ObjectShape {
  // every field the object may have, including type and inverted
  fields: Record<string, FieldSpec>;
  open: boolean;
  typed?: TypedInfo;
  // multiple powers: other object fields are sub-powers
  subPowers: boolean;
  // fields that are accepted but ignored, so they're not offered
  hidden: Set<string>;
}

export interface TypedInfo {
  registry: RegistryKind;
  typeNode?: Node;
  // the type id as written, or the default type when the object has no type field
  raw?: string;
  resolved?: ResolvedTypeId;
}

// PowerLoader's FIELDS_TO_IGNORE plus the additional fields (badges), these are never sub-powers
const SUB_POWER_IGNORED = new Set([
  "type",
  "loading_priority",
  "name",
  "description",
  "hidden",
  "condition",
  "fabric:load_conditions",
  "badges",
]);

export class Schema {
  readonly catalog: Catalog;
  readonly file: FileContext;

  constructor(catalog: Catalog, file: FileContext) {
    this.catalog = catalog;
    this.file = file;
  }

  rootType(): SchemaType {
    return { kind: "document", document: this.file.kind };
  }

  resolve(ref: TypeRef | SchemaType): SchemaType {
    return typeof ref === "string" ? this.catalog.dataType(ref) : ref;
  }

  // picks the union member or list element the node actually is
  // returns undefined when the node fits none of the members
  variant(node: Node, ref: TypeRef | SchemaType): SchemaType | undefined {
    const type = this.resolve(ref);
    if (type.kind === "union") {
      const members = type.of.map((m) => this.resolve(m));
      return (
        members.find((m) => this.accepts(node, m, true)) ??
        members.find((m) => this.accepts(node, m, false))
      );
    }
    if (type.kind === "list" && !type.strict && node.type !== "array") return this.variant(node, type.of);
    return type;
  }

  // a shallow check of the node's json kind, exact means without gson's coercions
  accepts(node: Node, ref: TypeRef | SchemaType, exact: boolean): boolean {
    const type = this.resolve(ref);
    const t = node.type;
    if (!exact && t === "array" && node.children?.length === 1 && ["boolean", "int", "float", "double", "string", "identifier"].includes(type.kind)) {
      return this.accepts(node.children[0]!, type, false);
    }
    switch (type.kind) {
      case "any":
        return true;
      case "boolean":
        return t === "boolean" || (!exact && (t === "string" || t === "number"));
      case "int":
      case "float":
      case "double":
        return t === "number" || (!exact && t === "string");
      case "string":
      case "identifier":
        return t === "string" || (!exact && (t === "number" || t === "boolean"));
      case "enum":
        return t === "string" || (t === "number" && !type.namespace);
      case "text":
        return t === "string" || t === "object" || t === "array";
      case "nbt":
        return t === "string" || t === "object";
      case "object":
      case "typed":
      case "map":
      case "document":
        return t === "object";
      case "weighted_list":
        return true;
      case "list":
        return t === "array" || (!type.strict && this.accepts(node, type.of, exact));
      case "union":
        return type.of.some((m) => this.accepts(node, m, exact));
    }
  }

  shape(node: Node, type: SchemaType): ObjectShape | undefined {
    switch (type.kind) {
      case "object":
        return { fields: type.fields, open: type.open ?? false, subPowers: false, hidden: ignoredFields(type.fields) };
      case "typed":
        return this.typedShape(node, type.registry, {}, false);
      case "document":
        return this.documentShape(node, type.document, type.subPower ?? false);
      default:
        return undefined;
    }
  }

  private documentShape(node: Node, document: DocumentKind, subPower: boolean): ObjectShape {
    const common = this.catalog.document(document).fields;
    if (document === "power") {
      const shape = this.typedShape(node, "power_type", common, true);
      shape.subPowers = !subPower && shape.typed?.resolved?.resolved === "apoli:multiple";
      return shape;
    }
    if (document === "badge") return this.typedShape(node, "badge_type", common, true);
    return { fields: common, open: false, subPowers: false, hidden: ignoredFields(common) };
  }

  private typedShape(node: Node, registry: RegistryKind, extra: Record<string, FieldSpec>, isDocument: boolean): ObjectShape {
    const info = this.catalog.registryInfo(registry);
    const typeNode = propertyValue(node, "type");
    const raw = typeNode?.type === "string" ? (typeNode.value as string) : typeNode ? undefined : info.defaultType;
    const resolved = raw !== undefined ? this.catalog.resolveTypeId(registry, raw) : undefined;

    const fields: Record<string, FieldSpec> = {};
    if (!isDocument) {
      fields.type = {
        type: "identifier",
        required: info.defaultType === undefined,
        default: info.defaultType,
        description: `The ${info.label.toLowerCase()} type.`,
      };
    }
    Object.assign(fields, extra);
    const hidden = new Set<string>();
    if (info.inverted === "read") {
      fields.inverted = { type: "boolean", default: false, description: "Flip the result of the condition." };
    } else if (info.inverted === "ignored") {
      // apoli reads it on every action and never uses it
      fields.inverted = { type: "boolean", default: false, description: "Read but ignored on actions." };
      hidden.add("inverted");
    }
    Object.assign(fields, resolved?.entry?.fields ?? {});
    for (const name of ignoredFields(fields)) hidden.add(name);
    return { fields, open: false, typed: { registry, typeNode, raw, resolved }, subPowers: false, hidden };
  }

  // the type of a property's value inside an object of this shape
  fieldType(shape: ObjectShape, name: string, value: Node | undefined): { spec?: FieldSpec; type?: SchemaType; subPower?: boolean } {
    const spec = shape.fields[name];
    if (spec) return { spec, type: this.resolve(spec.type) };
    if (shape.subPowers && !name.startsWith("$") && !SUB_POWER_IGNORED.has(name) && (!value || value.type === "object")) {
      return { type: { kind: "document", document: "power", subPower: true }, subPower: true };
    }
    return {};
  }

  isExtensionType(id: string | undefined): boolean {
    return id?.startsWith(`${EXTENSION_NAMESPACE}:`) ?? false;
  }
}

function ignoredFields(fields: Record<string, FieldSpec>): Set<string> {
  return new Set(Object.entries(fields).filter(([, spec]) => spec.ignored).map(([name]) => name));
}

export function propertyValue(node: Node, name: string): Node | undefined {
  if (node.type !== "object") return undefined;
  for (const property of node.children ?? []) {
    if (property.children?.[0]?.value === name) return property.children[1];
  }
  return undefined;
}

export function propertyNames(node: Node): string[] {
  if (node.type !== "object") return [];
  return (node.children ?? []).map((p) => p.children?.[0]?.value as string).filter((n) => typeof n === "string");
}
