import { describe, it, expect } from 'vitest'
import { fileBytes, readFile } from './project'
import { parseJson } from './json'
import { setIn, deleteIn, renameKey } from './edit'

function edit(source: string, update: (json: NonNullable<ReturnType<typeof parseJson>['value']>) => unknown) {
  const file = readFile('data/test/powers/power.json', new TextEncoder().encode(source), '')
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(fileBytes({ ...file, dirty: true, json: update(file.json!) as typeof file.json }))
}

describe('targeted json edits', () => {
  it('keeps unrelated number spellings, unknown fields, compact arrays and line endings', () => {
    const source = '{\r\n\t"type": "apoli:dummy",\r\n\t"unknown": [1.0, 2e1],\r\n\t"name": "Old"\r\n}'
    expect(edit(source, (json) => setIn(json, ['name'], 'New'))).toBe(source.replace('Old', 'New'))
  })
  it('adds, removes and renames properties without losing values', () => {
    const source = '{"a": 1, "b": 2, "c": {"x": true}}'
    const renamed = edit(source, (json) => renameKey(json as Record<string, number>, 'b', 'new'))
    expect(Object.keys(JSON.parse(renamed))).toEqual(['a', 'new', 'c'])
    expect(JSON.parse(renamed)).toEqual({ a: 1, new: 2, c: { x: true } })
    const updated = JSON.parse(edit(source, (json) => setIn(deleteIn(json, ['b']), ['d'], 4)))
    expect(Object.keys(updated)).toEqual(['a', 'c', 'd'])
    expect(updated).toEqual({
      a: 1,
      c: { x: true },
      d: 4,
    })
  })
  it('preserves a bom and patches values inside arrays', () => {
    const source = '\ufeff{"a": [1.0, 2e1], "b": 3.0}\n'
    expect(edit(source, (json) => setIn(json, ['a', 1], 9))).toBe('\ufeff{"a": [1.0, 9], "b": 3.0}\n')
  })
})

describe('lenient json', () => {
  it('preserves json5 special numeric values when exporting an edited file', () => {
    const bytes = new TextEncoder().encode("{type:'apoli:dummy', unknown:[Infinity,-Infinity,NaN]}")
    const file = readFile('data/test/powers/power.json5', bytes, '')
    const edited = { ...file, dirty: true, json: setIn(file.json, ['name'], 'Changed') }
    const output = new TextDecoder().decode(fileBytes(edited))
    expect(parseJson(output, 'json5').value).toEqual({
      type: 'apoli:dummy', unknown: [Infinity, -Infinity, NaN], name: 'Changed',
    })
  })

  it('parses json5 literals without allowing them in jsonc or json files', () => {
    const source = "{type:'apoli:dummy', hex:0x10, number:+.5, line:'first\\\nsecond',}"
    expect(parseJson(source, 'json5')).toMatchObject({
      value: { type: 'apoli:dummy', hex: 16, number: 0.5, line: 'firstsecond' },
      usedLenient: true,
    })
    expect(parseJson(source, 'json5').error).toBeUndefined()
    expect(parseJson(source, 'jsonc').error).toBeDefined()
    expect(parseJson(source, 'json').error).toBeDefined()
  })

  it('round-trips untouched json5 bytes and exports valid data after a form edit', () => {
    const source = "\ufeff{type:'apoli:dummy', text:'hello // world', unknown:0x10}\r\n"
    const bytes = new TextEncoder().encode(source)
    const file = readFile('data/test/powers/power.json5', bytes, '')
    expect(file.parseError).toBeUndefined()
    expect(file.loadWarning).toBeUndefined()
    expect(file.hadComments).toBe(false)
    expect(fileBytes(file)).toBe(bytes)
    const edited = { ...file, dirty: true, json: setIn(file.json, ['name'], 'Changed') }
    const output = new TextDecoder('utf-8', { ignoreBOM: true }).decode(fileBytes(edited))
    expect(output.startsWith('\ufeff')).toBe(true)
    expect(parseJson(output, 'json5').value).toEqual({ type: 'apoli:dummy', text: 'hello // world', unknown: 16, name: 'Changed' })
  })

  it('keeps comma and bracket characters inside strings when removing trailing commas', () => {
    const parsed = parseJson('{"text":"hello, }", "values":[1,],}', 'jsonc')
    expect(parsed.value).toEqual({ text: 'hello, }', values: [1] })
    expect(parsed.error).toBeUndefined()
  })
  it('rejects unfinished comments and comments splitting a number', () => {
    expect(parseJson('{"a":1} /* unfinished', 'jsonc').error).toBeDefined()
    expect(parseJson('{"a":1/* split */2}', 'jsonc').error).toBeDefined()
  })
})
