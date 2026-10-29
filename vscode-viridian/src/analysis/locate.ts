// finds what the cursor is on: a property key or a value, and what the schema expects there

import { findNodeAtLocation, getLocation, type JSONPath, type Node } from "jsonc-parser";
import type { FieldSpec, TypeRef } from "../catalog/types.ts";
import { normalizeJson5 } from "./json5.ts";
import type { ObjectShape, Schema, SchemaType } from "./schema.ts";

export interface FieldContext {
  name: string;
  spec?: FieldSpec;
  // the object the field is in
  shape: ObjectShape;
  object: Node;
}

export type Located =
  | {
      at: "key";
      // the object a key is being written in
      object: Node;
      shape: ObjectShape;
      // the key under the cursor, if there is one
      key?: Node;
      name?: string;
    }
  | {
      at: "value";
      // the value under the cursor, missing when it isn't written yet
      node?: Node;
      type: SchemaType;
      field?: FieldContext;
    };

interface Step {
  node: Node | undefined;
  type: SchemaType | undefined;
  field?: FieldContext;
}

export function locate(text: string, root: Node | undefined, offset: number, schema: Schema): Located | undefined {
  if (!root) return undefined;
  const normalized = normalizeJson5(text);
  const location = getLocation(normalized.text, normalized.normalizedOffset(offset));
  const path = location.path;

  if (location.isAtPropertyKey) {
    const parent = walk(root, path.slice(0, -1), schema);
    if (!parent.node || !parent.type || parent.node.type !== "object") return undefined;
    const variant = schema.variant(parent.node, parent.type);
    const shape = variant ? schema.shape(parent.node, variant) : undefined;
    if (!shape) return undefined;
    const name = path.at(-1);
    const key = typeof name === "string" && name !== "" ? keyNode(parent.node, name) : undefined;
    return { at: "key", object: parent.node, shape, key, name: key ? (name as string) : undefined };
  }

  const step = walk(root, path, schema);
  if (!step.type) return undefined;
  const node = step.node && step.node.offset <= offset && offset <= step.node.offset + step.node.length ? step.node : undefined;
  return { at: "value", node, type: step.type, field: step.field };
}

// walks the path from the root, keeping track of the expected type
export function walk(root: Node, path: JSONPath, schema: Schema): Step {
  let step: Step = { node: root, type: schema.rootType() };
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]!;
    const { node, type } = step;
    if (!node || !type) return { node: undefined, type: undefined };
    const variant = schema.variant(node, type);
    if (!variant) return { node: undefined, type: undefined };

    if (typeof segment === "number") {
      const child = findNodeAtLocation(node, [segment]);
      if (variant.kind === "list") step = { node: child, type: schema.resolve(variant.of), field: step.field };
      else if (variant.kind === "weighted_list") step = { node: child, type: weightedEntry(variant.of), field: step.field };
      else return { node: undefined, type: undefined };
      continue;
    }

    const child = findNodeAtLocation(node, [segment]);
    if (variant.kind === "map") {
      step = { node: child, type: schema.resolve(variant.of) };
      continue;
    }
    const shape = schema.shape(node, variant);
    if (!shape) return { node: undefined, type: undefined };
    const field = schema.fieldType(shape, segment, child);
    step = {
      node: child,
      type: field.type,
      field: { name: segment, spec: field.spec, shape, object: node },
    };
  }
  return step;
}

function weightedEntry(of: TypeRef): SchemaType {
  return {
    kind: "object",
    fields: {
      element: { type: of, required: true, description: "The weighted value." },
      weight: { type: "int", required: true, description: "How likely this entry is to be picked." },
    },
  };
}

function keyNode(object: Node, name: string): Node | undefined {
  for (const property of object.children ?? []) {
    const key = property.children?.[0];
    if (key?.value === name) return key;
  }
  return undefined;
}

// the path from the root to a node, for hovers
export function pathOf(node: Node): JSONPath {
  const path: JSONPath = [];
  let current: Node | undefined = node;
  while (current?.parent) {
    const parent: Node = current.parent;
    if (parent.type === "property") {
      path.unshift(parent.children![0]!.value as string);
      current = parent.parent;
    } else if (parent.type === "array") {
      path.unshift(parent.children!.indexOf(current));
      current = parent;
    } else {
      current = parent;
    }
  }
  return path;
}
