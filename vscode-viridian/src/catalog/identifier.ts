// minecraft identifier parsing, plus calio's dynamic identifiers where `*` stands for the current file's id

export interface ParsedIdentifier {
  namespace: string;
  path: string;
}

export type IdentifierResult = { ok: true; id: string; parsed: ParsedIdentifier } | { ok: false; error: string };

const NAMESPACE = /^[a-z0-9_.-]*$/;
const PATH = /^[a-z0-9_.\-/]*$/;

// vanilla Identifier.parse, used for type ids: no namespace means minecraft
export function parseIdentifier(raw: string): IdentifierResult {
  const colon = raw.indexOf(":");
  const namespace = colon >= 0 ? raw.slice(0, colon) : "minecraft";
  const path = colon >= 0 ? raw.slice(colon + 1) : raw;
  return validate(raw, colon >= 0 && namespace === "" ? "minecraft" : namespace, path);
}

// calio's dynamic identifier: `*` in the namespace or path is replaced by the current file's namespace or path
export function parseDynamicIdentifier(raw: string, current?: string): IdentifierResult {
  // java's split drops trailing empty parts, so "abc:" is minecraft:abc
  const parts = raw.split(":");
  while (parts.length > 0 && parts.at(-1) === "") parts.pop();
  if (parts.length === 0) return { ok: false, error: `Identifier "${raw}" is empty.` };
  if (parts.length > 2) {
    return { ok: false, error: `Identifier "${raw}" must only have one ":" separating its namespace and path.` };
  }
  let namespace = parts.length === 1 ? "minecraft" : parts[0]!;
  let path = parts.length === 1 ? parts[0]! : parts[1]!;

  if (namespace.includes("*") || path.includes("*")) {
    if (!current) return { ok: false, error: `"*" can't be used in identifiers here.` };
    const self = splitId(current);
    namespace = namespace.replaceAll("*", self.namespace);
    path = path.replaceAll("*", self.path);
  }
  return validate(raw, namespace, path);
}

function validate(raw: string, namespace: string, path: string): IdentifierResult {
  if (!NAMESPACE.test(namespace)) {
    return { ok: false, error: `Non [a-z0-9_.-] character in namespace of identifier "${raw}".` };
  }
  if (!PATH.test(path)) {
    return { ok: false, error: `Non [a-z0-9/._-] character in path of identifier "${raw}".` };
  }
  return { ok: true, id: `${namespace}:${path}`, parsed: { namespace, path } };
}

export function splitId(id: string): ParsedIdentifier {
  const colon = id.indexOf(":");
  return colon >= 0 ? { namespace: id.slice(0, colon), path: id.slice(colon + 1) } : { namespace: "minecraft", path: id };
}
