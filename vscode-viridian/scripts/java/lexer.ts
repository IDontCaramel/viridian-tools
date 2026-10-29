// a small java tokenizer, just enough to find calls, string literals and bracket pairs
// comments are dropped, string and char literals are kept whole

export type TokenKind = "ident" | "string" | "number" | "char" | "punct";

export interface Token {
  kind: TokenKind;
  // for strings this is the unescaped value
  value: string;
  line: number;
}

const PUNCT_2 = new Set(["->", "::", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/="]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  while (i < n) {
    const ch = source[i]!;

    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    // comments
    if (ch === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    // text blocks
    if (source.startsWith('"""', i)) {
      const start = line;
      i += 3;
      let value = "";
      while (i < n && !source.startsWith('"""', i)) {
        if (source[i] === "\n") line++;
        value += source[i];
        i++;
      }
      i += 3;
      tokens.push({ kind: "string", value, line: start });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const start = line;
      i++;
      let value = "";
      while (i < n && source[i] !== ch) {
        if (source[i] === "\\") {
          value += unescape(source[i + 1] ?? "");
          i += 2;
          continue;
        }
        value += source[i];
        i++;
      }
      i++;
      tokens.push({ kind: ch === '"' ? "string" : "char", value, line: start });
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentPart(source[j]!)) j++;
      tokens.push({ kind: "ident", value: source.slice(i, j), line });
      i = j;
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < n && /[0-9a-zA-Z_.]/.test(source[j]!)) {
        // stop at a method call on a number literal, never happens in practice
        if (source[j] === "." && !isDigit(source[j + 1] ?? "")) break;
        j++;
      }
      tokens.push({ kind: "number", value: source.slice(i, j), line });
      i = j;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (PUNCT_2.has(two)) {
      tokens.push({ kind: "punct", value: two, line });
      i += 2;
      continue;
    }
    tokens.push({ kind: "punct", value: ch, line });
    i++;
  }

  return tokens;
}

function unescape(ch: string): string {
  switch (ch) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case "0":
      return "\0";
    default:
      return ch;
  }
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

// index of the bracket that closes the one at `open`
export function matching(tokens: Token[], open: number): number {
  const opener = tokens[open]!.value;
  const closer = OPEN[opener];
  if (!closer) throw new Error(`not an opening bracket: ${opener}`);
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== "punct") continue;
    if (t.value === opener) depth++;
    else if (t.value === closer) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced ${opener} at line ${tokens[open]!.line}`);
}

// splits the tokens between brackets (exclusive) on top level commas
// generic angle brackets aren't tracked, so `Map<A, B>` inside an argument splits wrong,
// that never shows up in the call arguments we care about
export function splitArgs(tokens: Token[], open: number, close: number): Array<[number, number]> {
  const args: Array<[number, number]> = [];
  let start = open + 1;
  let depth = 0;
  for (let i = open + 1; i < close; i++) {
    const t = tokens[i]!;
    if (t.kind !== "punct") continue;
    if (t.value === "(" || t.value === "[" || t.value === "{") depth++;
    else if (t.value === ")" || t.value === "]" || t.value === "}") depth--;
    else if (t.value === "," && depth === 0) {
      args.push([start, i]);
      start = i + 1;
    }
  }
  if (start < close) args.push([start, close]);
  return args;
}

export function text(tokens: Token[], start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i++) {
    const t = tokens[i]!;
    const value = t.kind === "string" ? JSON.stringify(t.value) : t.value;
    const prev = tokens[i - 1];
    const needsSpace = out !== "" && t.kind === "ident" && prev?.kind === "ident";
    out += (needsSpace ? " " : "") + value;
  }
  return out;
}
