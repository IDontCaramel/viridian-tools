// regenerates catalog/generated.json from the mod's source
//
//   npm run generate                       uses ../../re-origin-26.3
//   npm run generate -- --mod <path>       uses another checkout
//
// the output is committed, so building the extension doesn't need the mod

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuiltinIds, GeneratedCatalog, RegistryKind, TypeEntry } from "../src/catalog/types.ts";
import { Extractor } from "./java/extract.ts";
import { parseFile } from "./java/model.ts";
import { allMinecraftEnums } from "./java/types.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modArg = process.argv.indexOf("--mod");
const modDir = resolve(modArg >= 0 ? process.argv[modArg + 1]! : join(root, "../../re-origin-26.3"));
const javaRoot = join(modDir, "src/main/java/net/caramel/viridian");
const dataRoot = join(modDir, "src/main/resources/data");

function walk(dir: string, accept: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, accept);
    return accept(path) ? [path] : [];
  });
}

function readJava(): ReturnType<typeof parseFile>[] {
  // mixins never register anything and use syntax the model doesn't need to know
  const paths = walk(javaRoot, (path) => path.endsWith(".java") && !path.includes("/mixin/"));
  return paths.map((path) => parseFile(relative(javaRoot, path), readFileSync(path, "utf8")));
}

function readBuiltinIds(resolveMultiple: (type: string) => boolean): BuiltinIds {
  const ids: BuiltinIds = { powers: [], origins: [], layers: [] };
  const folders: Array<[keyof BuiltinIds, string]> = [
    ["powers", "powers"],
    ["origins", "origins"],
    ["layers", "origin_layers"],
  ];
  for (const namespace of readdirSync(dataRoot)) {
    for (const [key, folder] of folders) {
      const dir = join(dataRoot, namespace, folder);
      if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
      for (const path of walk(dir, (p) => p.endsWith(".json"))) {
        const id = `${namespace}:${relative(dir, path).replace(/\.json$/, "")}`;
        ids[key].push(id);
        if (key !== "powers") continue;
        const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        if (typeof json.type === "string" && resolveMultiple(json.type)) {
          for (const [field, value] of Object.entries(json)) {
            if (value && typeof value === "object" && !Array.isArray(value)) ids.powers.push(`${id}_${field}`);
          }
        }
      }
    }
  }
  for (const list of Object.values(ids)) list.sort();
  return ids;
}

function sortEntries(entries: Record<string, TypeEntry>): Record<string, TypeEntry> {
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
}

const extracted = new Extractor(readJava()).run();

const powerAliases = extracted.pathAliases.power_type ?? {};
const isMultiple = (type: string) => {
  const [ns, path] = type.includes(":") ? type.split(":") : ["minecraft", type];
  const namespace = extracted.namespaceAliases[ns!] ?? ns;
  return namespace === "apoli" && (powerAliases[path!] ?? path) === "multiple";
};

const registries: GeneratedCatalog["registries"] = {};
for (const [kind, entries] of Object.entries(extracted.registries)) {
  registries[kind as RegistryKind] = sortEntries(entries);
}

const catalog: GeneratedCatalog = {
  registries,
  pathAliases: extracted.pathAliases,
  namespaceAliases: extracted.namespaceAliases,
  dataTypes: Object.fromEntries(
    Object.entries({ ...allMinecraftEnums(), ...extracted.dataTypes }).sort(([a], [b]) => a.localeCompare(b)),
  ),
  builtin: readBuiltinIds(isMultiple),
};

writeFileSync(join(root, "catalog/generated.json"), JSON.stringify(catalog, null, 2) + "\n");

const counts = Object.entries(registries).map(([kind, entries]) => `${kind}: ${Object.keys(entries!).length}`);
console.log(`generated catalog from ${modDir}`);
console.log(counts.join("\n"));
if (extracted.warnings.length > 0) {
  console.log(`\n${extracted.warnings.length} things the generator couldn't resolve (fix them in catalog/overrides.json):`);
  for (const warning of [...new Set(extracted.warnings)].sort()) console.log(`  ${warning}`);
}
