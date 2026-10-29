import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCatalog } from "../../src/catalog/load.ts";
import type { FieldSpec, TypeRef } from "../../src/catalog/types.ts";
import { DOCUMENT_KINDS, REGISTRY_KINDS } from "../../src/catalog/types.ts";

const catalog = loadCatalog();

// every named type a ref mentions, recursively
function namedTypes(ref: TypeRef, out = new Set<string>()): Set<string> {
  if (typeof ref === "string") {
    const list = ref.match(/^list<(.+)>$/);
    if (list) return namedTypes(list[1]!, out);
    if (out.has(ref)) return out;
    out.add(ref);
    const resolved = catalog.dataType(ref);
    if (resolved.kind !== "any" || ref === "any") namedTypes(resolved, out);
    return out;
  }
  if ("of" in ref) for (const inner of Array.isArray(ref.of) ? ref.of : [ref.of]) namedTypes(inner, out);
  if ("fields" in ref) for (const field of Object.values(ref.fields)) namedTypes(field.type, out);
  return out;
}

function allFields(): Array<[string, string, FieldSpec]> {
  const fields: Array<[string, string, FieldSpec]> = [];
  for (const kind of REGISTRY_KINDS) {
    for (const [id, entry] of catalog.entries(kind)) {
      for (const [name, spec] of Object.entries(entry.fields)) fields.push([`${kind} ${id}`, name, spec]);
    }
  }
  for (const kind of DOCUMENT_KINDS) {
    for (const [name, spec] of Object.entries(catalog.document(kind).fields)) fields.push([`document ${kind}`, name, spec]);
  }
  return fields;
}

describe("catalog", () => {
  it("has every registry", () => {
    for (const kind of REGISTRY_KINDS) assert.ok(catalog.entries(kind).size > 0, kind);
  });

  it("only refers to types it defines", () => {
    const missing: string[] = [];
    for (const [owner, name, spec] of allFields()) {
      for (const type of namedTypes(spec.type)) {
        if (!catalog.hasDataType(type)) missing.push(`${owner}.${name}: ${type}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it("has enum defaults that are enum values", () => {
    const wrong: string[] = [];
    for (const [owner, name, spec] of allFields()) {
      const type = catalog.dataType(spec.type);
      if (type.kind === "enum" && typeof spec.default === "string" && !type.values.includes(spec.default)) {
        wrong.push(`${owner}.${name}: ${spec.default}`);
      }
    }
    assert.deepEqual(wrong, []);
  });

  it("resolves aliases like the mod", () => {
    assert.equal(catalog.resolveTypeId("power_type", "origins:simple").resolved, "apoli:dummy");
    assert.equal(catalog.resolveTypeId("power_type", "apoli:active_self").resolved, "apoli:action_on_key_press");
    assert.equal(catalog.resolveTypeId("power_type", "origins:origins_callback")?.resolved, undefined);
    assert.equal(catalog.resolveTypeId("power_type", "origins:action_on_callback").resolved, "origins:action_on_callback");
    assert.equal(catalog.resolveTypeId("entity_condition", "origins:on_fire").resolved, "apoli:on_fire");
    // no namespace means minecraft, which isn't registered
    assert.equal(catalog.resolveTypeId("power_type", "simple").resolved, undefined);
    // badge types don't fall back to apoli
    assert.equal(catalog.resolveTypeId("badge_type", "apoli:sprite").resolved, undefined);
  });

  it("suggests close type ids", () => {
    assert.ok(catalog.suggestTypeIds("power_type", "apoli:atribute").includes("apoli:attribute"));
  });
});
