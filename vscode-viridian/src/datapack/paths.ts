// which datapack file a path is: data/<namespace>/<folder>/<path>.json

import type { DocumentKind } from "../catalog/types.ts";

export interface DatapackFile {
  kind: DocumentKind;
  // the id the mod gives the file, e.g. origins:fall_immunity
  id: string;
  // folder that holds data/, normally the one with pack.mcmeta
  packRoot: string;
}

export const FOLDERS: Record<string, DocumentKind> = {
  powers: "power",
  origins: "origin",
  origin_layers: "origin_layer",
  badges: "badge",
  global_powers: "global_power_set",
};

export const FOLDER_OF: Record<DocumentKind, string> = Object.fromEntries(
  Object.entries(FOLDERS).map(([folder, kind]) => [kind, folder]),
) as Record<DocumentKind, string>;

// calio's multi json loader also reads .json5 and .jsonc, global power sets are .json only
const EXTENSION = /\.(json|jsonc|json5)$/;

export function classifyPath(path: string): DatapackFile | undefined {
  const parts = path.replaceAll("\\", "/").split("/");
  // the last data/ wins, so a pack inside a folder called data still works
  for (let i = parts.length - 4; i >= 0; i--) {
    if (parts[i] !== "data") continue;
    const namespace = parts[i + 1]!;
    const kind = FOLDERS[parts[i + 2]!];
    const rest = parts.slice(i + 3).join("/");
    if (!kind || !EXTENSION.test(rest)) continue;
    if (kind === "global_power_set" && !rest.endsWith(".json")) continue;
    return {
      kind,
      id: `${namespace}:${rest.replace(EXTENSION, "")}`,
      packRoot: parts.slice(0, i).join("/"),
    };
  }
  return undefined;
}

// where a file with this id goes, relative to the pack root
export function pathFor(kind: DocumentKind, id: string): string {
  const colon = id.indexOf(":");
  const namespace = colon >= 0 ? id.slice(0, colon) : "minecraft";
  return `data/${namespace}/${FOLDER_OF[kind]}/${id.slice(colon + 1)}.json`;
}
