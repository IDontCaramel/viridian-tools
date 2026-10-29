import { unzipSync } from "fflate";

// archive entries stay in memory and are never extracted to disk
export function readArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  let declared = 0;
  const entries = unzipSync(bytes, { filter: entry => {
    if (entry.originalSize > 32 * 1024 * 1024) throw new Error("Datapack zip entry exceeds the 32 MiB read limit.");
    declared += entry.originalSize;
    if (declared > 128 * 1024 * 1024) throw new Error("Datapack zip exceeds the 128 MiB read limit.");
    return true;
  } });
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith("/") || name.startsWith("/") || name.includes("\\") || name.split("/").some(p => p === ".." || p === ".")) continue;
    total += content.length;
    if (total > 128 * 1024 * 1024) throw new Error("Datapack zip exceeds the 128 MiB read limit.");
    files.set(name, content);
  }
  return files;
}
