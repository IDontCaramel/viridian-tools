// pulls item, block, effect and sound lists plus their icon textures out of the minecraft 26.3 client
// output goes to public/mc-assets, which is gitignored because mojang assets can't be committed
//
//   npm run assets                      uses the fabric loom cache, or downloads from mojang
//   npm run assets -- /path/client.jar  uses that jar
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const VERSION = '26.3'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/mc-assets')
const LOOM = join(homedir(), '.gradle/caches/fabric-loom')
// biome tints have no fixed color, these are the plains colors
const GRASS = 0x91bd59
const FOLIAGE = 0x77ab2f

async function fetchOk(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return res
}

async function mojangVersion() {
  const manifest = await (await fetchOk('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json()
  const entry = manifest.versions.find((v) => v.id === VERSION)
  if (!entry) throw new Error(`minecraft ${VERSION} is not in mojang's version manifest`)
  return (await fetchOk(entry.url)).json()
}

async function loadSources() {
  const jarArg = process.argv[2]
  const localJar = jarArg ?? join(LOOM, VERSION, 'minecraft-client.jar')
  const indexDir = join(LOOM, 'assets/indexes')
  const localIndex = existsSync(indexDir) && readdirSync(indexDir).find((f) => f.startsWith(`${VERSION}-`))
  let version
  const jar = existsSync(localJar)
    ? readFileSync(localJar)
    : Buffer.from(await (await fetchOk((version ??= await mojangVersion()).downloads.client.url)).arrayBuffer())
  const index = localIndex
    ? JSON.parse(readFileSync(join(indexDir, localIndex), 'utf8'))
    : await (await fetchOk((version ??= await mojangVersion()).assetIndex.url)).json()
  const hash = index.objects['minecraft/sounds.json'].hash
  const localSounds = join(LOOM, 'assets/objects', hash.slice(0, 2), hash)
  const sounds = existsSync(localSounds)
    ? JSON.parse(readFileSync(localSounds, 'utf8'))
    : await (await fetchOk(`https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`)).json()
  return { zip: await JSZip.loadAsync(jar), sounds }
}

const { zip, sounds } = await loadSources()
const A = 'assets/minecraft/'
const readJson = async (path) => {
  const f = zip.file(path)
  return f ? JSON.parse(await f.async('string')) : undefined
}
const listDir = (dir) =>
  Object.keys(zip.files)
    .filter((p) => p.startsWith(dir) && p.endsWith('.json'))
    .map((p) => p.slice(dir.length, -'.json'.length))
    .sort()

const lang = await readJson(`${A}lang/en_us.json`)
const strip = (id) => id.replace(/^minecraft:/, '')
const humanize = (s) => s.replace(/[._/]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const usedTextures = new Set()
// "block/stone" style texture paths, relative to textures/
function useTexture(ref) {
  const path = strip(ref)
  if (!zip.file(`${A}textures/${path}.png`)) return undefined
  usedTextures.add(path)
  return path
}

const modelCache = new Map()
// textures merged child-over-parent, and the elements of the closest model that has some
async function resolveModel(ref) {
  const name = strip(ref)
  if (modelCache.has(name)) return modelCache.get(name)
  const json = await readJson(`${A}models/${name}.json`)
  let result = { textures: {}, elements: undefined, generated: name === 'builtin/generated' }
  if (json) {
    const parent = json.parent ? await resolveModel(json.parent) : result
    result = {
      textures: { ...parent.textures, ...json.textures },
      elements: json.elements ?? parent.elements,
      generated: parent.generated,
    }
  }
  modelCache.set(name, result)
  return result
}

// 26.x texture entries can also be { sprite, force_translucent }
function lookup(textures, entry, depth = 0) {
  const ref = typeof entry === 'object' ? entry?.sprite : entry
  if (!ref || depth > 8) return undefined
  return ref.startsWith('#') ? lookup(textures, textures[ref.slice(1)], depth + 1) : ref
}

function tintColor(tint) {
  if (!tint) return undefined
  const value = tint.value ?? tint.default
  if (typeof value === 'number') return value & 0xffffff
  if (tint.type?.endsWith('grass')) return GRASS
  if (tint.type?.endsWith('foliage')) return FOLIAGE
  return undefined
}

// a face is a texture path, or [path, rgb] when the game tints it
function face(textures, ref, tint) {
  const path = useTexture(lookup(textures, ref) ?? '')
  if (!path) return undefined
  return tint === undefined ? path : [path, tint]
}

const FULL = (e) => e.from.every((n) => n === 0) && e.to.every((n) => n === 16)

async function modelIcon(ref, tints = []) {
  const { textures, elements, generated } = await resolveModel(ref)
  if (generated) {
    const layers = []
    for (let i = 0; textures[`layer${i}`]; i++) {
      const f = face(textures, `#layer${i}`, tintColor(tints[i]))
      if (f) layers.push(f)
    }
    if (layers.length) return { layers }
  }
  const cube = elements?.find(FULL)
  if (cube && cube.faces.up && cube.faces.north && cube.faces.west) {
    const side = (dir) => {
      const f = cube.faces[dir]
      if (f.tintindex === undefined) return face(textures, f.texture)
      const fallback = /leaves|vine/.test(lookup(textures, f.texture) ?? '') ? FOLIAGE : GRASS
      return face(textures, f.texture, tintColor(tints[f.tintindex]) ?? fallback)
    }
    // the gui transform (rotate 30 225) shows north on the left and west on the right
    const faces = [side('up'), side('north'), side('west')]
    if (faces.every(Boolean)) return { cube: faces }
  }
  const flat = face(textures, textures.particle ?? Object.values(textures)[0])
  return flat ? { layers: [flat] } : undefined
}

// first plain model in an item definition, following selects, conditions and range dispatches
function firstModel(node) {
  if (!node || typeof node !== 'object') return undefined
  if (node.type === 'minecraft:model') return node
  if (node.type === 'minecraft:special') return { model: node.base, tints: [] }
  for (const key of ['fallback', 'on_false', 'on_true', 'model']) {
    const found = firstModel(node[key])
    if (found) return found
  }
  for (const list of [node.cases, node.entries, node.models]) {
    for (const entry of list ?? []) {
      const found = firstModel(entry.model ?? entry)
      if (found) return found
    }
  }
  return undefined
}

const items = []
const itemIcons = new Map()
for (const id of listDir(`${A}items/`)) {
  const def = await readJson(`${A}items/${id}.json`)
  const model = firstModel(def.model)
  const icon = model?.model ? await modelIcon(model.model, model.tints) : undefined
  if (icon) itemIcons.set(id, icon)
  items.push({ id: `minecraft:${id}`, name: lang[`item.minecraft.${id}`] ?? lang[`block.minecraft.${id}`] ?? humanize(id), icon })
}

function firstStateModel(state) {
  const variant = state.variants ? Object.values(state.variants)[0] : state.multipart?.[0]?.apply
  return (Array.isArray(variant) ? variant[0] : variant)?.model
}

const blocks = []
for (const id of listDir(`${A}blockstates/`)) {
  let icon = itemIcons.get(id)
  if (!icon) {
    const model = firstStateModel(await readJson(`${A}blockstates/${id}.json`))
    if (model) icon = await modelIcon(model)
  }
  blocks.push({ id: `minecraft:${id}`, name: lang[`block.minecraft.${id}`] ?? humanize(id), icon })
}

const effects = Object.keys(lang)
  .map((key) => /^effect\.minecraft\.([a-z_]+)$/.exec(key)?.[1])
  .filter(Boolean)
  .sort()
  .map((id) => {
    const tex = useTexture(`mob_effect/${id}`)
    return { id: `minecraft:${id}`, name: lang[`effect.minecraft.${id}`], icon: tex && { layers: [tex] } }
  })

const soundList = Object.entries(sounds)
  .map(([id, def]) => ({ id: `minecraft:${id}`, name: lang[def.subtitle] ?? humanize(id.split('.').slice(1).join(' ') || id) }))
  .sort((a, b) => a.id.localeCompare(b.id))

await rm(OUT, { recursive: true, force: true })
for (const path of usedTextures) {
  const target = join(OUT, 'textures', `${path}.png`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, await zip.file(`${A}textures/${path}.png`).async('nodebuffer'))
}
const registry = { version: VERSION, items, blocks, effects, sounds: soundList }
await writeFile(join(OUT, 'registry.json'), JSON.stringify(registry))
console.log(
  `wrote ${items.length} items, ${blocks.length} blocks, ${effects.length} effects, ${soundList.length} sounds and ${usedTextures.size} textures to ${OUT}`,
)
