// checks a datapack file against the catalog and collects the ids it defines and refers to

import type { Node } from "jsonc-parser";
import type { DataType, DocumentKind, FieldSpec, RegistryKind } from "../catalog/types.ts";
import { parseDynamicIdentifier } from "../catalog/identifier.ts";
import { Schema, propertyValue, type ObjectShape, type SchemaType } from "./schema.ts";

export type Severity = "error" | "warning" | "information";

export type ProblemCode =
  | "unknown-type"
  | "missing-field"
  | "unknown-field"
  | "wrong-type"
  | "invalid-value"
  | "invalid-identifier"
  | "coerced"
  | "mod-only";

export interface Problem {
  offset: number;
  length: number;
  message: string;
  severity: Severity;
  code: ProblemCode;
}

export type ReferenceKind = "power" | "origin" | "origin_layer" | "badge";

export interface Reference {
  kind: ReferenceKind;
  id: string;
  offset: number;
  length: number;
}

export interface Definition {
  kind: ReferenceKind;
  id: string;
  // the whole file for files, the property key for sub-powers
  offset: number;
  length: number;
}

export interface Analysis {
  problems: Problem[];
  references: Reference[];
  definitions: Definition[];
}

const REFERENCE_KINDS: Record<string, ReferenceKind> = {
  power: "power",
  origin: "origin",
  origin_layer: "origin_layer",
  badge: "badge",
};

const DOCUMENT_REFERENCE: Partial<Record<DocumentKind, ReferenceKind>> = {
  power: "power",
  origin: "origin",
  origin_layer: "origin_layer",
  badge: "badge",
};

export function analyze(root: Node | undefined, schema: Schema): Analysis {
  const analyzer = new Analyzer(schema);
  if (root) analyzer.run(root);
  return analyzer.result;
}

class Analyzer {
  readonly result: Analysis = { problems: [], references: [], definitions: [] };
  private readonly schema: Schema;

  constructor(schema: Schema) {
    this.schema = schema;
  }

  run(root: Node): void {
    const kind = DOCUMENT_REFERENCE[this.schema.file.kind];
    if (kind) this.result.definitions.push({ kind, id: this.schema.file.id, offset: root.offset, length: root.length });
    this.check(root, this.schema.rootType(), this.describeDocument());
  }

  private describeDocument(): string {
    const labels: Record<DocumentKind, string> = {
      power: "A power",
      origin: "An origin",
      origin_layer: "An origin layer",
      badge: "A badge",
      global_power_set: "A global power set",
    };
    return labels[this.schema.file.kind];
  }

  private check(node: Node, ref: SchemaType | string | DataType, what: string): void {
    const type = this.schema.variant(node, ref);
    if (!type || !this.schema.accepts(node, type, false)) {
      this.problem(node, `Expected ${this.expected(this.schema.resolve(ref))}.`, "error", "wrong-type");
      return;
    }

    if (node.type === "array" && node.children?.length === 1 && ["boolean", "int", "float", "double", "string", "identifier"].includes(type.kind)) {
      this.problem(node, "The mod reads this single-element array as its contained value.", "warning", "coerced");
      this.check(node.children[0]!, type, what);
      return;
    }

    switch (type.kind) {
      case "any":
      case "text":
        if (type.kind === "text" && (node.type === "number" || node.type === "boolean")) {
          this.problem(node, "Expected text: a string, a text object or an array.", "warning", "coerced");
        }
        return;
      case "boolean":
        return this.checkBoolean(node);
      case "int":
      case "float":
      case "double":
        return this.checkNumber(node, type);
      case "string":
        if (node.type !== "string") this.problem(node, "Expected a string.", "warning", "coerced");
        return;
      case "nbt":
        return;
      case "identifier":
        return this.checkIdentifier(node, type);
      case "enum":
        return this.checkEnum(node, type);
      case "list":
        if (node.type === "array") for (const child of node.children ?? []) this.check(child, type.of, what);
        return;
      case "weighted_list":
        return this.checkWeightedList(node, type.of);
      case "map":
        for (const property of node.children ?? []) {
          const value = property.children?.[1];
          if (value) this.check(value, type.of, what);
        }
        return;
      case "union":
        return;
      case "object":
      case "typed":
      case "document": {
        const shape = this.schema.shape(node, type);
        if (shape) this.checkObject(node, shape, type, what);
        return;
      }
    }
  }

  private checkObject(node: Node, shape: ObjectShape, type: SchemaType, what: string): void {
    let title = what;
    let knownFields = true;

    if (shape.typed) {
      const { registry, typeNode, raw, resolved } = shape.typed;
      const info = this.schema.catalog.registryInfo(registry);
      title = resolved?.resolved ? `${info.label} "${resolved.resolved}"` : info.label;

      if (!typeNode && info.defaultType === undefined) {
        this.problem(this.anchor(node), `${info.label} requires a "type".`, "error", "missing-field");
        knownFields = false;
      } else if (typeNode && typeNode.type !== "string") {
        this.problem(typeNode, `The type of ${info.label.toLowerCase()} has to be a string.`, "error", "wrong-type");
        knownFields = false;
      } else if (raw !== undefined && !resolved?.entry) {
        const target = typeNode ?? this.anchor(node);
        this.problem(target, this.unknownTypeMessage(registry, raw, resolved?.error), "warning", "unknown-type");
        knownFields = false;
      } else if (resolved?.resolved && this.schema.isExtensionType(resolved.resolved)) {
        this.problem(
          typeNode ?? this.anchor(node),
          `"${resolved.resolved}" is a Viridian extension and won't load on the original Origins mod.`,
          "information",
          "mod-only",
        );
      }

      if (type.kind === "document" && type.subPower && resolved?.resolved === "apoli:multiple") {
        this.problem(typeNode ?? this.anchor(node), `Sub-powers can't be "apoli:multiple" powers.`, "error", "wrong-type");
      }
    }

    if (knownFields) {
      for (const [name, spec] of Object.entries(shape.fields)) {
        if (spec.required && !propertyValue(node, name) && !(shape.typed && name === "type")) {
          this.problem(this.anchor(node), `${title} is missing the required field "${name}".`, "error", "missing-field");
        }
      }
    }

    for (const property of node.children ?? []) {
      const key = property.children?.[0];
      const value = property.children?.[1];
      const name = key?.value;
      if (!key || typeof name !== "string") continue;
      if (shape.typed && name === "type") continue;

      const field = this.schema.fieldType(shape, name, value);
      if (field.subPower) {
        if (value) {
          this.result.definitions.push({ kind: "power", id: `${this.schema.file.id}_${name}`, offset: key.offset, length: key.length });
          this.check(value, field.type!, `Sub-power "${name}"`);
        }
        continue;
      }
      if (!field.spec) {
        if (shape.subPowers && value && value.type !== "object" && !name.startsWith("$")) {
          this.problem(key, `Sub-power "${name}" has to be an object.`, "error", "wrong-type");
        } else if (!shape.open && knownFields && !name.startsWith("$")) {
          this.problem(key, `${title} doesn't have a field "${name}", the mod ignores it.`, "warning", "unknown-field");
        }
        continue;
      }
      if (value) this.check(value, field.type!, `"${name}"`);
    }
  }

  private unknownTypeMessage(registry: RegistryKind, raw: string, error: string | undefined): string {
    if (error) return error;
    const label = this.schema.catalog.registryInfo(registry).label;
    let message = `${label} type "${raw.includes(":") ? raw : `minecraft:${raw}`}" is not registered.`;
    if (!raw.includes(":") && this.schema.catalog.resolveTypeId(registry, `apoli:${raw}`).entry) {
      return `${message} Type ids need a namespace, did you mean "apoli:${raw}"?`;
    }
    const suggestions = this.schema.catalog.suggestTypeIds(registry, raw);
    if (suggestions.length > 0) message += ` Did you mean ${suggestions.map((s) => `"${s}"`).join(", ")}?`;
    return message;
  }

  private checkBoolean(node: Node): void {
    if (node.type === "boolean") return;
    if (node.type === "string") {
      const value = String(node.value);
      this.problem(node, `Expected a boolean, "${value}" is read as ${value.toLowerCase() === "true"}.`, "warning", "coerced");
    } else if (node.type === "number") {
      this.problem(node, `Expected a boolean, ${node.value} is read as false.`, "warning", "coerced");
    }
  }

  private checkNumber(node: Node, type: Extract<DataType, { kind: "int" | "float" | "double" }>): void {
    let value: number;
    if (node.type === "string") {
      value = Number(node.value);
      const invalidInt = type.kind === "int" && (!/^[+-]?\d+$/.test(String(node.value)) || value < -2147483648 || value > 2147483647);
      if (String(node.value).trim() === "" || Number.isNaN(value) || invalidInt) {
        this.problem(node, `Expected a number, "${node.value}" isn't one.`, "error", "wrong-type");
        return;
      }
      this.problem(node, "Expected a number, the string is read as one.", "warning", "coerced");
    } else {
      value = node.value as number;
    }
    if (type.kind === "int" && !Number.isInteger(value)) {
      this.problem(node, `Expected a whole number, ${value} is read as ${Math.trunc(value)}.`, "warning", "coerced");
    }
    if (type.min !== undefined && value < type.min) {
      const message = type.min === 1 && type.kind === "int" ? "Expected a number of at least 1." : "Expected a number above 0.";
      this.problem(node, message, "error", "invalid-value");
    }
  }

  private checkIdentifier(node: Node, type: Extract<DataType, { kind: "identifier" }>): void {
    if (node.type !== "string") {
      this.problem(node, "Expected an identifier string.", "warning", "coerced");
      return;
    }
    let raw = node.value as string;
    if (type.hashTag && raw.startsWith("#")) raw = raw.slice(1);
    const parsed = parseDynamicIdentifier(raw, this.schema.file.id);
    if (!parsed.ok) {
      const hint = type.tag && raw.startsWith("#") ? " Tag ids are written without \"#\"." : "";
      this.problem(node, parsed.error + hint, "error", "invalid-identifier");
      return;
    }
    const kind = type.registry ? REFERENCE_KINDS[type.registry] : undefined;
    if (kind) this.result.references.push({ kind, id: parsed.id, offset: node.offset, length: node.length });
  }

  private checkEnum(node: Node, type: Extract<DataType, { kind: "enum" }>): void {
    if (node.type === "number") {
      const raw = node.value as number;
      const index = Math.trunc(raw);
      if (index < 0 || index >= type.values.length) {
        this.problem(node, `Expected to be in the range of 0 - ${type.values.length - 1}.`, "error", "invalid-value");
      } else if (index !== raw) {
        this.problem(node, `Expected a whole number, ${raw} is read as ${index}.`, "warning", "coerced");
      }
      return;
    }
    if (node.type !== "string" || matchEnum(type, node.value as string) === undefined) {
      const choices = type.values.map((v) => `"${v}"`).join(", ");
      this.problem(node, `Expected one of ${choices}.`, "error", "invalid-value");
    }
  }

  private checkWeightedList(node: Node, of: SchemaType | string | DataType): void {
    if (node.type !== "array") {
      this.problem(node, "Expected a weighted list array. The mod reads this value as an empty list.", "warning", "coerced");
      return;
    }
    for (const entry of node.children ?? []) {
      if (entry.type !== "object") {
        this.problem(entry, `Expected an object with "element" and "weight".`, "error", "wrong-type");
        continue;
      }
      const weight = propertyValue(entry, "weight");
      if (!weight) this.problem(this.anchor(entry), `Missing the required field "weight".`, "error", "missing-field");
      else if (weight.type !== "number") this.problem(weight, "Expected a number for the weight.", "error", "wrong-type");
      else this.checkNumber(weight, { kind: "int" });
      const element = propertyValue(entry, "element");
      if (element) this.check(element, of, `"element"`);
      else this.problem(this.anchor(entry), `Missing the required field "element".`, "error", "missing-field");
    }
  }

  private expected(type: SchemaType): string {
    switch (type.kind) {
      case "union":
        return type.of.map((m) => this.expected(this.schema.resolve(m))).join(" or ");
      case "list":
        return type.strict ? "an array" : `${this.expected(this.schema.resolve(type.of))} or an array of them`;
      case "weighted_list":
        return "an array";
      case "object":
      case "typed":
      case "document":
      case "map":
        return "an object";
      case "int":
      case "float":
      case "double":
        return "a number";
      case "boolean":
        return "a boolean";
      case "identifier":
        return "an identifier";
      case "enum":
        return `one of ${type.values.map((v) => `"${v}"`).join(", ")}`;
      case "text":
        return "text";
      case "nbt":
        return "an NBT string or object";
      default:
        return `a ${type.kind}`;
    }
  }

  // squiggle the opening brace instead of the whole object
  private anchor(node: Node): Node {
    return { ...node, length: 1 };
  }

  private problem(node: Node, message: string, severity: Severity, code: ProblemCode): void {
    this.result.problems.push({ offset: node.offset, length: Math.max(node.length, 1), message, severity, code });
  }
}

// the canonical enum value a string stands for, like the mod reads it
export function matchEnum(type: Extract<DataType, { kind: "enum" }>, raw: string): string | undefined {
  if (type.aliases && raw in type.aliases) return type.aliases[raw];
  if (type.namespace) {
    const lower = raw.toLowerCase();
    const alias = type.aliases?.[lower];
    if (alias) return alias;
    const path = raw.startsWith(`${type.namespace}:`) ? raw.slice(type.namespace.length + 1) : raw;
    return type.values.includes(path) ? path : undefined;
  }
  const lower = raw.toLowerCase();
  return type.values.find((v) => v === lower);
}

export function fieldSummary(spec: FieldSpec): string {
  if (spec.required) return "required";
  if (spec.default !== undefined) return `default: ${JSON.stringify(spec.default)}`;
  if (spec.defaultText) return `default: ${spec.defaultText}`;
  return "optional";
}
