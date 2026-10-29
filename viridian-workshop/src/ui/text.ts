// turning minecraft text components and power references into something readable
import { builtins, translate } from '../catalog/builtins'
import { isObject, type Json } from '../model/json'
import { findById, type Project } from '../model/project'
import { resolveRef } from '../model/validate'

// best effort plain text of a text component
export function textToPlain(value: Json | undefined, stringIsKey = false): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return stringIsKey ? (translate(value) ?? value) : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((v) => textToPlain(v)).join('')
  let out = ''
  if (typeof value.text === 'string') out += value.text
  else if (typeof value.translate === 'string')
    out += translate(value.translate) ?? (typeof value.fallback === 'string' ? value.fallback : value.translate)
  else if (typeof value.keybind === 'string') out += `[${value.keybind}]`
  if (Array.isArray(value.extra)) out += value.extra.map((v) => textToPlain(v)).join('')
  return out
}

export interface PowerDisplay {
  id: string
  name: string
  description: string
  hidden: boolean
  source: 'pack' | 'builtin' | 'missing'
  path?: string
}

// name and description of a power as the origin screen would show it
export function powerDisplay(project: Project, ref: string, ownerNamespace: string): PowerDisplay {
  const id = resolveRef(ref, ownerNamespace)
  const [ns, path] = id.split(':')
  const entry = findById(project, 'power', id)
  const json = entry?.file.json ?? builtins.powers[id]
  const fallbackName = translate(`power.${ns}.${path}.name`)
  const fallbackDesc = translate(`power.${ns}.${path}.description`)
  if (!json || !isObject(json)) {
    return { id, name: fallbackName ?? path ?? ref, description: fallbackDesc ?? '', hidden: false, source: 'missing' }
  }
  return {
    id,
    // a plain string name on a power is a translation key, like apoli does
    name: json.name !== undefined ? textToPlain(json.name, true) : (fallbackName ?? humanPath(path)),
    description: json.description !== undefined ? textToPlain(json.description, true) : (fallbackDesc ?? ''),
    hidden: json.hidden === true,
    source: entry ? 'pack' : 'builtin',
    path: entry?.path,
  }
}

export function originDisplay(json: Json | undefined, id: string) {
  const [ns, path] = id.split(':')
  const obj = isObject(json) ? json : {}
  return {
    name: obj.name !== undefined ? textToPlain(obj.name) : (translate(`origin.${ns}.${path}.name`) ?? humanPath(path)),
    description:
      obj.description !== undefined
        ? textToPlain(obj.description)
        : (translate(`origin.${ns}.${path}.description`) ?? ''),
  }
}

export function humanPath(path = '') {
  const last = path.split('/').pop() ?? path
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function iconItem(icon: Json | undefined): string {
  if (typeof icon === 'string') return icon
  if (isObject(icon) && typeof icon.item === 'string') return icon.item
  return 'minecraft:air'
}
