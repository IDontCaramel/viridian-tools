// walks the mod's registration code and pulls out every registered type with the fields its reader reads
//
// it's a tiny symbolic evaluator: method arguments are kept as unevaluated token spans and only resolved
// (to strings, a registry, or a data type) where needed. that's enough to follow the mod's helper methods,
// for loops over id lists and per-category registrations like MetaActions.register(category)

import type { DataType, FieldSpec, JsonValue, RegistryKind, TypeEntry, TypeRef } from "../../src/catalog/types.ts";
import { matching, splitArgs, text, type Token } from "./lexer.ts";
import { allTypes, type JavaField, type JavaFile, type JavaMethod, type JavaType } from "./model.ts";
import { codecConstantType, minecraftEnum, registryType, tagType } from "./types.ts";

interface Span {
  start: number;
  end: number;
  ctx: Ctx;
}

type Value = { kind: "span"; span: Span } | { kind: "registry"; registry: RegistryKind };

interface Ctx {
  id: number;
  type: JavaType;
  // token range locals and loop variables are looked up in: a method body or a field initializer
  scope?: { start: number; end: number };
  bindings: Map<string, Value>;
  // the registry `this` is, inside ActionCategory/ConditionCategory methods
  self?: RegistryKind;
  depth: number;
}

interface Loop {
  name: string;
  values: Span;
  start: number;
  end: number;
}

export interface Extracted {
  registries: Partial<Record<RegistryKind, Record<string, TypeEntry>>>;
  pathAliases: Partial<Record<RegistryKind, Record<string, string>>>;
  namespaceAliases: Record<string, string>;
  dataTypes: Record<string, DataType>;
  warnings: string[];
}

const SINKS = new Set(["register", "registerObject"]);
const MAX_DEPTH = 12;

export class Extractor {
  private readonly types: JavaType[];
  private readonly bySimpleName = new Map<string, JavaType[]>();
  private readonly loops = new Map<string, Loop[]>();
  private readonly visited = new Set<string>();
  // names of methods that can end up registering something, so we only follow those
  private readonly registering: Set<string>;
  private nextCtx = 0;
  private readonly out: Extracted = {
    registries: {},
    pathAliases: {},
    namespaceAliases: {},
    dataTypes: {},
    warnings: [],
  };

  constructor(files: JavaFile[]) {
    this.types = files.flatMap((file) => allTypes(file.types));
    for (const type of this.types) {
      const list = this.bySimpleName.get(type.name) ?? [];
      list.push(type);
      this.bySimpleName.set(type.name, list);
    }
    this.registering = this.registeringMethodNames();
  }

  private registeringMethodNames(): Set<string> {
    const names = new Set(["register", "registerObject", "addPathAlias", "add"]);
    const calls = new Map<JavaMethod, Set<string>>();
    for (const type of this.types) {
      for (const method of type.methods) {
        const tokens = type.file.tokens;
        const called = new Set<string>();
        for (let i = method.start; i < method.end; i++) {
          if (tokens[i]!.kind === "ident" && tokens[i + 1]?.value === "(") called.add(tokens[i]!.value);
        }
        calls.set(method, called);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [method, called] of calls) {
        if (names.has(method.name)) continue;
        if ([...called].some((name) => names.has(name))) {
          names.add(method.name);
          changed = true;
        }
      }
    }
    return names;
  }

  private ctx(fields: Omit<Ctx, "id">): Ctx {
    return { id: this.nextCtx++, ...fields };
  }

  run(): Extracted {
    for (const type of this.types) {
      for (const field of type.fields.values()) {
        this.walkStatements(this.fieldSpan(field));
      }
      for (const method of type.methods) {
        this.walkStatements({ start: method.start, end: method.end, ctx: this.ctx({ type, scope: method, bindings: new Map(), depth: 0 }) });
      }
    }
    return this.out;
  }

  // finds the calls in a span: registrations, aliases, and calls into the mod's own methods
  private walkStatements(span: Span): void {
    const tokens = span.ctx.type.file.tokens;
    for (let i = span.start; i < span.end; i++) {
      const t = tokens[i]!;
      if (t.kind !== "ident" || tokens[i + 1]?.value !== "(") continue;
      const prev = tokens[i - 1];
      if (prev?.kind === "ident" && !["return", "else", "throw"].includes(prev.value)) continue;

      const close = matching(tokens, i + 1);
      const args = splitArgs(tokens, i + 1, close).map(([s, e]) => this.spanAt(span.ctx, s, e));
      const qualifier = this.qualifierOf(tokens, i, span.ctx);
      this.handleCall(span.ctx, t.value, qualifier, args);
    }
  }

  private handleCall(ctx: Ctx, name: string, qualifier: Span | undefined, args: Span[]): void {
    if (name === "addPathAlias" && qualifier && args.length === 2) {
      const registry = this.registryOf(qualifier);
      const from = this.strings(args[0]!);
      const to = this.strings(args[1]!);
      if (registry && from.length === 1 && to.length === 1) {
        (this.out.pathAliases[registry] ??= {})[from[0]!] = to[0]!;
      }
      return;
    }
    if (name === "add" && qualifier && this.tokensText(qualifier) === "NamespaceAliases" && args.length === 2) {
      const [from] = this.strings(args[0]!);
      const [to] = this.strings(args[1]!);
      if (from && to) this.out.namespaceAliases[from] = to;
      return;
    }

    const receiver = qualifier ? this.registryOf(qualifier) : ctx.self;
    if (SINKS.has(name) && receiver && args.length >= 2) {
      this.registerSink(receiver, args[0]!, args[1]!);
      return;
    }

    if (ctx.depth >= MAX_DEPTH || !this.registering.has(name)) return;

    // a call on a registry object: run the category's own method with `this` bound
    if (receiver && qualifier) {
      const owner = this.registryClass(receiver);
      for (const method of owner ? this.methodsNamed(owner, name, args.length) : []) {
        this.invoke(method, args, receiver, ctx);
      }
      return;
    }

    const owner = qualifier ? this.typeNamed(this.tokensText(qualifier), ctx.type) : ctx.type;
    if (!owner) return;
    for (const method of this.methodsNamed(owner, name, args.length)) {
      this.invoke(method, args, qualifier ? undefined : ctx.self, ctx);
    }
  }

  private invoke(method: JavaMethod, args: Span[], self: RegistryKind | undefined, caller: Ctx): void {
    const bindings = new Map<string, Value>();
    method.params.forEach((param, index) => {
      const arg = args[index];
      if (arg) bindings.set(param, { kind: "span", span: arg });
    });
    const key = `${method.owner.file.rel}:${method.start}:${self ?? ""}:${[...bindings.values()].map((v) => this.valueKey(v)).join("|")}`;
    if (this.visited.has(key)) return;
    this.visited.add(key);
    this.walkStatements({
      start: method.start,
      end: method.end,
      ctx: this.ctx({ type: method.owner, scope: method, bindings, self, depth: caller.depth + 1 }),
    });
  }

  private valueKey(value: Value): string {
    if (value.kind === "registry") return value.registry;
    const { span } = value;
    return `${span.ctx.id}@${span.start}-${span.end}`;
  }

  private registerSink(registry: RegistryKind, idSpan: Span, factory: Span): void {
    const ids = this.strings(idSpan).map((raw) => (raw.includes(":") ? raw : `apoli:${raw}`));
    if (ids.length === 0) return;
    const fields = this.fieldsOf(factory, true);
    const source = this.sourceOf(factory);
    const entries = (this.out.registries[registry] ??= {});
    for (const id of ids) {
      const existing = entries[id];
      if (existing) {
        for (const [name, spec] of Object.entries(fields)) existing.fields[name] ??= spec;
      } else {
        entries[id] = { fields: { ...fields }, source };
      }
    }
  }

  // where the reader is defined: follows references like CooldownPowerType.CODEC to their initializer
  private sourceOf(factory: Span): string {
    let span = factory;
    for (let reference = this.resolveReference(span); reference; reference = this.resolveReference(span)) span = reference;
    const call = this.callAt(span);
    const owner = call?.qualifier ? this.typeNamed(this.tokensText(call.qualifier), span.ctx.type) : undefined;
    const builder = owner && ["JsonDataType", "CalioDataTypes", "PowerType"].includes(owner.name);
    const method = owner && call && !builder ? this.methodsNamed(owner, call.name, call.args.length)[0] : undefined;
    if (method) return `${method.owner.file.rel}:${method.owner.file.tokens[method.start]!.line}`;
    return `${span.ctx.type.file.rel}:${span.ctx.type.file.tokens[span.start]!.line}`;
  }

  // ---------- fields

  private fieldsOf(span: Span, root: boolean, seen = new Set<string>()): Record<string, FieldSpec> {
    const fields: Record<string, FieldSpec> = {};
    const tokens = span.ctx.type.file.tokens;
    const key = `${span.ctx.id}:${span.start}:${span.end}`;
    if (seen.has(key) || span.ctx.depth > MAX_DEPTH) return fields;
    seen.add(key);

    // a bare reference like `CooldownPowerType.CODEC` or a parameter
    const reference = this.resolveReference(span);
    if (reference) return this.fieldsOf(reference, root, seen);

    const add = (name: string, spec: FieldSpec) => {
      fields[name] ??= spec;
    };

    for (let i = span.start; i < span.end; i++) {
      const t = tokens[i]!;

      if (t.kind === "ident" && t.value === "JsonDataType" && tokens[i + 1]?.value === ".") {
        const method = tokens[i + 2]?.value;
        const open = i + 3;
        if (tokens[open]?.value !== "(") continue;
        const close = matching(tokens, open);
        const args = splitArgs(tokens, open, close).map(([s, e]) => this.spanAt(span.ctx, s, e));

        if ((method === "required" || method === "field") && args.length >= 4) {
          const names = this.strings(args[1]!);
          const type = this.typeOf(args[2]!);
          for (const name of names) {
            if (method === "required") add(name, { type, required: true });
            else add(name, { type, ...this.defaultOf(args[3]!, type) });
          }
          i = close;
          continue;
        }
        // nested codecs define their own object types, skip them unless they are the reader itself
        if ((method === "codec" || method === "mapCodec") && !root && !this.startsStatement(tokens, i)) {
          i = close;
          continue;
        }
        continue;
      }

      if (t.kind === "ident" && t.value === "GsonHelper" && tokens[i + 2]?.value.startsWith("getAs")) {
        const open = i + 3;
        if (tokens[open]?.value !== "(") continue;
        const close = matching(tokens, open);
        const args = splitArgs(tokens, open, close).map(([s, e]) => this.spanAt(span.ctx, s, e));
        const type = gsonType(tokens[i + 2]!.value);
        if (args.length >= 2 && type) {
          for (const name of this.strings(args[1]!)) {
            add(name, args.length >= 3 ? { type, ...this.defaultOf(args[2]!, type) } : { type, required: true });
          }
        }
        i = close;
        continue;
      }

      // follow calls into the mod's own helpers, like readCondition(json, ops)
      if (t.kind === "ident" && tokens[i + 1]?.value === "(" && tokens[i - 1]?.value !== "new") {
        const qualifier = this.qualifierOf(tokens, i, span.ctx);
        const owner = qualifier ? this.typeNamed(this.tokensText(qualifier), span.ctx.type) : span.ctx.type;
        const close = matching(tokens, i + 1);
        if (owner && !(qualifier && this.registryOf(qualifier))) {
          const args = splitArgs(tokens, i + 1, close).map(([s, e]) => this.spanAt(span.ctx, s, e));
          for (const method of this.methodsNamed(owner, t.value, args.length)) {
            const bindings = new Map<string, Value>();
            method.params.forEach((param, index) => {
              if (args[index]) bindings.set(param, { kind: "span", span: args[index]! });
            });
            const ctx = this.ctx({ type: method.owner, scope: method, bindings, self: span.ctx.self, depth: span.ctx.depth + 1 });
            const nested = this.fieldsOf({ start: method.start, end: method.end, ctx }, true, seen);
            for (const [name, spec] of Object.entries(nested)) add(name, spec);
          }
        }
        continue;
      }
    }
    return fields;
  }

  // `return JsonDataType.mapCodec(...)` and `X = ...;` statements still count as the reader itself
  private startsStatement(tokens: Token[], i: number): boolean {
    const prev = tokens[i - 1]?.value;
    return prev === "return" || prev === "->";
  }

  private defaultOf(span: Span, type: TypeRef): Pick<FieldSpec, "default" | "defaultText"> {
    const tokens = span.ctx.type.file.tokens;
    const raw = text(tokens, span.start, span.end);
    if (raw === "null" || raw.startsWith("Optional.empty")) return {};

    const reference = this.resolveReference(span);
    if (reference && span.end - span.start === 1) return this.defaultOf(reference, type);

    // defaults to the value of another field
    const other = raw.match(/^JsonDataType\.(?:field|required)\(\w+,"([^"]+)"/);
    if (other) return { defaultText: `same as "${other[1]}"` };

    const value = javaLiteral(tokens, span.start, span.end) ?? this.enumDefault(raw, type);
    if (value !== undefined) return { default: value };
    return { defaultText: raw };
  }

  // Comparison.NONE, List.of(InteractionHand.values()), List.of(InventoryType.INVENTORY)
  private enumDefault(raw: string, type: TypeRef): JsonValue | undefined {
    const named = (ref: TypeRef) => (typeof ref === "string" ? this.out.dataTypes[ref] : ref);
    const constant = (expr: string, values: string[]) => {
      const name = expr.match(/^(?:[A-Z]\w*\.)+([A-Z][A-Z0-9_]*)$/)?.[1]?.toLowerCase();
      return name && values.includes(name) ? name : undefined;
    };

    const resolved = named(type);
    if (resolved?.kind === "enum") return constant(raw, resolved.values);

    const listOf = typeof type === "string" ? type.match(/^list<(.+)>$/)?.[1] : resolved?.kind === "list" ? resolved.of : undefined;
    const element = listOf ? named(listOf) : undefined;
    const items = raw.match(/^List\.of\((.*)\)$/)?.[1];
    if (element?.kind !== "enum" || items === undefined) return undefined;
    if (items.endsWith(".values()")) return element.values;
    const values = items.split(",").map((item) => constant(item, element.values));
    return values.every((v) => v !== undefined) ? values : undefined;
  }

  // ---------- types

  typeOf(span: Span, depth = 0): TypeRef {
    const tokens = span.ctx.type.file.tokens;
    const raw = text(tokens, span.start, span.end);
    if (depth > MAX_DEPTH) return "any";

    const constant = codecConstantType(raw);
    if (constant) return constant;
    if (span.ctx.self && raw === "codec") return span.ctx.self;
    if (span.ctx.self && raw === "listCodec") return `list<${span.ctx.self}>`;

    const reference = this.resolveReference(span);
    if (reference) return this.typeOf(reference, depth + 1);

    // registry codecs: Actions.ENTITY.codec(), category.listCodec(), EntityConditions.CATEGORY.codec()
    const codecCall = raw.match(/^(.*)\.(codec|listCodec)\(\)$/);
    if (codecCall) {
      const receiverEnd = this.findLastDot(tokens, span.start, span.end);
      const registry = receiverEnd >= 0 ? this.registryOf({ ...span, end: receiverEnd }) : undefined;
      if (registry) return codecCall[2] === "listCodec" ? `list<${registry}>` : registry;
    }

    const call = this.callAt(span);
    if (call) {
      const { name, args, qualifier } = call;
      const q = qualifier ? this.tokensText(qualifier) : "";
      if (name === "list" && args.length === 1) return listOf(this.typeOf(args[0]!, depth + 1));
      if (name === "weightedList" && args.length === 1) return { kind: "weighted_list", of: this.typeOf(args[0]!, depth + 1) };
      if (name === "enumValue" && args.length >= 1) return this.enumType(args[0]!);
      if ((name === "registry" || name === "registryKey") && args.length === 1) {
        return registryType(this.tokensText(args[0]!)) ?? this.unknown(span, "registry");
      }
      if (name === "tag" && args.length === 1) return tagType(this.tokensText(args[0]!)) ?? this.unknown(span, "tag");
      if ((name === "codec" || name === "mapCodec") && q === "JsonDataType") {
        const fields = this.fieldsOf(args[0]!, true);
        return Object.keys(fields).length > 0 ? { kind: "object", fields } : this.unknown(span, "inline codec");
      }
      if (["xmap", "comapFlatMap", "flatXmap", "validate", "flatComapMap"].includes(name) && qualifier) {
        return this.typeOf(qualifier, depth + 1);
      }
      if (name === "lazyInitialized" && args.length === 1) {
        const body = args[0]!;
        const arrow = this.indexOf(tokens, body.start, body.end, "->");
        if (arrow >= 0) return this.typeOf({ ...body, start: arrow + 1 }, depth + 1);
      }
    }

    return this.unknown(span, "codec");
  }

  private enumType(classSpan: Span): TypeRef {
    const raw = this.tokensText(classSpan).replace(/\.class$/, "");
    const mc = minecraftEnum(raw);
    if (mc) {
      this.out.dataTypes[mc.name] ??= { kind: "enum", values: mc.values };
      return mc.name;
    }
    const type = this.typeNamed(raw, classSpan.ctx.type);
    if (!type || type.kind !== "enum") return this.unknown(classSpan, "enum");
    const name = this.enumTypeName(type);
    this.out.dataTypes[name] ??= { kind: "enum", values: type.enumConstants.map((c) => c.toLowerCase()) };
    return name;
  }

  // the simple name, unless the mod declares more than one enum with that name
  private enumTypeName(type: JavaType): string {
    const shared = (this.bySimpleName.get(type.name) ?? []).filter((t) => t.kind === "enum").length > 1;
    const parts = shared && type.outer ? [type.outer.name, type.name] : [type.name];
    return parts
      .join("_")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase();
  }

  private unknown(span: Span, what: string): TypeRef {
    const tokens = span.ctx.type.file.tokens;
    this.out.warnings.push(
      `unknown ${what} at ${span.ctx.type.file.rel}:${tokens[span.start]?.line}: ${text(tokens, span.start, span.end)}`,
    );
    return "any";
  }

  // ---------- values

  // what a span evaluates to as strings: literals, string arrays, List.of(...), identifiers
  strings(span: Span, depth = 0): string[] {
    const tokens = span.ctx.type.file.tokens;
    if (depth > MAX_DEPTH || span.end <= span.start) return [];
    if (span.end - span.start === 1 && tokens[span.start]!.kind === "string") return [tokens[span.start]!.value];

    const reference = this.resolveReference(span);
    if (reference) return this.strings(reference, depth + 1);

    // new String[]{"a", "b"}
    if (tokens[span.start]!.value === "new") {
      const open = this.indexOf(tokens, span.start, span.end, "{");
      if (open >= 0) {
        return splitArgs(tokens, open, matching(tokens, open)).flatMap(([s, e]) =>
          this.strings(this.spanAt(span.ctx, s, e), depth + 1),
        );
      }
    }

    // (a ? "x" : "y") can be either
    if (tokens[span.start]!.value === "(" && matching(tokens, span.start) === span.end - 1) {
      return this.strings(this.spanAt(span.ctx, span.start + 1, span.end - 1), depth + 1);
    }
    const question = this.splitTopLevel(tokens, span.start, span.end, "?");
    if (question.length === 2) {
      const branches = this.splitTopLevel(tokens, question[1]![0], question[1]![1], ":");
      return branches.flatMap(([s, e]) => this.strings(this.spanAt(span.ctx, s, e), depth + 1));
    }

    // "apoli:" + name
    const parts = this.splitTopLevel(tokens, span.start, span.end, "+");
    if (parts.length > 1) {
      return parts.reduce<string[]>(
        (acc, [s, e]) => acc.flatMap((prefix) => this.strings(this.spanAt(span.ctx, s, e), depth + 1).map((v) => prefix + v)),
        [""],
      );
    }

    const call = this.callAt(span);
    if (!call) return [];

    // X.getPath() where X is `register("path", ...)`
    if (call.name === "getPath" && call.qualifier && call.args.length === 0) {
      const field = this.fieldNamed(span.ctx.type, this.tokensText(call.qualifier));
      const first = field?.owner.file.tokens.slice(field.start, field.end).find((t) => t.kind === "string");
      return first ? [first.value] : [];
    }

    const { name, args, qualifier } = call;
    const q = qualifier ? this.tokensText(qualifier) : "";
    if ((name === "of" && ["List", "Set", "Stream"].includes(q)) || (name === "asList" && q === "Arrays")) {
      return args.flatMap((arg) => this.strings(arg, depth + 1));
    }
    if (name === "parse" && q === "Identifier" && args.length === 1) {
      return this.strings(args[0]!, depth + 1).map((s) => (s.includes(":") ? s : `minecraft:${s}`));
    }
    if (name === "fromNamespaceAndPath" && q === "Identifier" && args.length === 2) {
      const namespaces = this.strings(args[0]!, depth + 1);
      const paths = this.strings(args[1]!, depth + 1);
      return namespaces.flatMap((ns) => paths.map((path) => `${ns}:${path}`));
    }

    // a helper like id("x") that returns an expression built from its parameter
    const owner = qualifier ? this.typeNamed(q, span.ctx.type) : span.ctx.type;
    for (const method of owner ? this.methodsNamed(owner, name, args.length) : []) {
      const ret = this.indexOf(method.owner.file.tokens, method.start, method.end, "return");
      if (ret < 0) continue;
      const end = this.indexOf(method.owner.file.tokens, ret, method.end, ";");
      const bindings = new Map<string, Value>();
      method.params.forEach((param, index) => {
        if (args[index]) bindings.set(param, { kind: "span", span: args[index]! });
      });
      const ctx = this.ctx({ type: method.owner, scope: method, bindings, depth: span.ctx.depth + 1 });
      const result = this.strings({ start: ret + 1, end, ctx }, depth + 1);
      if (result.length > 0) return result;
    }
    return [];
  }

  // which registry a span refers to: Actions.ENTITY, CATEGORY, category (a parameter), PowerTypes.REGISTRY
  registryOf(span: Span, depth = 0): RegistryKind | undefined {
    if (depth > MAX_DEPTH) return undefined;
    const tokens = span.ctx.type.file.tokens;
    if (span.end - span.start === 1 && tokens[span.start]!.value === "this") return span.ctx.self;

    const binding = this.bindingOf(span);
    if (binding?.kind === "registry") return binding.registry;

    const reference = this.resolveReference(span);
    if (reference) return this.registryOf(reference, depth + 1);

    // new ActionCategory<>("Entity action", ...), new ConditionCategory<>("Entity condition"), new TypeRegistry<>("Power type")
    if (tokens[span.start]?.value === "new") {
      const className = tokens[span.start + 1]?.value;
      if (className !== "ActionCategory" && className !== "ConditionCategory" && className !== "TypeRegistry") return undefined;
      const literal = tokens.slice(span.start, span.end).find((t) => t.kind === "string");
      return literal ? registryFromLabel(literal.value) : undefined;
    }
    return undefined;
  }

  private registryClass(registry: RegistryKind): JavaType | undefined {
    const name = registry.endsWith("_action") ? "ActionCategory" : registry.endsWith("_condition") ? "ConditionCategory" : "TypeRegistry";
    return this.bySimpleName.get(name)?.[0];
  }

  // follows a span that is only a name: a parameter, a loop variable, a local, or a static field
  private resolveReference(span: Span): Span | undefined {
    const tokens = span.ctx.type.file.tokens;
    const names: string[] = [];
    for (let i = span.start; i < span.end; i++) {
      const t = tokens[i]!;
      if ((i - span.start) % 2 === 0 ? t.kind !== "ident" : t.value !== ".") return undefined;
      if (t.kind === "ident") names.push(t.value);
    }
    if (names.length === 0 || (span.end - span.start) % 2 === 0) return undefined;

    if (names.length === 1) {
      const name = names[0]!;
      if (span.ctx.self && (name === "codec" || name === "listCodec")) return undefined;
      const loop = this.loopAt(span.ctx, name, span.start);
      if (loop) return loop.values;
      const binding = span.ctx.bindings.get(name);
      if (binding?.kind === "span") return binding.span;
      const local = this.localAssignment(span.ctx, name, span.start);
      if (local) return local;
      const field = this.fieldNamed(span.ctx.type, name);
      if (field) return this.fieldSpan(field);
      return undefined;
    }

    // Type.FIELD or Outer.Inner.FIELD
    const fieldName = names[names.length - 1]!;
    const owner = this.typeNamed(names.slice(0, -1).join("."), span.ctx.type);
    const field = owner ? this.fieldNamed(owner, fieldName) : undefined;
    return field ? this.fieldSpan(field) : undefined;
  }

  private bindingOf(span: Span): Value | undefined {
    const tokens = span.ctx.type.file.tokens;
    if (span.end - span.start !== 1 || tokens[span.start]!.kind !== "ident") return undefined;
    return span.ctx.bindings.get(tokens[span.start]!.value);
  }

  private fieldSpan(field: JavaField): Span {
    const scope = { start: field.start, end: field.end };
    return { ...scope, ctx: this.ctx({ type: field.owner, scope, bindings: new Map(), depth: 0 }) };
  }

  private localAssignment(ctx: Ctx, name: string, before: number): Span | undefined {
    const scope = ctx.scope;
    if (!scope) return undefined;
    const tokens = ctx.type.file.tokens;
    for (let i = Math.min(before, scope.end) - 1; i >= scope.start; i--) {
      const t = tokens[i]!;
      if (t.kind !== "ident" || t.value !== name || tokens[i + 1]?.value !== "=") continue;
      let end = i + 2;
      while (end < scope.end && tokens[end]!.value !== ";") {
        const v = tokens[end]!.value;
        end = v === "(" || v === "{" || v === "[" ? matching(tokens, end) + 1 : end + 1;
      }
      return { start: i + 2, end, ctx };
    }
    return undefined;
  }

  private loopAt(ctx: Ctx, name: string, at: number): Loop | undefined {
    const scope = ctx.scope;
    if (!scope) return undefined;
    const key = `${ctx.type.file.rel}:${scope.start}`;
    let loops = this.loops.get(key);
    if (!loops) {
      loops = this.findLoops(ctx.type.file.tokens, scope, ctx);
      this.loops.set(key, loops);
    }
    // loops are cached without bindings, so re-wrap the span with the current context
    const loop = loops.filter((l) => l.name === name && l.start <= at && at < l.end).at(-1);
    return loop ? { ...loop, values: { ...loop.values, ctx } } : undefined;
  }

  private findLoops(tokens: Token[], scope: { start: number; end: number }, ctx: Ctx): Loop[] {
    const loops: Loop[] = [];
    for (let i = scope.start; i < scope.end; i++) {
      if (tokens[i]!.value !== "for" || tokens[i + 1]?.value !== "(") continue;
      const close = matching(tokens, i + 1);
      const colon = this.indexOf(tokens, i + 2, close, ":");
      if (colon < 0) continue;
      const name = tokens[colon - 1]!.value;
      let end: number;
      if (tokens[close + 1]?.value === "{") {
        end = matching(tokens, close + 1);
      } else {
        end = close + 1;
        while (end < scope.end && tokens[end]!.value !== ";") {
          const v = tokens[end]!.value;
          end = v === "(" || v === "{" || v === "[" ? matching(tokens, end) + 1 : end + 1;
        }
      }
      loops.push({ name, values: { start: colon + 1, end: close, ctx }, start: close + 1, end });
    }
    return loops;
  }

  // ---------- lookup helpers

  private qualifierOf(tokens: Token[], nameIndex: number, ctx: Ctx): Span | undefined {
    if (tokens[nameIndex - 1]?.value !== ".") return undefined;
    let start = nameIndex - 2;
    while (tokens[start - 1]?.value === "." && tokens[start - 2]?.kind === "ident") start -= 2;
    if (tokens[start]?.kind !== "ident") return undefined;
    return this.spanAt(ctx, start, nameIndex - 1);
  }

  private callAt(span: Span): { name: string; qualifier?: Span; args: Span[] } | undefined {
    const tokens = span.ctx.type.file.tokens;
    const last = tokens[span.end - 1];
    if (last?.value !== ")") return undefined;
    // find the opening paren of the final call
    let depth = 0;
    let open = -1;
    for (let i = span.end - 1; i >= span.start; i--) {
      const v = tokens[i]!.value;
      if (v === ")") depth++;
      else if (v === "(") {
        depth--;
        if (depth === 0) {
          open = i;
          break;
        }
      }
    }
    const nameToken = tokens[open - 1];
    if (open <= span.start || nameToken?.kind !== "ident") return undefined;
    const args = splitArgs(tokens, open, span.end - 1).map(([s, e]) => this.spanAt(span.ctx, s, e));
    const qualifier = tokens[open - 2]?.value === "." && open - 2 > span.start ? { ...span, end: open - 2 } : undefined;
    return { name: nameToken.value, qualifier, args };
  }

  private findLastDot(tokens: Token[], start: number, end: number): number {
    let depth = 0;
    for (let i = end - 1; i >= start; i--) {
      const v = tokens[i]!.value;
      if (v === ")") depth++;
      else if (v === "(") depth--;
      else if (v === "." && depth === 0) return i;
    }
    return -1;
  }

  private typeNamed(name: string, from: JavaType): JavaType | undefined {
    const parts = name.split(".");
    // nested types visible from here first
    for (let scope: JavaType | undefined = from; scope; scope = scope.outer) {
      if (scope.name === parts[0]) return this.descend(scope, parts.slice(1));
      const nested = scope.nested.find((t) => t.name === parts[0]);
      if (nested) return this.descend(nested, parts.slice(1));
    }
    const sameFile = allTypes(from.file.types).find((t) => t.name === parts[0]);
    if (sameFile) return this.descend(sameFile, parts.slice(1));
    const candidates = this.bySimpleName.get(parts[0]!) ?? [];
    const topLevel = candidates.find((t) => !t.outer) ?? candidates[0];
    return topLevel ? this.descend(topLevel, parts.slice(1)) : undefined;
  }

  private descend(type: JavaType, parts: string[]): JavaType | undefined {
    let current: JavaType | undefined = type;
    for (const part of parts) current = current?.nested.find((t) => t.name === part);
    return current;
  }

  private methodsNamed(type: JavaType, name: string, argc: number): JavaMethod[] {
    for (let scope: JavaType | undefined = type; scope; scope = this.superOf(scope) ?? scope.outer) {
      const found = scope.methods.filter((m) => m.name === name && m.params.length === argc);
      if (found.length > 0) return found;
    }
    return [];
  }

  private fieldNamed(type: JavaType, name: string): JavaField | undefined {
    for (let scope: JavaType | undefined = type; scope; scope = this.superOf(scope) ?? scope.outer) {
      const field = scope.fields.get(name);
      if (field) return field;
    }
    return undefined;
  }

  private superOf(type: JavaType): JavaType | undefined {
    return type.superName ? this.typeNamed(type.superName, type) : undefined;
  }

  private spanAt(ctx: Ctx, start: number, end: number): Span {
    return { start, end, ctx };
  }

  private tokensText(span: Span): string {
    return text(span.ctx.type.file.tokens, span.start, span.end);
  }

  private splitTopLevel(tokens: Token[], start: number, end: number, separator: string): Array<[number, number]> {
    const parts: Array<[number, number]> = [];
    let depth = 0;
    let from = start;
    for (let i = start; i < end; i++) {
      const v = tokens[i]!.value;
      if (v === "(" || v === "[" || v === "{") depth++;
      else if (v === ")" || v === "]" || v === "}") depth--;
      else if (v === separator && depth === 0 && tokens[i]!.kind === "punct") {
        parts.push([from, i]);
        from = i + 1;
      }
    }
    parts.push([from, end]);
    return parts;
  }

  private indexOf(tokens: Token[], start: number, end: number, value: string): number {
    for (let i = start; i < end; i++) if (tokens[i]!.value === value) return i;
    return -1;
  }
}

function registryFromLabel(label: string): RegistryKind | undefined {
  const normalized = label.toLowerCase().replace("bi-entity", "bientity").replace(/ type$/, "").replace(/ /g, "_");
  const known: Record<string, RegistryKind> = {
    power: "power_type",
    entity_action: "entity_action",
    bientity_action: "bientity_action",
    block_action: "block_action",
    item_action: "item_action",
    entity_condition: "entity_condition",
    bientity_condition: "bientity_condition",
    block_condition: "block_condition",
    item_condition: "item_condition",
    damage_condition: "damage_condition",
    fluid_condition: "fluid_condition",
    biome_condition: "biome_condition",
  };
  return known[normalized];
}

function gsonType(method: string): TypeRef | undefined {
  const map: Record<string, TypeRef> = {
    getAsString: "string",
    getAsInt: "int",
    getAsLong: "int",
    getAsBoolean: "boolean",
    getAsFloat: "float",
    getAsDouble: "double",
    getAsJsonObject: "any",
    getAsJsonArray: "any",
  };
  return map[method];
}

function listOf(type: TypeRef): TypeRef {
  return typeof type === "string" ? `list<${type}>` : { kind: "list", of: type };
}

// turns a simple java literal into json, or undefined when it isn't one
function javaLiteral(tokens: Token[], start: number, end: number): JsonValue | undefined {
  const raw = text(tokens, start, end);
  if (raw === "true" || raw === "false") return raw === "true";
  if (end - start === 1 && tokens[start]!.kind === "string") return tokens[start]!.value;
  const number = raw.match(/^(-?)(\d+(?:\.\d*)?(?:[eE][-+]?\d+)?|\.\d+)[fFdDlL]?$/);
  if (number) return Number(number[1]! + number[2]!);
  const constants: Record<string, number> = {
    "Integer.MAX_VALUE": 2147483647,
    "Integer.MIN_VALUE": -2147483648,
  };
  if (raw in constants) return constants[raw]!;
  if (/^(List\.of|Set\.of|Collections\.emptyList|new ArrayList<>|new LinkedList<>)\(\)$/.test(raw)) return [];
  if (raw === "new CompoundTag()" || raw === "Map.of()") return {};
  if (raw === "HudRender.DONT_RENDER") return { should_render: false };
  const key = raw.match(/^new KeyBindingData\("([^"]*)",(true|false)\)$/);
  if (key) return { key: key[1]!, continuous: key[2] === "true" };
  if (raw === "Vec3.ZERO") return { x: 0, y: 0, z: 0 };
  const vector = raw.match(/^new Vec3\(([-\d.]+)[dDfF]?,([-\d.]+)[dDfF]?,([-\d.]+)[dDfF]?\)$/);
  if (vector) return { x: Number(vector[1]), y: Number(vector[2]), z: Number(vector[3]) };
  return undefined;
}
