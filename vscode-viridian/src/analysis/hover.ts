import { findNodeAtOffset, type Node } from "jsonc-parser";
import { parseDynamicIdentifier } from "../catalog/identifier.ts";
import type { ReferenceKind } from "./analyze.ts";
import { describeEntry, describeField } from "./describe.ts";
import { pathOf, walk } from "./locate.ts";
import type { Schema } from "./schema.ts";

export interface HoverInfo { markdown: string; offset: number; length: number }
export function hover(root: Node | undefined, offset: number, schema: Schema,
  lookup: (kind: ReferenceKind, id: string) => string[] = () => []): HoverInfo | undefined {
  if (!root) return undefined;
  const node = findNodeAtOffset(root, offset);
  if (!node) return undefined;
  const step = walk(root, pathOf(node), schema);
  const field = step.field;
  let markdown: string | undefined;
  if (node.parent?.type === "property" && node.parent.children?.[0] === node) {
    if (field?.spec) markdown = describeField(field.name, field.spec, schema.catalog);
  } else if (field?.name === "type" && field.shape.typed?.resolved?.entry) {
    const { registry, resolved, raw } = field.shape.typed;
    markdown = describeEntry(resolved!.resolved!, resolved!.entry!, registry, schema.catalog, raw);
  } else if (step.type) {
    const type = schema.variant(node, step.type);
    if (type?.kind === "enum") markdown = `Allowed values: ${type.values.map(v => `\`${type.namespace ? `${type.namespace}:` : ""}${v}\``).join(", ")}.`;
    if (type?.kind === "identifier" && node.type === "string" && ["power", "origin", "origin_layer", "badge"].includes(type.registry ?? "")) {
      const parsed = parseDynamicIdentifier(node.value as string, schema.file.id);
      if (parsed.ok) {
        const locations = lookup(type.registry as ReferenceKind, parsed.id);
        markdown = `\`${parsed.id}\`\n\n${locations.length ? locations.map(p => `Defined in \`${p}\`.`).join("\n\n") : "No definition found in the indexed datapacks."}`;
      }
    }
    markdown ??= field?.spec ? describeField(field.name, field.spec, schema.catalog) : undefined;
  }
  return markdown ? { markdown, offset: node.offset, length: node.length } : undefined;
}
