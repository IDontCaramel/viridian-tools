// the editor model: a datapack as a map of files
// json files keep their original bytes until edited, so export writes them back untouched
import { patchJson } from './patch'
import { DEFAULT_FORMAT, jsonSyntax, parseJson, printJson, type Json, type TextFormat } from './json'

export type FileKind = 'origin' | 'layer' | 'power' | 'meta' | 'other'

export interface PackFile {
  path: string
  // bytes as imported, used for export while the file is unchanged
  original?: Uint8Array
  // current json for origin, layer, power and pack.mcmeta files
  json?: Json
  // set when the text could not be parsed, the file is then only editable as text
  text?: string
  parseError?: string
  // json that the mod would reject even though we could read it (comments in a .json file)
  loadWarning?: string
  hadComments?: boolean
  format: TextFormat
  dirty: boolean
}

export interface Project {
  id: string
  name: string
  // folder inside the zip that holds pack.mcmeta, usually empty
  root: string
  // namespace used for new files
  namespace: string
  files: Record<string, PackFile>
  createdAt: number
  updatedAt: number
}

export interface FileInfo {
  kind: FileKind
  namespace?: string
  // resource id like my_pack:fire_breath, without the extension
  id?: string
}

const DIRS: Record<string, FileKind> = { origins: 'origin', origin_layers: 'layer', powers: 'power' }
const JSON_EXT = /\.(json|jsonc|json5)$/

export function classify(path: string, root: string): FileInfo {
  if (!path.startsWith(root)) return { kind: 'other' }
  const rel = path.slice(root.length)
  if (rel === 'pack.mcmeta') return { kind: 'meta' }
  const m = /^data\/([^/]+)\/(origins|origin_layers|powers)\/(.+)$/.exec(rel)
  if (!m || !JSON_EXT.test(m[3])) return { kind: 'other' }
  return { kind: DIRS[m[2]], namespace: m[1], id: `${m[1]}:${m[3].replace(JSON_EXT, '')}` }
}

export function pathFor(project: Pick<Project, 'root'>, kind: 'origin' | 'layer' | 'power', id: string) {
  const [ns, path] = id.split(':')
  const dir = kind === 'origin' ? 'origins' : kind === 'layer' ? 'origin_layers' : 'powers'
  return `${project.root}data/${ns}/${dir}/${path}.json`
}

export function isJsonFile(path: string, root: string) {
  const info = classify(path, root)
  return info.kind !== 'other'
}

const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
const encoder = new TextEncoder()

export function readFile(path: string, bytes: Uint8Array, root: string): PackFile {
  if (!isJsonFile(path, root)) return { path, original: bytes, format: DEFAULT_FORMAT, dirty: false }
  const text = decoder.decode(bytes)
  const parsed = parseJson(text, jsonSyntax(path))
  if (parsed.value === undefined)
    return { path, original: bytes, text, parseError: parsed.error, format: parsed.format, dirty: false }
  return {
    path,
    original: bytes,
    json: parsed.value,
    loadWarning: parsed.error,
    hadComments: parsed.hadComments,
    format: parsed.format,
    dirty: false,
  }
}

export function fileBytes(file: PackFile): Uint8Array {
  if (!file.dirty && file.original) return file.original
  if (file.text !== undefined && file.json === undefined) return encoder.encode(file.text)
  if (file.json !== undefined) {
    // json5 needs its own writer so special numeric values never turn into null
    if (jsonSyntax(file.path) === 'json5') return encoder.encode(printJson(file.json, file.format, 'json5'))
    if (file.original && !file.hadComments && !file.loadWarning)
      return encoder.encode(patchJson(decoder.decode(file.original), file.json, file.format))
    return encoder.encode(printJson(file.json, file.format))
  }
  return file.original ?? new Uint8Array()
}

// finds the folder holding pack.mcmeta, so zips with a wrapper folder still work
export function detectRoot(paths: string[]): string {
  const metas = paths.filter((p) => p.endsWith('pack.mcmeta')).sort((a, b) => a.length - b.length)
  if (metas.length) return metas[0].slice(0, -'pack.mcmeta'.length)
  const data = paths.map((p) => /^(.*?)data\//.exec(p)?.[1]).filter((p): p is string => p !== undefined)
  if (data.length) return data.sort((a, b) => a.length - b.length)[0]
  return ''
}

// the namespace most of the pack's own files use
export function guessNamespace(files: Record<string, PackFile>, root: string): string {
  const counts = new Map<string, number>()
  for (const path of Object.keys(files)) {
    const info = classify(path, root)
    if (info.namespace && info.namespace !== 'origins')
      counts.set(info.namespace, (counts.get(info.namespace) ?? 0) + 1)
  }
  let best = ''
  let n = 0
  for (const [ns, c] of counts) if (c > n) [best, n] = [ns, c]
  return best || 'my_pack'
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// data pack version from the 26.3 client jar version.json
export const DEFAULT_PACK_META = {
  pack: { description: '', min_format: 121, max_format: 121 },
} satisfies Json

export function emptyProject(name: string, namespace: string): Project {
  const now = Date.now()
  const meta: Json = { pack: { ...DEFAULT_PACK_META.pack, description: name } }
  return {
    id: newId(),
    name,
    root: '',
    namespace,
    files: { 'pack.mcmeta': { path: 'pack.mcmeta', json: meta, format: DEFAULT_FORMAT, dirty: true } },
    createdAt: now,
    updatedAt: now,
  }
}

export function projectFromFiles(name: string, entries: { path: string; bytes: Uint8Array }[]): Project {
  const root = detectRoot(entries.map((e) => e.path))
  const files: Record<string, PackFile> = {}
  for (const e of entries) files[e.path] = readFile(e.path, e.bytes, root)
  const now = Date.now()
  return { id: newId(), name, root, namespace: guessNamespace(files, root), files, createdAt: now, updatedAt: now }
}

export interface Entry {
  path: string
  info: FileInfo
  file: PackFile
}

export function entriesOf(project: Project, kind: FileKind): Entry[] {
  const out: Entry[] = []
  for (const [path, file] of Object.entries(project.files)) {
    const info = classify(path, project.root)
    if (info.kind === kind) out.push({ path, info, file })
  }
  return out.sort((a, b) => (a.info.id ?? a.path).localeCompare(b.info.id ?? b.path))
}

export function findById(project: Project, kind: 'origin' | 'layer' | 'power', id: string): Entry | undefined {
  return entriesOf(project, kind).find((e) => e.info.id === id)
}

// a lowercase id path that is not taken yet
export function uniqueId(project: Project, kind: 'origin' | 'layer' | 'power', base: string): string {
  const clean = slug(base) || kind
  let id = `${project.namespace}:${clean}`
  let i = 2
  while (findById(project, kind, id)) id = `${project.namespace}:${clean}_${i++}`
  return id
}

export function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9_./-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export const ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
