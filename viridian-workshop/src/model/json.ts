// parsing and printing datapack json so untouched files survive byte for byte
// and touched files keep their indentation, line endings and key order
import JSON5 from 'json5'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonSyntax = 'json' | 'jsonc' | 'json5'

export function jsonSyntax(path: string): JsonSyntax {
  return path.endsWith('.json5') ? 'json5' : path.endsWith('.jsonc') ? 'jsonc' : 'json'
}

export interface ParsedJson {
  value?: Json
  error?: string
  // the mod reads .json strictly, so comments there would fail to load
  usedLenient: boolean
  hadComments: boolean
  format: TextFormat
}

export interface TextFormat {
  indent: string
  eol: '\n' | '\r\n'
  finalNewline: boolean
  bom: boolean
}

export const DEFAULT_FORMAT: TextFormat = { indent: '  ', eol: '\n', finalNewline: true, bom: false }

export function detectFormat(text: string): TextFormat {
  const bom = text.charCodeAt(0) === 0xfeff
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const m = /\n([ \t]+)\S/.exec(text)
  const indent = m ? (m[1].startsWith('\t') ? '\t' : m[1]) : '  '
  return { indent, eol, finalNewline: /\n$/.test(text), bom }
}

// strips // and /* */ comments plus trailing commas, which is what most hand written packs need
export function stripLenient(text: string): { text: string; hadComments: boolean } {
  let out = ''
  let hadComments = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      hadComments = true
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      hadComments = true
      const end = text.indexOf('*/', i + 2)
      out += end === -1 ? text.slice(i) : text.slice(i, end + 2).replace(/[^\r\n]/g, ' ')
      i = end === -1 ? text.length : end + 2
    } else {
      out += c
      i++
    }
  }
  out = out.replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, closing: string | undefined) => closing ?? match)
  return { text: out, hadComments }
}

export function parseJson(text: string, syntax: JsonSyntax = 'json'): ParsedJson {
  const format = detectFormat(text)
  const body = format.bom ? text.slice(1) : text
  try {
    return { value: JSON.parse(body), usedLenient: false, hadComments: false, format }
  } catch (strictError) {
    const stripped = stripLenient(body)
    try {
      const value: Json = syntax === 'json5' ? JSON5.parse(body) : JSON.parse(stripped.text)
      if (syntax !== 'json') return { value, usedLenient: true, hadComments: stripped.hadComments, format }
      return {
        value,
        usedLenient: true,
        hadComments: stripped.hadComments,
        format,
        error:
          'This file uses comments or trailing commas. The mod reads .json files strictly, so it will not load. Rename it to .jsonc or remove them.',
      }
    } catch {
      return { error: (strictError as Error).message, usedLenient: false, hadComments: false, format }
    }
  }
}

export function printJson(value: Json, format: TextFormat = DEFAULT_FORMAT, syntax: JsonSyntax = 'json'): string {
  let text = syntax === 'json5'
    ? JSON5.stringify(value, { space: format.indent, quote: '"' })
    : JSON.stringify(value, null, format.indent)
  if (format.finalNewline) text += '\n'
  if (format.eol === '\r\n') text = text.replace(/\n/g, '\r\n')
  if (format.bom) text = '﻿' + text
  return text
}

export function isObject(v: unknown): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
