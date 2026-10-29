// block look and wording for the blocks view, kept as data so a new type only needs an entry here
// (or nothing at all, every type falls back to its catalog label and fields)
import { isCategory, resolveType, type Category, type FieldKind } from '../../catalog/catalog'
import { isObject, type Json } from '../../model/json'
import { entriesOf, type Project } from '../../model/project'
import type { PickerOption } from '../TypePicker'

export type Family =
  | 'event'
  | 'control'
  | 'entity'
  | 'bientity'
  | 'block'
  | 'item'
  | 'sensing'
  | 'operator'
  | 'unknown'

const CONTROL_ACTIONS = new Set(['and', 'chance', 'choice', 'delay', 'if_else', 'if_else_list', 'nothing', 'side'])
const OPERATOR_CONDITIONS = new Set(['and', 'or', 'constant', 'chance'])

export function typePath(id: unknown) {
  if (typeof id !== 'string') return ''
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
}

export function familyOf(category: Category | string, typeId: unknown): Family {
  if (category === 'power_type') return 'event'
  if (!isCategory(category)) return 'unknown'
  const spec = resolveType(category, typeId)
  if (!spec) return 'unknown'
  const path = typePath(spec.id)
  if (category.endsWith('_action')) {
    if (CONTROL_ACTIONS.has(path)) return 'control'
    if (category === 'bientity_action') return 'bientity'
    if (category === 'block_action') return 'block'
    if (category === 'item_action') return 'item'
    return 'entity'
  }
  return OPERATOR_CONDITIONS.has(path) ? 'operator' : 'sensing'
}

// sentence for the top line of a block, {field} puts that field's input inline
// fields left out of the sentence still show up, after it or in their own row
const POWER_TEMPLATES: Record<string, string> = {
  action_on_key_press: 'when I press {key}',
  launch: 'launch me up when I press {key}',
  action_over_time: 'every {interval} ticks',
  action_on_hit: 'when I hit something',
  action_when_hit: 'when something hits me',
  action_when_damage_taken: 'when I take damage',
  action_on_land: 'when I land',
  action_on_death: 'when I die',
  action_on_wake_up: 'when I wake up',
  action_on_block_break: 'when I break a block',
  action_on_block_place: 'when I place a block',
  action_on_block_use: 'when I use a block',
  action_on_entity_use: 'when I use an entity',
  action_on_item_use: 'when I use an item',
  action_on_item_pickup: 'when I pick up an item',
  self_action_on_kill: 'when I kill something',
  action_on_callback: 'when this power changes',
}

const ACTION_TEMPLATES: Record<string, string> = {
  and: 'do all of these',
  nothing: 'do nothing',
  delay: 'wait {ticks} ticks',
  chance: 'with a chance of {chance}',
  if_else: 'if {condition}',
  side: 'only on the {side}',
  choice: 'pick one at random',
  if_else_list: 'run the first match',
  add_velocity: 'push x {x} y {y} z {z}',
  heal: 'heal {amount}',
  damage: 'deal {amount} damage',
  execute_command: 'run command {command}',
  set_on_fire: 'set on fire for {duration} seconds',
  feed: 'feed {food} food and {saturation} saturation',
  gain_air: 'gain {value} air',
  change_resource: 'change {resource} by {change}',
  set_resource: 'set {resource} to {value}',
  trigger_cooldown: 'start cooldown {power}',
  toggle: 'toggle {power}',
  play_sound: 'play sound {sound}',
  spawn_particles: 'spawn particles',
  explode: 'explode with power {power}',
  actor_action: 'on the actor',
  target_action: 'on the target',
  invert: 'swap actor and target',
}

const CONDITION_TEMPLATES: Record<string, string> = {
  and: 'all of',
  or: 'any of',
  constant: 'always {value}',
  chance: 'chance {chance}',
  resource: '{resource} {comparison} {compare_to}',
  health: 'health {comparison} {compare_to}',
  relative_health: 'health % {comparison} {compare_to}',
  food_level: 'food {comparison} {compare_to}',
  power_active: '{power} is active',
  submerged_in: 'eyes in {fluid}',
  fluid_height: 'in {fluid} deeper than {comparison} {compare_to}',
  dimension: 'in dimension {dimension}',
  equipped_item: 'item in {equipment_slot}',
  actor_condition: 'actor is',
  target_condition: 'target is',
  both: 'both are',
  either: 'either is',
}

export function templateFor(category: Category, typeId: string): string | undefined {
  const path = typePath(typeId)
  if (category === 'power_type') return POWER_TEMPLATES[path]
  if (category.endsWith('_action')) return ACTION_TEMPLATES[path]
  return CONDITION_TEMPLATES[path]
}

export type Piece = { text: string } | { field: string }

export function parseTemplate(template: string): Piece[] {
  const out: Piece[] = []
  for (const part of template.split(/(\{[a-z0-9_]+\})/)) {
    if (!part) continue
    if (part.startsWith('{') && part.endsWith('}')) out.push({ field: part.slice(1, -1) })
    else out.push({ text: part })
  }
  return out
}

// all templates, for the catalog test
export const ALL_TEMPLATES: [string, Record<string, string>][] = [
  ['power_type', POWER_TEMPLATES],
  ['action', ACTION_TEMPLATES],
  ['condition', CONDITION_TEMPLATES],
]

// short labels for the rows that hold other blocks
const ROW_LABELS: Record<string, string> = {
  condition: 'only when',
  entity_action: 'do',
  bientity_action: 'do',
  block_action: 'on the block',
  item_action: 'on the item',
  action: 'do',
  actions: 'do',
  if_action: 'then',
  else_action: 'else',
  fail_action: 'otherwise',
  rising_action: 'when it turns on',
  falling_action: 'when it turns off',
  min_action: 'when it hits the minimum',
  max_action: 'when it hits the maximum',
  conditions: '',
  bientity_condition: 'only if the pair',
  damage_condition: 'only if the damage',
  block_condition: 'only if the block',
  item_condition: 'only if the item',
  target_condition: 'only if the target',
  entity_action_gained: 'when gained',
  entity_action_lost: 'when lost',
  entity_action_added: 'when added',
  entity_action_removed: 'when removed',
  entity_action_respawned: 'on respawn',
  entity_action_chosen: 'when chosen',
}

export function rowLabel(name: string, fallback: string) {
  return ROW_LABELS[name] ?? fallback.toLowerCase()
}

// where a field goes on a block
export type Placement = 'inline' | 'condition' | 'stack' | 'stack_list' | 'condition_list' | 'drawer'

const INLINE_KINDS = new Set([
  'boolean',
  'int',
  'float',
  'enum',
  'comparison',
  'string',
  'identifier',
  'item',
  'block',
  'block_state',
  'registry',
  'tag',
  'item_tag',
  'block_tag',
  'fluid_tag',
  'entity_type_tag',
  'biome_tag',
  'status_effect',
  'particle_type',
  'sound_event',
  'equipment_slot',
  'stat',
  'command',
])

export function placement(f: FieldKind, value: Json | undefined): Placement {
  const k = f.kind
  if (isCategory(k) && k !== 'power_type') {
    if (value !== undefined && !isObject(value)) return 'drawer'
    return k.endsWith('_action') ? 'stack' : 'condition'
  }
  if (k === 'list' && f.of && isCategory(f.of.kind) && f.of.kind !== 'power_type') {
    if (value !== undefined && !Array.isArray(value)) return 'drawer'
    return f.of.kind.endsWith('_action') ? 'stack_list' : 'condition_list'
  }
  // simple values that were written some other way (a text component, an object) go to the drawer
  if (k === 'key' || k === 'particle' || k === 'item_or_item_stack')
    return value === undefined || typeof value === 'string' ? 'inline' : 'drawer'
  if (!INLINE_KINDS.has(k)) return 'drawer'
  if (value === undefined) return 'inline'
  const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  return scalar ? 'inline' : 'drawer'
}

// ready made blocks with their settings filled in, shown first in the block picker
interface Preset {
  category: Category
  label: string
  description: string
  json: Json
}

const PRESETS: Preset[] = [
  {
    category: 'entity_action',
    label: 'Launch upward',
    description: 'Pushes the player straight up.',
    json: { type: 'apoli:add_velocity', y: 1.2 },
  },
  {
    category: 'entity_action',
    label: 'Dash forward',
    description: 'Pushes the player in the direction they look.',
    json: { type: 'apoli:add_velocity', z: 1.5, space: 'local' },
  },
  {
    category: 'entity_action',
    label: 'Speed for 5 seconds',
    description: 'Gives Speed I for 100 ticks.',
    json: { type: 'apoli:apply_effect', effect: { effect: 'minecraft:speed', duration: 100, amplifier: 0 } },
  },
  {
    category: 'entity_action',
    label: 'Heal 2 hearts',
    description: 'Restores 4 health.',
    json: { type: 'apoli:heal', amount: 4 },
  },
  {
    category: 'entity_action',
    label: 'Flame particles',
    description: 'Spawns a burst of flame particles.',
    json: { type: 'apoli:spawn_particles', particle: 'minecraft:flame', count: 20, speed: 0.05 },
  },
  {
    category: 'entity_action',
    label: 'Wait 1 second, then…',
    description: 'Waits 20 ticks before running the blocks inside.',
    json: { type: 'apoli:delay', ticks: 20, action: { type: 'apoli:nothing' } },
  },
  {
    category: 'entity_condition',
    label: 'In water',
    description: "True when the player's eyes are under water.",
    json: { type: 'apoli:submerged_in', fluid: 'minecraft:water' },
  },
  {
    category: 'entity_condition',
    label: 'Below half health',
    description: 'True when health is under 50%.',
    json: { type: 'apoli:relative_health', comparison: '<', compare_to: 0.5 },
  },
  {
    category: 'entity_condition',
    label: 'Not in water',
    description: "True when the player's eyes are not under water.",
    json: { type: 'apoli:submerged_in', fluid: 'minecraft:water', inverted: true },
  },
]

export const PRESET_LIST = PRESETS

// resource and cooldown powers in the pack act like scratch variables
export function variablePowers(project: Project) {
  return entriesOf(project, 'power')
    .filter((e) => {
      const id = isObject(e.file.json) ? resolveType('power_type', e.file.json.type)?.id : undefined
      return id === 'apoli:resource' || id === 'apoli:cooldown'
    })
    .map((e) => e.info.id!)
}

export function presetOptions(category: Category, project: Project): PickerOption[] {
  const out: PickerOption[] = PRESETS.filter((p) => p.category === category).map((p) => ({
    category,
    id: `preset:${p.label}`,
    label: p.label,
    description: p.description,
    group: 'Quick blocks',
    json: p.json,
  }))
  for (const id of variablePowers(project)) {
    const name = id.split(':')[1]
    if (category === 'entity_action') {
      out.push({
        category,
        id: `var:change:${id}`,
        label: `Change ${name}`,
        description: `Adds to the ${name} resource or cooldown.`,
        group: 'Variables',
        json: { type: 'apoli:change_resource', resource: id, change: 1 },
      })
      out.push({
        category,
        id: `var:set:${id}`,
        label: `Set ${name}`,
        description: `Sets the ${name} resource to a value.`,
        group: 'Variables',
        json: { type: 'apoli:set_resource', resource: id, value: 0 },
      })
    }
    if (category === 'entity_condition')
      out.push({
        category,
        id: `var:check:${id}`,
        label: `${name} value`,
        description: `Compares the value of ${name}.`,
        group: 'Variables',
        json: { type: 'apoli:resource', resource: id, comparison: '>=', compare_to: 1 },
      })
  }
  return out
}
