// reads registry ids from the same 26.3 jar used by the mod, without bundling textures
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import JSZip from 'jszip'

const jar = process.argv[2] ?? `${homedir()}/.gradle/caches/fabric-loom/26.3/minecraft-common.jar`
const zip = await JSZip.loadAsync(await readFile(jar))
async function ids(path) {
  const bytes = await zip.file(`net/minecraft/${path}.class`).async('nodebuffer')
  const pool = new Map()
  const strings = []
  let offset = 10
  for (let i = 1; i < bytes.readUInt16BE(8); i++) {
    const tag = bytes[offset++]
    if (tag === 1) {
      const length = bytes.readUInt16BE(offset)
      offset += 2
      pool.set(i, bytes.toString('utf8', offset, offset + length))
      offset += length
    } else if ([7, 8, 16, 19, 20].includes(tag)) {
      if (tag === 8) strings.push(bytes.readUInt16BE(offset))
      offset += 2
    } else if ([3, 4, 9, 10, 11, 12, 17, 18].includes(tag)) offset += 4
    else if (tag === 5 || tag === 6) { offset += 8; i++ }
    else if (tag === 15) offset += 3
    else throw new Error(`unknown constant pool tag ${tag}`)
  }
  const parameterized = new Set()
  if (path.endsWith('ParticleTypes')) {
    offset += 8 + 2 * bytes.readUInt16BE(offset + 6)
    const fields = bytes.readUInt16BE(offset)
    offset += 2
    for (let i = 0; i < fields; i++) {
      const name = pool.get(bytes.readUInt16BE(offset + 2))
      const descriptor = pool.get(bytes.readUInt16BE(offset + 4))
      const attributes = bytes.readUInt16BE(offset + 6)
      offset += 8
      if (descriptor === 'Lnet/minecraft/core/particles/ParticleType;') parameterized.add(name.toLowerCase())
      for (let j = 0; j < attributes; j++) offset += 6 + bytes.readUInt32BE(offset + 2)
    }
  }
  return [...new Set(strings.map((index) => pool.get(index)).filter((id) => /^[a-z][a-z0-9_]*$/.test(id)))].sort().map((id) => ({
    id: `minecraft:${id}`,
    ...(parameterized.has(id) ? { requiresParams: true } : {}),
    name: id.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }))
}
const lists = {
  entities: await ids('world/entity/EntityTypeIds'),
  particles: await ids('core/particles/ParticleTypes'),
}
await writeFile(new URL('../src/mc/script-options.json', import.meta.url), JSON.stringify(lists, null, 2) + '\n')
console.log(`extracted ${lists.entities.length} entities and ${lists.particles.length} particles`)
