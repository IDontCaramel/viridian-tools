import type { Catalog } from "../catalog/catalog.ts";
import type { FieldSpec, RegistryKind, TypeEntry } from "../catalog/types.ts";
import { fieldSummary } from "./analyze.ts";

export function describeField(name: string, spec: FieldSpec, catalog: Catalog): string {
  return [`\`${name}: ${catalog.typeName(spec.type)}\``, fieldSummary(spec), spec.description,
    spec.ignored ? "Accepted but ignored by the mod." : undefined].filter(Boolean).join("\n\n");
}

export function describeEntry(id: string, entry: TypeEntry, registry: RegistryKind, catalog: Catalog, written = id): string {
  const parts = [`\`${id}\` · ${catalog.registryInfo(registry).label}`];
  if (id.startsWith("viridian:")) parts.push("**Viridian only. Won't load on the original Origins.**");
  if (written !== id) parts.push(`\`${written}\` resolves to \`${id}\`.`);
  if (entry.description) parts.push(entry.description);
  const rows = Object.entries(entry.fields).map(([name, spec]) =>
    `| ${name} | ${catalog.typeName(spec.type).replaceAll("|", "\\|")} | ${fieldSummary(spec).replaceAll("|", "\\|")} |`);
  if (rows.length) parts.push(["| Field | Type | Required/default |", "| --- | --- | --- |", ...rows].join("\n"));
  return parts.join("\n\n");
}
