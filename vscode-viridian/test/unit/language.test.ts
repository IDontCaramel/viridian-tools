import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { loadCatalog } from "../../src/catalog/load.ts";
import { analyzeText, parseFile } from "../../src/analysis/document.ts";
import { complete, objectSnippet } from "../../src/analysis/complete.ts";
import { hover } from "../../src/analysis/hover.ts";
import { locate } from "../../src/analysis/locate.ts";
import { DatapackIndex } from "../../src/datapack/index.ts";
import { readArchive } from "../../src/datapack/archive.ts";
import { classifyPath, pathFor } from "../../src/datapack/paths.ts";
import { scaffolds, initialDocument } from "../../src/features/scaffolds.ts";

const catalog = loadCatalog();
const powerPath = "/pack/data/demo/powers/test.json";
const originPath = "/pack/data/demo/origins/test.json";
const inspect = (value: unknown, path = powerPath) => analyzeText(JSON.stringify(value), path, catalog)!;
const codes = (value: unknown, path = powerPath) => inspect(value, path).problems.map(p => p.code);

test("diagnostic codes distinguish rejected values, unsupported types and coercions", () => {
  assert.deepEqual(codes({ type: "origins:simple" }), []);
  assert.deepEqual(codes({ type: "origins:dummy", ignored: 5 }), ["unknown-field"]);
  const unknown = inspect({ type: "simple" }).problems;
  assert.equal(unknown[0]?.code, "unknown-type"); assert.equal(unknown[0]?.severity, "warning");
  assert.ok(codes({}).includes("missing-field"));
  assert.ok(codes({ type: "apoli:resource", min: {}, max: 5 }).includes("wrong-type"));
  assert.ok(codes({ type: "apoli:resource", min: "5", max: 10.5 }).includes("coerced"));
  assert.ok(codes({ type: "apoli:toggle", active_by_default: [] }).includes("wrong-type"));
  assert.ok(codes({ powers: ["Bad:Id"] }, originPath).includes("invalid-identifier"));
  assert.ok(codes({ impact: "huge" }, originPath).includes("invalid-value"));
  assert.ok(codes({ type: "apoli:dummy", condition: { type: "viridian:unknown_extension" } }).includes("unknown-type"));
});

test("dynamic ids, aliases, sub-powers and single-value lists match the mod", () => {
  assert.deepEqual(inspect({ powers: "*:flight" }, originPath).references.map(r => r.id), ["demo:flight"]);
  const result = inspect({ type: "origins:multiple", child: { type: "origins:simple" }, $metadata: 1 });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.definitions.map(d => d.id), ["demo:test", "demo:test_child"]);
  assert.ok(codes({ type: "apoli:multiple", child: 1 }).includes("wrong-type"));
  assert.ok(codes({ type: "apoli:multiple", child: { type: "apoli:multiple" } }).includes("wrong-type"));
  for (const impact of [0, 1, 2, 3, "LOW"]) assert.deepEqual(codes({ impact }, originPath), []);
  const comparison = inspect({ type: "apoli:dummy", condition: { type: "apoli:food_level", comparison: ">=", compare_to: 10 } });
  assert.deepEqual(comparison.problems, []);
});

test("completion locates nested keys, type ids, enum values and references", () => {
  const sources = { ids: () => ["demo:flight"] };
  function candidates(text: string, path = powerPath) {
    const offset = text.indexOf("|"); text = text.replace("|", "");
    const parsed = parseFile(text, path, catalog)!;
    return complete(text, parsed.root, offset, parsed.schema, sources);
  }
  assert.ok(candidates('{"type":"apoli:resource", |}').some(c => c.label === "min"));
  assert.ok(!candidates('{"type":"apoli:resource", "min":0, |}').some(c => c.label === "min"));
  assert.ok(candidates('{"type":"apoli:|"}').some(c => c.label === "apoli:resource"));
  assert.ok(candidates('{"impact":"|"}', originPath).some(c => c.label === "low"));
  assert.ok(candidates('{"powers":["|"]}', originPath).some(c => c.label === "demo:flight"));
  assert.ok(candidates('{"type":"apoli:action_on_key_press", "entity_action": |}').some(c => c.label === "apoli:nothing" && c.kind === "snippet"));
  const text = '{"type":"apoli:resource", "min":0,"max":10}';
  const parsed = parseFile(text, powerPath, catalog)!;
  assert.equal(locate(text, parsed.root, text.indexOf('"min"') + 2, parsed.schema)?.at, "key");
});

test("hover documents fields, aliases, nested types, enums and definitions", () => {
  function docs(text: string, token: string, path = powerPath) {
    const parsed = parseFile(text, path, catalog)!;
    return hover(parsed.root, text.indexOf(token) + 1, parsed.schema, () => ["/pack/data/demo/powers/flight.json"])?.markdown ?? "";
  }
  assert.match(docs('{"type":"origins:simple"}', "origins:simple"), /resolves to `apoli:dummy`/);
  assert.match(docs('{"type":"apoli:resource","min":0,"max":5}', '"min"'), /required/);
  assert.match(docs('{"impact":"low"}', "low", originPath), /Allowed values/);
  assert.match(docs('{"powers":["demo:flight"]}', "demo:flight", originPath), /Defined in/);
  assert.match(docs('{"type":"apoli:dummy","condition":{"type":"apoli:on_fire"}}', "apoli:on_fire"), /Entity condition/);
});

test("index updates and removes references and supports merged layers and builtins", () => {
  const index = new DatapackIndex(catalog);
  index.update(powerPath, '{"type":"apoli:multiple","part":{"type":"apoli:dummy"}}');
  index.update(originPath, '{"powers":["demo:test_part","demo:missing","origins:water_breathing"]}');
  assert.equal(index.definitions("power", "demo:test_part").length, 1);
  assert.equal(index.references("power", "demo:test_part").length, 1);
  assert.equal(index.missingReferences(originPath).length, 1);
  assert.deepEqual(index.missingReferences(originPath, "off"), []);
  assert.ok(index.ids("power").includes("demo:test_part"));
  assert.ok(index.files.get(originPath)?.lineOffsets.length);
  index.update("/a/data/demo/origin_layers/main.json", '{"origins":[]}');
  index.update("/b/data/demo/origin_layers/main.json", '{"origins":[]}');
  assert.equal(index.definitions("origin_layer", "demo:main").length, 2);
  index.remove(powerPath); assert.equal(index.missingReferences(originPath).length, 2);
});

test("every scaffold produces a valid document without changing existing text", () => {
  for (const kind of ["power", "origin", "origin_layer"] as const) {
    for (const scaffold of scaffolds(kind)) {
      const text = scaffold.insertText.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d+/g, "");
      assert.deepEqual(analyzeText(text, `/pack/${pathFor(kind, "demo:example")}`, catalog)?.problems, [], scaffold.label);
    }
    assert.doesNotThrow(() => JSON.parse(initialDocument(kind)));
  }
  const text = '{ "custom": {"b":1,"a":2}, "type":"apoli:dummy" }\n';
  const index = new DatapackIndex(catalog); index.update(powerPath, text);
  assert.equal(index.files.get(powerPath)?.text, text);
  const snippet = objectSnippet("apoli:resource", catalog.entries("power_type").get("apoli:resource")!, parseFile("{}", powerPath, catalog)!.schema);
  assert.match(snippet, /"min": \$\{1:0\}/); assert.match(snippet, /"max": \$\{2:0\}/);
});

test("archives support nested packs without unsafe extraction paths", () => {
  const bytes = zipSync({ "nested/pack.mcmeta": strToU8("{}"), "nested/data/demo/powers/a.json": strToU8('{"type":"apoli:dummy"}'), "../bad": strToU8("bad") });
  const files = readArchive(bytes);
  assert.ok(files.has("nested/pack.mcmeta")); assert.ok(!files.has("../bad"));
  assert.equal(classifyPath("/nested/data/demo/powers/a.json")?.packRoot, "/nested");
  assert.equal(classifyPath("/data/demo/global_powers/a.jsonc"), undefined);
  assert.equal(pathFor("power", "demo:nested/test"), "data/demo/powers/nested/test.json");
});

const resources = fileURLToPath(new URL("../../../../re-origin-26.3/src/main/resources/data/origins", import.meta.url));
test("all built-in mod datapack files validate cleanly", { skip: !existsSync(resources) }, () => {
  const files = readdirSync(resources, { recursive: true }).filter((path): path is string => typeof path === "string" && /\.json$/.test(path));
  let count = 0;
  for (const path of files) {
    const result = analyzeText(readFileSync(join(resources, path), "utf8"), `/pack/data/origins/${path}`, catalog);
    if (!result) continue;
    assert.deepEqual(result.problems, [], path); count++;
  }
  assert.ok(count >= 70, `checked ${count} files`);
});

test("json5 syntax keeps original offsets for diagnostics, hover and completion", () => {
  const text = "// notes\n{type: 'apoli:resource', min: 0x10, max: +100, name: 'a\\\nb', extra: true,}";
  const path = powerPath.replace(".json", ".json5");
  const result = analyzeText(text, path, catalog)!;
  assert.deepEqual(result.parsed.syntaxErrors, []);
  assert.deepEqual(result.problems.map(p => p.code), ["unknown-field"]);
  assert.equal(text.slice(result.problems[0]!.offset, result.problems[0]!.offset + result.problems[0]!.length), "extra");
  const documentation = hover(result.parsed.root, text.indexOf("min") + 1, result.parsed.schema)!;
  assert.match(documentation.markdown, /required/); assert.equal(documentation.offset, text.indexOf("min"));
  const offset = text.indexOf("apoli:resource") + 7;
  assert.ok(complete(text, result.parsed.root, offset, result.parsed.schema, { ids: () => [] }).some(c => c.label === "apoli:resource"));
  const unquoted = "{type: 'apoli:resource', }";
  const parsed = parseFile(unquoted, path, catalog)!;
  assert.ok(complete(unquoted, parsed.root, unquoted.indexOf("}"), parsed.schema, { ids: () => [] }).some(c => c.label === "min"));
  assert.ok(parseFile('{"type":"apoli:dummy",}', powerPath, catalog)!.syntaxErrors.length);
  assert.equal(parseFile('{/* comment */"type":"apoli:dummy",}', path.replace(".json5", ".jsonc"), catalog)!.syntaxErrors.length, 0);
});

test("gson scalar arrays, integer strings and weighted actions follow the mod readers", () => {
  const scalar = inspect({ type: "apoli:resource", min: [0], max: 10 });
  assert.deepEqual(scalar.problems.map(p => p.code), ["coerced"]);
  assert.ok(codes({ type: "apoli:resource", min: "1.5", max: 10 }).includes("wrong-type"));
  assert.deepEqual(codes({ impact: 1.5 }, originPath), ["coerced"]);
  const action = (actions: unknown) => ({ type: "apoli:action_on_key_press", entity_action: { type: "apoli:choice", actions } });
  assert.deepEqual(codes(action([{ weight: 1, element: { type: "apoli:nothing" } }])), []);
  assert.deepEqual(codes(action(false)), ["coerced"]);
  assert.ok(codes(action([{ weight: {} }])).includes("wrong-type"));
  assert.ok(codes(action([{ weight: 1 }])).includes("missing-field"));
});
