import { DEFAULT_FORMAT, isObject, type Json } from './json'
import { emptyProject, pathFor, slug, type Project } from './project'

// namespaces that already belong to minecraft or the mod, a pack writing into them would override built-ins
const RESERVED = new Set(['minecraft', 'origins', 'apoli', 'calio', 'viridian', 'c'])
const MAIN_LAYER = 'origins:origin'

// pack namespace derived from the first origin's name, "Moss Keeper" becomes moss_keeper
export function namespaceFor(name: string) {
  const ns = slug(name).replace(/\//g, '_').replace(/^[_.-]+|[_.-]+$/g, '')
  if (!ns) return 'my_pack'
  return RESERVED.has(ns) ? `${ns}_pack` : ns
}

export function originJson(name: string): Json {
  return { name, description: '', icon: 'minecraft:grass_block', impact: 0, powers: [] }
}

// the main origin layer with the origin added, so players can pick it
// returns undefined when the pack's layer file can't be edited safely
export function mainLayerWith(project: Project, originId: string): { path: string; json: Json } | undefined {
  const path = pathFor(project, 'layer', MAIN_LAYER)
  const file = project.files[path]
  if (!file) return { path, json: { replace: false, origins: [originId] } }
  if (file.parseError || !isObject(file.json)) return undefined
  const origins = Array.isArray(file.json.origins) ? file.json.origins : []
  if (origins.includes(originId)) return undefined
  return { path, json: { ...file.json, origins: [...origins, originId] } }
}

export function createOriginProject(name: string, namespace = namespaceFor(name)): Project {
  const project = emptyProject(name, namespace)
  const id = `${namespace}:${slug(name) || 'origin'}`
  const add = (path: string, json: Json) => {
    project.files[path] = { path, json, format: DEFAULT_FORMAT, dirty: true }
  }
  add(pathFor(project, 'origin', id), originJson(name))
  const layer = mainLayerWith(project, id)!
  add(layer.path, layer.json)
  return project
}
