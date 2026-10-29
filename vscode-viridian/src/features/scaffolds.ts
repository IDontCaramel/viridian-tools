import entries from "../../snippets/scaffolds.json" with { type: "json" };
import type { DocumentKind } from "../catalog/types.ts";
import type { Candidate } from "../analysis/complete.ts";

export function scaffolds(kind: DocumentKind): Candidate[] {
  return Object.values(entries).filter(entry => entry.kind === kind).map(entry => ({
    label: entry.label, kind: "snippet", insertText: entry.body.join("\n"), detail: "Viridian datapack scaffold",
  }));
}
export function initialDocument(kind: DocumentKind): string {
  return `${scaffolds(kind)[0]?.insertText.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d+/g, "") ?? "{}"}\n`;
}
