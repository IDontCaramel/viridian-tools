import JSON5 from "json5";
import type { Node } from "jsonc-parser";

export interface NormalizedJson {
  text: string;
  originalOffset(offset: number): number;
  normalizedOffset(offset: number): number;
  restore(root: Node | undefined): void;
}

// jsonc-parser supplies recovery and cursor paths, json5 supplies literal decoding
// offsets map back to the original text so no user content needs rewriting
export function normalizeJson5(source: string): NormalizedJson {
  const chunks: string[] = [];
  const offsets: number[] = [];
  const numbers = new Map<number, number>();
  let length = 0;
  const append = (text: string, start: number, end: number) => {
    chunks.push(text);
    for (let i = 0; i < text.length; i++) offsets.push(start + Math.floor(i * (end - start) / text.length));
    length += text.length;
  };
  let i = 0;
  while (i < source.length) {
    const start = i;
    const char = source[i]!;
    if (source.startsWith("//", i)) {
      while (i < source.length && !/[\r\n\u2028\u2029]/.test(source[i]!)) i++;
      append(source.slice(start, i).replace(/[^\r\n]/g, " "), start, i); continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2); i = end < 0 ? source.length : end + 2;
      append(source.slice(start, i).replace(/[^\r\n]/g, " "), start, i); continue;
    }
    if (char === '"' || char === "'") {
      i++;
      while (i < source.length) {
        if (source[i] === "\\") { i += source[i + 1] === "\r" && source[i + 2] === "\n" ? 3 : 2; continue; }
        if (source[i++] === char) break;
      }
      i = Math.min(i, source.length);
      const raw = source.slice(start, i);
      try { append(JSON.stringify(JSON5.parse(raw)), start, i); }
      catch { append(raw, start, i); }
      continue;
    }
    if (/\s/u.test(char)) { append(/[\r\n\t ]/.test(char) ? char : " ", i, i + 1); i++; continue; }
    if ("{}[],:".includes(char)) { append(char, i, i + 1); i++; continue; }
    while (i < source.length && !/[\s{}\[\],:]/u.test(source[i]!) && !source.startsWith("//", i) && !source.startsWith("/*", i)) i++;
    if (i === start) i++;
    const raw = source.slice(start, i);
    const after = source.slice(i).replace(/^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*/, "");
    try {
      if (after.startsWith(":")) {
        const key = Object.keys(JSON5.parse(`{${raw}:null}`))[0]!;
        append(JSON.stringify(key), start, i);
      } else {
        const value = JSON5.parse(raw);
        if (typeof value === "number") numbers.set(length, value);
        append(JSON.stringify(value), start, i);
      }
    } catch { append(raw, start, i); }
  }
  offsets.push(source.length);
  const originalOffset = (offset: number) => offsets[Math.max(0, Math.min(offset, offsets.length - 1))]!;
  return {
    text: chunks.join(""), originalOffset,
    normalizedOffset(offset) {
      let low = 0, high = offsets.length - 1;
      while (low < high) { const mid = (low + high) >>> 1; if (offsets[mid]! < offset) low = mid + 1; else high = mid; }
      return low;
    },
    restore(root) {
      function visit(node: Node) {
        const start = node.offset;
        const end = originalOffset(start + node.length);
        if (numbers.has(start)) { Object.assign(node, { type: "number", value: numbers.get(start) }); }
        Object.assign(node, { offset: originalOffset(start), length: end - originalOffset(start) });
        if (node.colonOffset !== undefined) Object.assign(node, { colonOffset: originalOffset(node.colonOffset) });
        for (const child of node.children ?? []) visit(child);
      }
      if (root) visit(root);
    },
  };
}
