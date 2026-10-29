import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { builtins } from '../catalog/builtins'
import { resolveType, skeleton } from '../catalog/catalog'
import { createOriginProject, mainLayerWith, namespaceFor } from './create'
import { setIn } from './edit'
import { parseJson, type Json } from './json'
import { classify, fileBytes, projectFromFiles, pathFor, readFile } from './project'
import { validateProject } from './validate'
import { exportZip, importZip } from './zip'

const testPacks = join(__dirname, '../../../../test-datapacks')

function projectOf(files: Record<string, Json>) {
  const enc = new TextEncoder()
  return projectFromFiles(
    'test',
    Object.entries(files).map(([path, json]) => ({ path, bytes: enc.encode(JSON.stringify(json, null, 2)) })),
  )
}

describe('json', () => {
  it('flags comments in strict files but reads them in lenient ones', () => {
    const text = '{\n  // hi\n  "a": [1, 2,],\n}'
    expect(parseJson(text, 'json').error).toMatch(/strictly/)
    expect(parseJson(text, 'jsonc')).toMatchObject({ value: { a: [1, 2] }, hadComments: true })
  })
})

describe('project', () => {
  it('classifies datapack paths', () => {
    expect(classify('data/x/powers/a/b.json', '')).toEqual({ kind: 'power', namespace: 'x', id: 'x:a/b' })
    expect(classify('pack/data/x/origins/a.jsonc', 'pack/')).toMatchObject({ kind: 'origin', id: 'x:a' })
    expect(classify('data/x/origin_layers/a.json', '')).toMatchObject({ kind: 'layer' })
    expect(classify('data/x/tags/a.json', '')).toEqual({ kind: 'other' })
    expect(pathFor({ root: '' }, 'power', 'x:a/b')).toBe('data/x/powers/a/b.json')
  })
  it('writes untouched files back byte for byte', () => {
    const bytes = new TextEncoder().encode('{"type":"apoli:dummy",   "a":1}')
    const file = readFile('data/x/powers/a.json', bytes, '')
    expect(fileBytes(file)).toBe(bytes)
    const edited = { ...file, json: setIn(file.json, ['a'], 2), dirty: true }
    expect(new TextDecoder().decode(fileBytes(edited))).toBe('{"type":"apoli:dummy",   "a":2}')
  })
})

describe('validation against the mod catalog', () => {
  it('requires the replacement fluid and includes it in new fluid-render powers', () => {
    expect(resolveType('power_type', 'apoli:modify_fluid_render')?.fields).toContainEqual({
      name: 'fluid', kind: 'registry', registry: 'fluid', required: true,
    })
    expect(skeleton('power_type', 'apoli:modify_fluid_render')).toHaveProperty('fluid')
    const path = 'data/x/powers/fluid.json'
    expect(validateProject(projectOf({ [path]: { type: 'apoli:modify_fluid_render' } }))).toContainEqual(
      expect.objectContaining({ at: ['fluid'], severity: 'error' }),
    )
    expect(validateProject(projectOf({ [path]: { type: 'apoli:modify_fluid_render', fluid: 'minecraft:water' } }))).toEqual([])
  })

  it.each(['0', '+2', 10.5, ['0'], [[2.5]]].map((min) => ({ min })))(
    'accepts gson integer coercion for $min without rewriting it',
    ({ min }) => {
      const path = 'data/x/powers/resource.json'
      const project = projectOf({ [path]: { type: 'apoli:resource', min, max: 20 } })
      const issues = validateProject(project)
      expect(issues.filter((i) => i.severity === 'error')).toEqual([])
      expect(issues).toContainEqual(expect.objectContaining({ at: ['min'], severity: 'warning' }))
      expect(project.files[path].json).toMatchObject({ min })
    },
  )

  it.each(['1.5', '1e2', '', ' 2 ', '2147483648', true, null, {}, [], [1, 2]].map((min) => ({ min })))(
    'rejects invalid gson integer input $min',
    ({ min }) => {
      const project = projectOf({ 'data/x/powers/resource.json': { type: 'apoli:resource', min, max: 20 } })
      expect(validateProject(project)).toContainEqual(expect.objectContaining({ at: ['min'], severity: 'error' }))
    },
  )

  it.each(['1.5', '1e2', ['2.5']].map((value) => ({ value })))(
    'accepts gson float coercion for $value',
    ({ value }) => {
      const project = projectOf({ 'data/x/powers/exhaust.json': {
        type: 'apoli:action_on_key_press', entity_action: { type: 'apoli:exhaust', amount: value },
      } })
      expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([])
    },
  )

  it.each(['TRUE', 'false', 1, ['true']].map((value) => ({ value })))(
    'accepts gson boolean coercion for $value',
    ({ value }) => {
      const project = projectOf({ 'data/x/powers/toggle.json': { type: 'apoli:toggle', active_by_default: value } })
      expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([])
    },
  )

  it('accepts every built-in power, origin and layer', () => {
    const files: Record<string, Json> = { 'pack.mcmeta': { pack: { description: '' } } }
    for (const [id, json] of Object.entries(builtins.powers)) files[pathFor({ root: '' }, 'power', id)] = json
    for (const [id, json] of Object.entries(builtins.origins)) files[pathFor({ root: '' }, 'origin', id)] = json
    for (const [id, json] of Object.entries(builtins.layers)) files[pathFor({ root: '' }, 'layer', id)] = json
    const issues = validateProject(projectOf(files))
    expect(issues).toEqual([])
  })

  it('reports unknown types, missing fields and wrong values', () => {
    const issues = validateProject(
      projectOf({
        'data/x/powers/a.json': { type: 'apoli:cooldown' },
        'data/x/powers/b.json': { type: 'apoli:not_a_thing' },
        'data/x/powers/c.json': {
          type: 'apoli:action_over_time',
          interval: 'soon',
          entity_action: { type: 'apoli:heal' },
        },
        'data/x/powers/d.json': { type: 'othermod:thing' },
        'data/x/origins/o.json': { powers: ['x:a', 'x:missing', 'origins:phasing'] },
      }),
    )
    const msgs = issues.map((i) => `${i.file.split('/').pop()} ${i.at.join('.')} ${i.severity}`)
    expect(msgs).toContain('a.json cooldown error')
    expect(msgs).toContain('b.json type error')
    expect(msgs).toContain('c.json interval error')
    expect(msgs).toContain('c.json entity_action.amount error')
    expect(msgs).toContain('d.json type warning')
    expect(msgs).toContain('o.json powers.1 warning')
    expect(msgs).not.toContain('o.json powers.2 warning')
  })

  it('handles multiple powers and their sub-powers', () => {
    const issues = validateProject(
      projectOf({
        'data/x/powers/m.json': {
          type: 'apoli:multiple',
          first: { type: 'apoli:toggle' },
          second: { type: 'apoli:bogus' },
        },
        'data/x/origins/o.json': { powers: ['x:m', 'x:m_first'] },
      }),
    )
    expect(issues.map((i) => `${i.at.join('.')} ${i.severity}`)).toEqual(['second.type error'])
  })
})

describe.skipIf(!existsSync(testPacks) || !readdirSync(testPacks).some((f) => f.endsWith('.zip')))('test datapacks', () => {
  const zips = existsSync(testPacks) ? readdirSync(testPacks).filter((f) => f.endsWith('.zip')) : []
  it.skipIf(!zips.length).each(zips)('round-trips %s unchanged', async (name) => {
    const bytes = readFileSync(join(testPacks, name))
    const project = await importZip(new Blob([bytes]), name)
    const out = await JSZip.loadAsync(await exportZip(project))
    const original = await JSZip.loadAsync(bytes)
    const originalFiles = Object.values(original.files).filter(
      (f) => !f.dir && !f.name.startsWith('__MACOSX/') && !f.name.endsWith('.DS_Store'),
    )
    for (const f of originalFiles) {
      const a = await f.async('uint8array')
      const b = await out.file(f.name)!.async('uint8array')
      expect(Buffer.from(b).equals(Buffer.from(a)), f.name).toBe(true)
    }
  })
})

describe('new origins', () => {
  it('derives the pack namespace from the origin name', () => {
    expect(namespaceFor('Moss Keeper')).toBe('moss_keeper')
    expect(namespaceFor("Elytrian's Kin")).toBe('elytrians_kin')
    expect(namespaceFor('Origins')).toBe('origins_pack')
    expect(namespaceFor('火')).toBe('my_pack')
    const project = createOriginProject('Moss Keeper')
    expect(project.namespace).toBe('moss_keeper')
    expect(project.files['pack.mcmeta'].json).toMatchObject({ pack: { description: 'Moss Keeper' } })
  })

  it('adds origins to the main layer once and leaves broken layer files alone', () => {
    const project = createOriginProject('Test', 'test')
    const layerPath = pathFor(project, 'layer', 'origins:origin')
    expect(mainLayerWith(project, 'test:test')).toBeUndefined()
    expect(mainLayerWith(project, 'test:other')).toEqual({
      path: layerPath,
      json: { replace: false, origins: ['test:test', 'test:other'] },
    })
    project.files[layerPath] = { ...project.files[layerPath], json: undefined, parseError: 'bad' }
    expect(mainLayerWith(project, 'test:other')).toBeUndefined()
  })
})
