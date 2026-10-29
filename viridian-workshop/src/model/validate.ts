// checks a project against the catalog the same way the mod would read it
// errors mean the mod will refuse the file, warnings mean it loads but something is off
import {
  CATEGORY_LABELS,
  dataType,
  isCategory,
  resolveType,
  type Category,
  type FieldKind,
  type FieldSpec,
} from '../catalog/catalog'
import { builtins } from '../catalog/builtins'
import type { Path } from './edit'
import { isObject, type Json } from './json'
import { classify, entriesOf, type Project } from './project'

export type Severity = 'error' | 'warning'

export interface Issue {
  file: string
  at: Path
  severity: Severity
  message: string
}

// fields every power file can have no matter its type
export const POWER_COMMON = [
  'type',
  'name',
  'description',
  'hidden',
  'loading_priority',
  'badges',
  'condition',
  'fabric:load_conditions',
]
const KNOWN_NAMESPACES = ['apoli', 'origins', 'viridian']

class Ctx {
  issues: Issue[] = []
  constructor(public file: string) {}
  add(at: Path, severity: Severity, message: string) {
    this.issues.push({ file: this.file, at, severity, message })
  }
}

export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = []
  const powerIds = new Set(entriesOf(project, 'power').map((e) => e.info.id!))
  const originIds = new Set(entriesOf(project, 'origin').map((e) => e.info.id!))
  // sub-powers of multiple powers can be referenced too
  for (const e of entriesOf(project, 'power')) {
    if (isObject(e.file.json) && resolveType('power_type', e.file.json.type)?.id === 'apoli:multiple') {
      for (const [k, v] of Object.entries(e.file.json))
        if (isObject(v) && !POWER_COMMON.includes(k)) powerIds.add(`${e.info.id}_${k}`)
    }
  }
  for (const id of Object.keys(builtins.powers)) powerIds.add(id)
  for (const id of Object.keys(builtins.origins)) originIds.add(id)

  for (const file of Object.values(project.files)) {
    const info = classify(file.path, project.root)
    if (info.kind === 'other') continue
    const ctx = new Ctx(file.path)
    if (file.parseError) {
      ctx.add([], 'error', `This file is not valid JSON: ${file.parseError}`)
      issues.push(...ctx.issues)
      continue
    }
    if (file.loadWarning) ctx.add([], 'error', file.loadWarning)
    const json = file.json
    if (info.kind === 'meta') {
      if (!isObject(json) || !isObject(json.pack)) ctx.add([], 'error', 'pack.mcmeta needs a "pack" object.')
    } else if (info.kind === 'power') {
      validatePower(json, [], ctx, true)
    } else if (info.kind === 'origin') {
      validateFields(json, dataType('origin')!.fields, [], ctx, 'origin')
      if (isObject(json) && Array.isArray(json.powers)) {
        json.powers.forEach((p, i) => {
          if (typeof p !== 'string') return
          const id = resolveRef(p, info.namespace!)
          if (!powerIds.has(id))
            ctx.add(
              ['powers', i],
              'warning',
              `Power "${p}" is not in this pack or the built-in powers. It has to come from another datapack.`,
            )
        })
      }
    } else if (info.kind === 'layer') {
      validateFields(json, dataType('origin_layer')!.fields, [], ctx, 'layer')
      if (isObject(json) && Array.isArray(json.origins)) {
        json.origins.forEach((entry, i) => {
          const ids =
            typeof entry === 'string'
              ? [[entry, [i]] as const]
              : isObject(entry) && Array.isArray(entry.origins)
                ? entry.origins.map((o, j) => [o, [i, 'origins', j]] as const)
                : []
          for (const [o, at] of ids) {
            if (typeof o === 'string' && !originIds.has(resolveRef(o, info.namespace!)))
              ctx.add(['origins', ...at], 'warning', `Origin "${o}" is not in this pack or the built-in origins.`)
          }
        })
      }
    }
    issues.push(...ctx.issues)
  }
  return issues
}

// "*:x" points at the file's own namespace
export function resolveRef(id: string, namespace: string) {
  if (id.startsWith('*:')) return `${namespace}:${id.slice(2)}`
  return id.includes(':') ? id : `minecraft:${id}`
}

function validatePower(json: Json | undefined, at: Path, ctx: Ctx, topLevel: boolean) {
  if (!isObject(json)) {
    ctx.add(at, 'error', 'A power has to be a JSON object.')
    return
  }
  if (typeof json.type !== 'string') {
    ctx.add([...at, 'type'], 'error', 'Pick a power type.')
    return
  }
  const spec = resolveType('power_type', json.type)
  if (!spec) {
    unknownType(json.type, 'power_type', [...at, 'type'], ctx)
    return
  }
  const isMultiple = spec.id === 'apoli:multiple'
  if (isMultiple && !topLevel) ctx.add([...at, 'type'], 'error', 'A sub-power can not be another "multiple" power.')
  const common: FieldSpec[] = (dataType('power')?.fields ?? []).filter((f) => f.name !== 'type')
  validateFields(json, [...common, ...spec.fields], at, ctx, 'power', (key, value) => {
    if (key === 'fabric:load_conditions') return true
    if (isMultiple && isObject(value)) {
      validatePower(value, [...at, key], ctx, false)
      return true
    }
    return false
  })
}

function unknownType(id: string, category: Category, at: Path, ctx: Ctx) {
  const ns = id.includes(':') ? id.split(':')[0] : 'minecraft'
  const label = CATEGORY_LABELS[category].toLowerCase()
  if (KNOWN_NAMESPACES.includes(ns) || ns === 'minecraft')
    ctx.add(at, 'error', `Unknown ${label} type "${id}". Viridian does not support it, so this will fail to load.`)
  else ctx.add(at, 'warning', `"${id}" is not a Viridian ${label} type. It only works if another mod adds it.`)
}

// keys the mod skips on purpose that show up all over real packs, not worth a warning
// modifiers written in the old attribute modifier style carry a "name"
const SILENTLY_IGNORED: Record<string, string[]> = { modifier: ['name'] }

function validateFields(
  json: Json | undefined,
  fields: FieldSpec[],
  at: Path,
  ctx: Ctx,
  what: string,
  extra?: (key: string, value: Json) => boolean,
) {
  if (!isObject(json)) {
    ctx.add(at, 'error', `Expected a JSON object for this ${what}.`)
    return
  }
  const byName = new Map(fields.map((f) => [f.name, f]))
  for (const f of fields) {
    if (f.required && !(f.name in json)) ctx.add([...at, f.name], 'error', `"${f.name}" is required.`)
  }
  for (const [key, value] of Object.entries(json)) {
    const f = byName.get(key)
    if (!f) {
      if (key === 'type' || extra?.(key, value) || SILENTLY_IGNORED[what]?.includes(key)) continue
      ctx.add([...at, key], 'warning', `The mod ignores "${key}" here.`)
      continue
    }
    validateValue(value, f, [...at, key], ctx)
  }
}

export function validateValue(value: Json, kind: FieldKind, at: Path, ctx: Ctx) {
  const k = kind.kind
  if (isCategory(k) && k !== 'power_type') return validateTyped(value, k, at, ctx)
  // calio scalar codecs delegate to gson including nested single-element arrays
  if (['boolean', 'int', 'float', 'string'].includes(k) && Array.isArray(value)) {
    if (value.length !== 1) ctx.add(at, 'error', 'Expected a scalar or a single-element array.')
    else {
      ctx.add(at, 'warning', 'The mod reads this single-element array as its contained value.')
      validateValue(value[0], kind, at, ctx)
    }
    return
  }
  switch (k) {
    case 'boolean':
      if (typeof value === 'string' || typeof value === 'number')
        ctx.add(at, 'warning', `The mod reads this value as ${typeof value === 'string' && value.toLowerCase() === 'true'}.`)
      else if (typeof value !== 'boolean') ctx.add(at, 'error', 'Expected true or false.')
      return
    case 'int':
    case 'float':
      return validateNumber(value, k === 'int', at, ctx)
    case 'string':
      if (typeof value === 'number' || typeof value === 'boolean')
        ctx.add(at, 'warning', 'The mod reads this value as text.')
      else if (typeof value !== 'string') ctx.add(at, 'error', 'Expected text.')
      return
    case 'nbt':
    case 'stat':
      if (typeof value !== 'string' && !(k === 'nbt' && isObject(value))) ctx.add(at, 'error', 'Expected text.')
      return
    case 'identifier':
    case 'item':
    case 'block':
    case 'registry':
    case 'tag':
    case 'item_tag':
    case 'block_tag':
    case 'fluid_tag':
    case 'entity_type_tag':
    case 'biome_tag':
    case 'status_effect':
    case 'particle_type':
    case 'sound_event':
    case 'power_type_id':
      if (typeof value !== 'string') ctx.add(at, 'error', 'Expected an ID like "minecraft:stone".')
      // power references can use * wildcards (DynamicIdentifiers), like "*:*_toggle"
      else if (!/^([a-z0-9_.*-]+:)?[a-z0-9_./*-]+$/.test(value))
        ctx.add(at, 'warning', `"${value}" does not look like a valid ID.`)
      return
    case 'text':
      if (typeof value !== 'string' && !isObject(value) && !Array.isArray(value)) ctx.add(at, 'error', 'Expected text.')
      return
    case 'enum':
      if (typeof value === 'number') return
      if (typeof value !== 'string') ctx.add(at, 'error', `Expected one of: ${kind.values?.join(', ')}.`)
      else if (
        kind.values &&
        !kind.values.includes(value.toLowerCase()) &&
        !kind.legacyValues?.includes(value) &&
        !value.includes(':')
      )
        ctx.add(at, 'error', `"${value}" is not one of: ${kind.values.join(', ')}.`)
      return
    case 'comparison':
      if (
        typeof value !== 'string' ||
        ![
          '==',
          '<',
          '>',
          '<=',
          '>=',
          '!=',
          'equal',
          'less_than',
          'greater_than',
          'less_than_or_equal',
          'greater_than_or_equal',
          'not_equal',
          'none',
        ].includes(value.toLowerCase())
      )
        ctx.add(at, 'error', 'Expected a comparison like ">=", "==" or "<".')
      return
    case 'vector':
      if (!isObject(value)) ctx.add(at, 'error', 'Expected an object with x, y and z.')
      return
    case 'list':
      if (Array.isArray(value)) value.forEach((v, i) => kind.of && validateValue(v, kind.of, [...at, i], ctx))
      else if (kind.of) validateValue(value, kind.of, at, ctx)
      return
    case 'weighted_list':
      if (!Array.isArray(value)) return
      value.forEach((v, i) => {
        if (!isObject(v)) return ctx.add([...at, i], 'error', 'Expected {"element": ..., "weight": ...}.')
        if (kind.of && v.element !== undefined) validateValue(v.element, kind.of, [...at, i, 'element'], ctx)
        if (v.weight !== undefined && typeof v.weight !== 'number')
          ctx.add([...at, i, 'weight'], 'error', 'Expected a whole number.')
      })
      return
    case 'object': {
      const base = kind.base ? (dataType(kind.base)?.fields ?? []) : []
      validateFields(value, [...base, ...(kind.fields ?? [])], at, ctx, 'entry')
      return
    }
    case 'key':
      if (typeof value === 'string') return
      validateFields(value, dataType('key')!.fields, at, ctx, 'key')
      return
    case 'item_or_item_stack':
      if (typeof value === 'string') return validateValue(value, { kind: 'item' }, at, ctx)
      validateFields(value, dataType('item_stack')!.fields, at, ctx, 'item')
      return
    case 'particle':
      if (typeof value === 'string') return validateValue(value, { kind: 'identifier' }, at, ctx)
      validateFields(value, dataType('particle')!.fields, at, ctx, 'particle')
      return
    case 'layer_entry':
      if (typeof value === 'string') return
      validateFields(value, dataType('layer_entry')!.fields, at, ctx, 'entry')
      return
    case 'hud_render':
      if (Array.isArray(value))
        return value.forEach((v, i) => validateFields(v, dataType('hud_render')!.fields, [...at, i], ctx, 'hud render'))
      validateFields(value, dataType('hud_render')!.fields, at, ctx, 'hud render')
      return
    case 'modifiers':
    case 'attribute_modifiers':
    case 'attributed_attribute_modifiers':
    case 'status_effect_instances':
    case 'item_stacks': {
      const single = {
        modifiers: 'modifier',
        attribute_modifiers: 'attribute_modifier',
        attributed_attribute_modifiers: 'attributed_attribute_modifier',
        status_effect_instances: 'status_effect_instance',
        item_stacks: 'item_stack',
      }[k]
      return validateValue(value, { kind: 'list', of: { kind: single } }, at, ctx)
    }
    default: {
      const dt = dataType(k)
      if (dt) validateFields(value, dt.fields, at, ctx, k.replace(/_/g, ' '))
    }
  }
}

function validateNumber(value: Json, integer: boolean, at: Path, ctx: Ctx) {
  if (typeof value === 'number') {
    if (integer && !Number.isInteger(value))
      ctx.add(at, 'warning', 'The mod coerces this number to an integer, discarding its fractional part.')
    return
  }
  if (typeof value === 'string') {
    // gson parses integer strings with integer.parseInt and floating strings with java floating point syntax
    const valid = integer
      ? /^[+-]?\d+$/.test(value) && Number(value) >= -2147483648 && Number(value) <= 2147483647
      : /^[+-]?(?:NaN|Infinity|(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|0[xX](?:[\da-fA-F]+\.?[\da-fA-F]*|\.[\da-fA-F]+)[pP][+-]?\d+)[fFdD]?)$/.test(
          value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, ''),
        )
    if (valid) {
      ctx.add(at, 'warning', 'The mod reads this numeric string as a number.')
      return
    }
  }
  ctx.add(at, 'error', integer ? 'Expected a whole number or an integer string.' : 'Expected a number or a numeric string.')
}

function validateTyped(value: Json, category: Category, at: Path, ctx: Ctx) {
  const label = CATEGORY_LABELS[category].toLowerCase()
  if (!isObject(value)) return ctx.add(at, 'error', `Expected a ${label} object.`)
  if (typeof value.type !== 'string') return ctx.add([...at, 'type'], 'error', `Pick a ${label} type.`)
  const spec = resolveType(category, value.type)
  if (!spec) return unknownType(value.type, category, [...at, 'type'], ctx)
  const inverted: FieldSpec = { name: 'inverted', kind: 'boolean', required: false, default: false }
  validateFields(value, [...spec.fields, inverted], at, ctx, label)
}

export function issuesFor(issues: Issue[], file: string) {
  return issues.filter((i) => i.file === file)
}
