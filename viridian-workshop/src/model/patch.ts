import { applyEdits, modify, type JSONPath } from 'jsonc-parser'
import { isObject, parseJson, printJson, type Json, type TextFormat } from './json'

// patch only changed values so unrelated number spellings and compact arrays survive
export function patchJson(original: string, next: Json, format: TextFormat): string {
  const parsed = parseJson(original)
  // jsonc-parser cannot patch json5 keys or literals so reprint edited json5 as valid json
  if (parsed.value === undefined || parsed.error) return printJson(next, format)
  let text = format.bom ? original.slice(1) : original
  const write = (path: JSONPath, value: Json | undefined) => {
    text = applyEdits(
      text,
      modify(text, path, value, {
        formattingOptions: {
          tabSize: format.indent.length,
          insertSpaces: format.indent !== '\t',
          eol: format.eol,
          keepLines: true,
        },
        getInsertionIndex: (keys) => keys.length,
      }),
    )
  }
  const visit = (before: Json, after: Json, path: JSONPath) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    if (isObject(before) && isObject(after)) {
      const surviving = Object.keys(before).filter((k) => k in after)
      const afterExisting = Object.keys(after).filter((k) => k in before)
      // a renamed or reordered key needs the object's new order
      if (
        surviving.join('\0') !== afterExisting.join('\0') ||
        [...surviving, ...Object.keys(after).filter((k) => !(k in before))].join('\0') !== Object.keys(after).join('\0')
      ) {
        write(path, after)
        return
      }
      for (const key of Object.keys(before)) if (!(key in after)) write([...path, key], undefined)
      for (const key of Object.keys(after)) {
        if (key in before) visit(before[key], after[key], [...path, key])
        else write([...path, key], after[key])
      }
    } else if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
      after.forEach((v, i) => visit(before[i], v, [...path, i]))
    } else write(path, after)
  }
  visit(parsed.value, next, [])
  return (format.bom ? '\ufeff' : '') + text
}
