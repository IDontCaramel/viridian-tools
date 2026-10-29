import { resolveType } from '../../catalog/catalog'
import { isObject, type Json } from '../../model/json'
import { entriesOf, pathFor, type Entry, type Project } from '../../model/project'
import { resolveRef } from '../../model/validate'

// resolved ids of the powers each origin grants, keyed by origin file path
export function grantedPowers(project: Project): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const origin of entriesOf(project, 'origin')) {
    const json = origin.file.json
    const refs = isObject(json) && Array.isArray(json.powers) ? json.powers : []
    out.set(
      origin.path,
      new Set(refs.filter((r): r is string => typeof r === 'string').map((r) => resolveRef(r, origin.info.namespace!))),
    )
  }
  return out
}

export function unusedPowers(project: Project): Entry[] {
  const granted = new Set([...grantedPowers(project).values()].flatMap((ids) => [...ids]))
  return entriesOf(project, 'power').filter((e) => !granted.has(e.info.id!))
}

export type VariableKind = 'resource' | 'cooldown'

// resource and cooldown powers act like scratch variables
export function variableKind(json: Json | undefined): VariableKind | null {
  const id = isObject(json) ? resolveType('power_type', json.type)?.id : undefined
  return id === 'apoli:resource' ? 'resource' : id === 'apoli:cooldown' ? 'cooldown' : null
}

function collectStrings(json: Json | undefined, out: Set<string>) {
  if (typeof json === 'string') out.add(json)
  else if (Array.isArray(json)) for (const v of json) collectStrings(v, out)
  else if (isObject(json)) for (const v of Object.values(json)) collectStrings(v, out)
}

// ids of the pack's resource and cooldown powers that this power's json points at, in order of appearance
export function variablesUsedBy(project: Project, json: Json | undefined, namespace: string): string[] {
  const strings = new Set<string>()
  collectStrings(json, strings)
  const out: string[] = []
  for (const s of strings) {
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$|^[a-z0-9_./-]+$/.test(s)) continue
    const id = resolveRef(s, namespace)
    if (out.includes(id)) continue
    if (variableKind(project.files[pathFor(project, 'power', id)]?.json)) out.push(id)
  }
  return out
}

// hidden variables granted by an origin that one of its other powers uses, they show inside that power
// instead of as their own row. maps helper id to the id of the power it is shown under
export function helperOwners(project: Project, originNamespace: string, refs: Json[]): Map<string, string> {
  const ids = refs.filter((r): r is string => typeof r === 'string').map((r) => resolveRef(r, originNamespace))
  const out = new Map<string, string>()
  const helper = (id: string) => {
    const json = project.files[pathFor(project, 'power', id)]?.json
    return variableKind(json) !== null && isObject(json) && json.hidden === true
  }
  for (const id of ids) {
    if (helper(id)) continue
    const file = project.files[pathFor(project, 'power', id)]
    if (!file) continue
    for (const v of variablesUsedBy(project, file.json, id.split(':')[0]))
      if (ids.includes(v) && helper(v) && !out.has(v)) out.set(v, id)
  }
  return out
}

// true when any file other than the skipped ones mentions this power id
export function isReferenced(project: Project, id: string, skip: Set<string>): boolean {
  for (const [path, file] of Object.entries(project.files)) {
    if (skip.has(path) || file.json === undefined) continue
    const ns = /\/data\/([^/]+)\/|^data\/([^/]+)\//.exec(path)
    const owner = ns?.[1] ?? ns?.[2] ?? project.namespace
    const strings = new Set<string>()
    collectStrings(file.json, strings)
    for (const s of strings) if (s === id || (!s.includes(':') && resolveRef(s, owner) === id)) return true
  }
  return false
}

// removing a power from an origin also takes its helper variables along, and deletes power files
// nothing else in the pack still points at. returns the batch for a single undo step
export function removalBatch(
  project: Project,
  originPath: string,
  originNamespace: string,
  powers: Json[],
  index: number,
): { files: Record<string, Json | null>; deleted: string[] } {
  const owners = helperOwners(project, originNamespace, powers)
  const removedRef = powers[index]
  const removedId = typeof removedRef === 'string' ? resolveRef(removedRef, originNamespace) : null
  const helpers = new Set([...owners].filter(([, owner]) => owner === removedId).map(([h]) => h))
  // a helper another remaining power also uses stays
  const remaining = powers.filter((r, i) => {
    if (i === index) return false
    return !(typeof r === 'string' && helpers.has(resolveRef(r, originNamespace)))
  })
  for (const r of remaining) {
    if (typeof r !== 'string') continue
    const json = project.files[pathFor(project, 'power', resolveRef(r, originNamespace))]?.json
    for (const v of variablesUsedBy(project, json, originNamespace)) helpers.delete(v)
  }
  const kept = powers.filter((r, i) => {
    if (i === index) return false
    return !(typeof r === 'string' && helpers.has(resolveRef(r, originNamespace)))
  })
  const origin = project.files[originPath]?.json
  const files: Record<string, Json | null> = {
    [originPath]: isObject(origin) ? { ...origin, powers: kept } : origin ?? {},
  }
  const next: Project = { ...project, files: { ...project.files } }
  next.files[originPath] = { ...project.files[originPath], json: files[originPath]! }
  const deleted: string[] = []
  const del = (id: string, skip: string[]) => {
    const path = pathFor(project, 'power', id)
    if (!project.files[path] || isReferenced(next, id, new Set([path, ...skip]))) return false
    files[path] = null
    deleted.push(id)
    return true
  }
  // helpers only go when the power that used them is gone too
  const helperPaths = [...helpers].map((h) => pathFor(project, 'power', h))
  if (removedId && del(removedId, [])) {
    const removedPath = pathFor(project, 'power', removedId)
    for (const h of helpers) del(h, [removedPath, ...helperPaths])
  }
  return { files, deleted }
}
