// parses a datapack file and runs the analysis on it

import { parseTree, type Node, type ParseError } from "jsonc-parser";
import type { Catalog } from "../catalog/catalog.ts";
import { classifyPath, type DatapackFile } from "../datapack/paths.ts";
import { analyze, type Analysis } from "./analyze.ts";
import JSON5 from "json5";
import { normalizeJson5 } from "./json5.ts";
import { Schema } from "./schema.ts";

export interface ParsedFile {
  file: DatapackFile;
  root: Node | undefined;
  schema: Schema;
  syntaxErrors: ParseError[];
}

export function parseFile(text: string, path: string, catalog: Catalog): ParsedFile | undefined {
  const file = classifyPath(path);
  if (!file) return undefined;
  const syntaxErrors: ParseError[] = [];
  const json5 = path.endsWith(".json5");
  const normalized = json5 ? normalizeJson5(text) : undefined;
  const relaxed = json5 || path.endsWith(".jsonc");
  const root = parseTree(normalized?.text ?? text, syntaxErrors, { allowTrailingComma: relaxed, disallowComments: !relaxed });
  if (normalized) {
    for (const error of syntaxErrors) {
      const end = normalized.originalOffset(error.offset + error.length);
      error.offset = normalized.originalOffset(error.offset); error.length = end - error.offset;
    }
    normalized.restore(root);
    try { JSON5.parse(text); }
    catch (error) {
      if (!syntaxErrors.length) {
        const problem = error as { lineNumber?: number; columnNumber?: number };
        const lines = text.split("\n");
        const line = (problem.lineNumber ?? 1) - 1;
        const offset = lines.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0) + (problem.columnNumber ?? 1) - 1;
        syntaxErrors.push({ error: 1, offset: Math.min(offset, text.length), length: 1 });
      }
    }
  }
  return { file, root, schema: new Schema(catalog, { kind: file.kind, id: file.id }), syntaxErrors };
}

export function analyzeText(text: string, path: string, catalog: Catalog): (Analysis & { parsed: ParsedFile }) | undefined {
  const parsed = parseFile(text, path, catalog);
  if (!parsed) return undefined;
  return { ...analyze(parsed.root, parsed.schema), parsed };
}
