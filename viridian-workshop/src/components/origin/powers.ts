import { isObject } from '../../model/json'
import { entriesOf, type Entry, type Project } from '../../model/project'
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
