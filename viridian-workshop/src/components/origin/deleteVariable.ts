import { dataType, isCategory, resolveType, type FieldKind } from '../../catalog/catalog'
import { isObject, type Json } from '../../model/json'
import { classify, pathFor, type Project } from '../../model/project'
import { resolveRef } from '../../model/validate'

// remove references through catalog fields so text and unknown settings stay intact
export function deleteVariableBatch(project: Project, id: string): Record<string, Json | null> {
  const files: Record<string, Json | null> = { [pathFor(project, 'power', id)]: null }
  for (const [path, file] of Object.entries(project.files)) {
    if (path in files || file.json === undefined) continue
    const info = classify(path, project.root)
    if (!['power', 'origin', 'layer'].includes(info.kind)) continue
    const ns = info.namespace ?? project.namespace
    const matches = (v: Json) => typeof v === 'string' && resolveRef(v, ns) === id
    const visit = (value: Json, field: FieldKind, name = ''): Json | undefined => {
      if (field.kind === 'identifier' && /(^|_)(power|resource|powers)$/.test(name) && matches(value)) return undefined
      if (field.kind === 'list' && field.of) {
        if (!Array.isArray(value)) return visit(value, field.of, name)
        const next = value.map((v) => visit(v, field.of!, name)).filter((v): v is Json => v !== undefined)
        return next.length === value.length && next.every((v, i) => v === value[i]) ? value : next
      }
      if (!isObject(value)) return value
      const spec = isCategory(field.kind) ? resolveType(field.kind, value.type) : undefined
      const fields = spec?.fields ?? field.fields ?? dataType(field.kind)?.fields
      if (!fields) return value
      // a block whose required input is this variable has no meaning after deletion
      if (spec && field.kind !== 'power_type' && fields.some((f) => f.required && f.kind === 'identifier' && /(^|_)(power|resource|powers)$/.test(f.name) && matches(value[f.name]))) return undefined
      let next = value
      for (const f of fields) {
        if (!(f.name in value)) continue
        let child = visit(value[f.name], f, f.name)
        if (child === undefined && f.required && isCategory(f.kind)) {
          child = f.kind.endsWith('_action') ? { type: 'apoli:nothing' } : { type: 'apoli:constant', value: true }
        }
        if (child === value[f.name]) continue
        if (next === value) next = { ...value }
        if (child === undefined) delete next[f.name]
        else next[f.name] = child
      }
      if (spec?.id === 'apoli:multiple') {
        for (const [key, child] of Object.entries(value)) {
          if (!isObject(child) || !('type' in child)) continue
          const edited = visit(child, { kind: 'power_type' })
          if (edited === child) continue
          if (next === value) next = { ...value }
          if (edited !== undefined) next[key] = edited
        }
      }
      return next
    }
    const kind = info.kind === 'power' ? 'power_type' : info.kind === 'origin' ? 'origin' : 'layer'
    let next = visit(file.json, { kind })
    // origin grants are references too
    if (info.kind === 'origin' && isObject(next) && Array.isArray(next.powers)) {
      const powers = next.powers.filter((v) => !matches(v))
      if (powers.length !== next.powers.length) next = { ...next, powers }
    }
    if (next !== file.json && next !== undefined) files[path] = next
  }
  return files
}
