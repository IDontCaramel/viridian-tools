// a rough structural model of java files: types, methods, fields and enum constants
// it only has to understand the mod's own code, not java in general

import { matching, tokenize, type Token } from "./lexer.ts";

export interface JavaFile {
  rel: string;
  tokens: Token[];
  types: JavaType[];
}

export interface JavaType {
  name: string;
  kind: "class" | "enum" | "interface" | "record";
  file: JavaFile;
  outer?: JavaType;
  superName?: string;
  methods: JavaMethod[];
  fields: Map<string, JavaField>;
  enumConstants: string[];
  nested: JavaType[];
}

export interface JavaMethod {
  name: string;
  params: string[];
  owner: JavaType;
  // token range of the body, braces excluded
  start: number;
  end: number;
}

export interface JavaField {
  name: string;
  owner: JavaType;
  // token range of the initializer, `=` and `;` excluded
  start: number;
  end: number;
}

const TYPE_KEYWORDS = new Set(["class", "enum", "interface", "record"]);

export function parseFile(rel: string, source: string): JavaFile {
  const file: JavaFile = { rel, tokens: tokenize(source), types: [] };
  file.types = parseMembers(file, 0, file.tokens.length, undefined).nested;
  return file;
}

// parses the members between start and end into a holder type
function parseMembers(file: JavaFile, start: number, end: number, owner: JavaType | undefined): JavaType {
  const tokens = file.tokens;
  const holder: JavaType = owner ?? {
    name: "<file>",
    kind: "class",
    file,
    methods: [],
    fields: new Map(),
    enumConstants: [],
    nested: [],
  };

  let i = start;
  if (holder.kind === "enum") i = parseEnumConstants(file, holder, i, end);

  while (i < end) {
    const t = tokens[i]!;

    if (t.value === ";" || (t.kind === "ident" && (t.value === "package" || t.value === "import"))) {
      i = t.value === ";" ? i + 1 : skipTo(tokens, i, end, ";") + 1;
      continue;
    }
    if (t.value === "@" && tokens[i + 1]?.value !== "interface") {
      i += 2;
      while (tokens[i]?.value === ".") i += 2;
      if (tokens[i]?.value === "(") i = matching(tokens, i) + 1;
      continue;
    }
    // initializer blocks
    if (t.value === "{" || (t.value === "static" && tokens[i + 1]?.value === "{")) {
      i = matching(tokens, t.value === "{" ? i : i + 1) + 1;
      continue;
    }

    // collect a declaration up to its body or terminator
    let j = i;
    let typeKeyword = -1;
    let paren = -1;
    let assign = -1;
    while (j < end) {
      const u = tokens[j]!;
      if (u.kind === "ident" && TYPE_KEYWORDS.has(u.value) && typeKeyword < 0 && paren < 0 && assign < 0) {
        typeKeyword = j;
      } else if (u.value === "(" && paren < 0 && assign < 0) {
        paren = j;
        if (typeKeyword < 0) {
          j = matching(tokens, j) + 1;
          continue;
        }
      } else if (u.value === "=" && paren < 0 && typeKeyword < 0) {
        assign = j;
      }
      if (u.value === ";" || (u.value === "{" && assign < 0)) break;
      if (assign >= 0 && (u.value === "(" || u.value === "{" || u.value === "[")) {
        j = matching(tokens, j) + 1;
        continue;
      }
      j++;
    }

    if (typeKeyword >= 0) {
      const nested = parseType(file, holder, typeKeyword, end);
      holder.nested.push(nested.type);
      i = nested.next;
    } else if (assign >= 0) {
      addFields(tokens, holder, i, assign, j);
      i = j + 1;
    } else if (paren >= 0) {
      const name = tokens[paren - 1]!.value;
      const params = parseParams(tokens, paren);
      if (tokens[j]?.value === "{") {
        const close = matching(tokens, j);
        holder.methods.push({ name, params, owner: holder, start: j + 1, end: close });
        i = close + 1;
      } else {
        i = j + 1;
      }
    } else {
      // field without initializer, or something we don't care about
      i = tokens[j]?.value === "{" ? matching(tokens, j) + 1 : j + 1;
    }
  }

  return holder;
}

function parseType(file: JavaFile, outer: JavaType, keyword: number, end: number): { type: JavaType; next: number } {
  const tokens = file.tokens;
  const type: JavaType = {
    name: tokens[keyword + 1]!.value,
    kind: tokens[keyword]!.value as JavaType["kind"],
    file,
    outer: outer.name === "<file>" ? undefined : outer,
    methods: [],
    fields: new Map(),
    enumConstants: [],
    nested: [],
  };
  let j = keyword + 2;
  while (j < end && tokens[j]!.value !== "{") {
    if (tokens[j]!.value === "extends" && type.kind === "class") type.superName = tokens[j + 1]!.value;
    if (tokens[j]!.value === "(") j = matching(tokens, j);
    j++;
  }
  const close = matching(tokens, j);
  parseMembers(file, j + 1, close, type);
  return { type, next: close + 1 };
}

function parseEnumConstants(file: JavaFile, type: JavaType, start: number, end: number): number {
  const tokens = file.tokens;
  let i = start;
  while (i < end) {
    const t = tokens[i]!;
    if (t.value === ";") return i + 1;
    if (t.value === "@") {
      i += 2;
      if (tokens[i]?.value === "(") i = matching(tokens, i) + 1;
      continue;
    }
    if (t.kind === "ident") {
      type.enumConstants.push(t.value);
      i++;
      if (tokens[i]?.value === "(") i = matching(tokens, i) + 1;
      if (tokens[i]?.value === "{") i = matching(tokens, i) + 1;
      continue;
    }
    i++;
  }
  return i;
}

function addFields(tokens: Token[], holder: JavaType, start: number, assign: number, end: number): void {
  const name = tokens[assign - 1]!;
  if (name.kind !== "ident") return;
  holder.fields.set(name.value, { name: name.value, owner: holder, start: assign + 1, end });
  void start;
}

function parseParams(tokens: Token[], open: number): string[] {
  const close = matching(tokens, open);
  const params: string[] = [];
  let depth = 0;
  let last = "";
  for (let i = open + 1; i < close; i++) {
    const t = tokens[i]!;
    if (t.value === "<" || t.value === "(") depth++;
    else if (t.value === ">" || t.value === ")") depth--;
    else if (t.value === "," && depth === 0) {
      params.push(last);
      last = "";
    } else if (t.kind === "ident" && depth === 0) last = t.value;
  }
  if (last) params.push(last);
  return params;
}

function skipTo(tokens: Token[], i: number, end: number, value: string): number {
  while (i < end && tokens[i]!.value !== value) i++;
  return i;
}

export function allTypes(types: JavaType[]): JavaType[] {
  return types.flatMap((type) => [type, ...allTypes(type.nested)]);
}
