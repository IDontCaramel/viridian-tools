// typed access to the generated catalog (see scripts/generate-catalog.mjs)
import raw from './generated.json'
import { describe as describeType } from './descriptions'

export type Category =
  | 'power_type'
  | 'entity_action'
  | 'bientity_action'
  | 'block_action'
  | 'item_action'
  | 'entity_condition'
  | 'bientity_condition'
  | 'block_condition'
  | 'item_condition'
  | 'damage_condition'
  | 'fluid_condition'
  | 'biome_condition'

export interface FieldSpec {
  name: string
  kind: string
  required: boolean
  default?: unknown
  javaDefault?: string
  of?: FieldKind
  values?: string[]
  legacyValues?: string[]
  fields?: FieldSpec[]
  base?: string
  registry?: string
  javaType?: string
  // lists that also accept a single value instead of an array
  single?: boolean
}

export type FieldKind = Omit<FieldSpec, 'name' | 'required'> & { required?: boolean }

export interface TypeSpec {
  category: Category
  id: string
  source: string
  meta?: boolean
  fields: FieldSpec[]
}

interface RawCatalog {
  types: TypeSpec[]
  aliases: { category: string; from: string; to: string }[]
  dataTypes: Record<string, { source: string; fields: FieldSpec[] }>
}

const catalog = raw as unknown as RawCatalog

export const CATEGORIES: Category[] = [
  'power_type',
  'entity_action',
  'bientity_action',
  'block_action',
  'item_action',
  'entity_condition',
  'bientity_condition',
  'block_condition',
  'item_condition',
  'damage_condition',
  'fluid_condition',
  'biome_condition',
]

export const CATEGORY_LABELS: Record<Category, string> = {
  power_type: 'Power',
  entity_action: 'Action',
  bientity_action: 'Two-entity action',
  block_action: 'Block action',
  item_action: 'Item action',
  entity_condition: 'Condition',
  bientity_condition: 'Two-entity condition',
  block_condition: 'Block condition',
  item_condition: 'Item condition',
  damage_condition: 'Damage condition',
  fluid_condition: 'Fluid condition',
  biome_condition: 'Biome condition',
}

export function isCategory(kind: string): kind is Category {
  return (CATEGORIES as string[]).includes(kind)
}

export function isActionCategory(kind: string) {
  return kind.endsWith('_action')
}

export function isConditionCategory(kind: string) {
  return kind.endsWith('_condition')
}

const byCategory = new Map<Category, Map<string, TypeSpec>>()
for (const t of catalog.types) {
  if (!byCategory.has(t.category)) byCategory.set(t.category, new Map())
  byCategory.get(t.category)!.set(t.id, t)
}

const powerAliases = new Map(catalog.aliases.filter((a) => a.category === 'power_type').map((a) => [a.from, a.to]))

// same lookup rules as the mod's TypeRegistry: no namespace means minecraft:, origins: falls back to apoli:
export function normalizeId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`
}

export function resolveType(category: Category, id: unknown): TypeSpec | undefined {
  if (typeof id !== 'string') return undefined
  const types = byCategory.get(category)
  if (!types) return undefined
  let full = normalizeId(id)
  if (category === 'power_type') full = powerAliases.get(full) ?? full
  const found = types.get(full)
  if (found) return found
  if (full.startsWith('origins:')) {
    const fallback = `apoli:${full.slice('origins:'.length)}`
    return types.get(category === 'power_type' ? (powerAliases.get(fallback) ?? fallback) : fallback)
  }
  return undefined
}

export function typesIn(category: Category): TypeSpec[] {
  return [...(byCategory.get(category)?.values() ?? [])]
}

export function dataType(kind: string): { source: string; fields: FieldSpec[] } | undefined {
  return catalog.dataTypes[kind]
}

export function typeInfo(category: Category, id: string) {
  return describeType(category, id)
}

// a fresh object for a type: just the type id plus required fields with sensible starter values
export function skeleton(category: Category, id: string): Record<string, unknown> {
  const spec = resolveType(category, id)
  const out: Record<string, unknown> = { type: id }
  for (const f of spec?.fields ?? []) {
    if (!f.required) continue
    out[f.name] = starterValue(f)
  }
  return out
}

export function starterValue(f: FieldKind): unknown {
  if (f.default !== undefined) return structuredClone(f.default)
  switch (f.kind) {
    case 'boolean':
      return false
    case 'int':
    case 'float':
      return 0
    case 'string':
    case 'identifier':
    case 'text':
      return ''
    case 'comparison':
      return '>='
    case 'enum':
      return f.values?.[0] ?? ''
    case 'list':
    case 'weighted_list':
      return []
    case 'vector':
      return { x: 0, y: 0, z: 0 }
    case 'modifier':
      return { operation: 'add_base_early', value: 0 }
    case 'attributed_attribute_modifier':
      return { attribute: 'minecraft:max_health', operation: 'addition', value: 0 }
    case 'attribute_modifier':
      return { operation: 'addition', value: 0 }
    case 'item_stack':
      return { item: 'minecraft:stone' }
    case 'status_effect_instance':
      return { effect: 'minecraft:speed' }
    case 'object':
      return {}
    default:
      if (isCategory(f.kind) && f.kind !== 'power_type')
        return {
          type: f.kind.endsWith('_action') ? 'apoli:nothing' : 'apoli:constant',
          ...(f.kind.endsWith('_condition') ? { value: true } : {}),
        }
      return ''
  }
}
