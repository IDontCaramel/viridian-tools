// immutable edits on json values by path, keeping key order intact:
// an existing key stays where it is, a new key goes at the end
import { isObject, type Json } from './json'

export type Path = (string | number)[]

export function getIn(value: Json | undefined, path: Path): Json | undefined {
  let cur: Json | undefined = value
  for (const key of path) {
    if (cur === undefined || cur === null) return undefined
    if (Array.isArray(cur) && typeof key === 'number') cur = cur[key]
    else if (isObject(cur) && typeof key === 'string') cur = cur[key]
    else return undefined
  }
  return cur
}

export function setIn(value: Json | undefined, path: Path, next: Json): Json {
  if (path.length === 0) return next
  const [key, ...rest] = path
  if (typeof key === 'number') {
    const arr = Array.isArray(value) ? [...value] : []
    arr[key] = setIn(arr[key], rest, next)
    return arr
  }
  const obj = isObject(value) ? value : {}
  return { ...obj, [key]: setIn(obj[key], rest, next) }
}

export function deleteIn(value: Json | undefined, path: Path): Json | undefined {
  if (path.length === 0) return undefined
  const [key, ...rest] = path
  if (rest.length) {
    const child = getIn(value, [key])
    if (child === undefined) return value
    const nextChild = deleteIn(child, rest)
    return nextChild === undefined ? deleteIn(value, [key]) : setIn(value, [key], nextChild)
  }
  if (Array.isArray(value) && typeof key === 'number') return value.filter((_, i) => i !== key)
  if (isObject(value) && typeof key === 'string') {
    if (!(key in value)) return value
    const copy: { [k: string]: Json } = {}
    for (const k of Object.keys(value)) if (k !== key) copy[k] = value[k]
    return copy
  }
  return value
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export function insertItem<T>(arr: T[], index: number, item: T): T[] {
  const copy = [...arr]
  copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item)
  return copy
}

// renames a key in place so it keeps its position
export function renameKey(obj: { [k: string]: Json }, from: string, to: string): { [k: string]: Json } {
  const copy: { [k: string]: Json } = {}
  for (const k of Object.keys(obj)) copy[k === from ? to : k] = obj[k]
  return copy
}

export function pathKey(path: Path) {
  return path.map((p) => String(p).replace(/[/~]/g, (c) => (c === '~' ? '~0' : '~1'))).join('/')
}
