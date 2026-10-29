// the generic form: every field is drawn from its catalog kind, so a new type in the mod
// only needs a catalog regeneration to get a working editor
import { useEffect, useId, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  CATEGORY_LABELS,
  dataType,
  isCategory,
  resolveType,
  skeleton,
  starterValue,
  typeInfo,
  type Category,
  type FieldKind,
  type FieldSpec,
} from '../../catalog/catalog'
import { humanize } from '../../catalog/descriptions'
import { builtins } from '../../catalog/builtins'
import { insertItem, moveItem, pathKey, type Path } from '../../model/edit'
import { isObject, type Json } from '../../model/json'
import { entriesOf } from '../../model/project'
import { useWs, type Template } from '../../state/context'
import { startsWith, useDoc, useFieldIssues, useNestedIssueCount } from '../../state/doc'
import { SortableItem, SortableList } from '../../ui/dnd'
import { TypePicker, typeOptions, type PickerOption } from '../TypePicker'
import { JsonInput, NumberInput, TextInput, Toggle } from './inputs'
import { McIdPicker, mcListFor } from '../McPicker'

// friendlier names for fields that show up everywhere
const LABELS: Record<string, string> = {
  condition: 'Only active when',
  entity_action: 'Action',
  bientity_action: 'Two-entity action',
  block_action: 'Block action',
  item_action: 'Item action',
  entity_condition: 'Entity condition',
  bientity_condition: 'Two-entity condition',
  block_condition: 'Block condition',
  item_condition: 'Item condition',
  damage_condition: 'Damage condition',
  hud_render: 'HUD display',
  cooldown: 'Cooldown (ticks)',
  interval: 'Interval (ticks)',
  tick_rate: 'Check every (ticks)',
  compare_to: 'Compare to',
  inverted: 'Invert result',
  modifier: 'Modifier',
  modifiers: 'Modifiers',
  if_action: 'Then',
  else_action: 'Otherwise',
  fail_action: 'If it fails',
  key: 'Key',
}

export function fieldLabel(name: string) {
  return LABELS[name] ?? humanize(name)
}

const KEYS = [
  'key.origins.primary_active',
  'key.origins.secondary_active',
  'key.use',
  'key.attack',
  'key.sneak',
  'key.jump',
  'key.saveToolbarActivator',
  'key.loadToolbarActivator',
  'none',
]
const COMPARISONS = ['>=', '>', '==', '!=', '<=', '<']

function defaultHint(f: FieldKind) {
  if (f.default === undefined) return f.javaDefault ? 'depends on other fields' : undefined
  if (typeof f.default === 'object') return JSON.stringify(f.default)
  return String(f.default)
}

// ids for datalist suggestions on reference fields
export function useSuggestions(name: string, kind: string): string[] | undefined {
  const { ws } = useWs()
  const project = ws.state.project
  return useMemo(() => {
    if (kind === 'key') return KEYS
    if (/(^|_)(power|resource|powers)$/.test(name)) {
      return [...entriesOf(project, 'power').map((e) => e.info.id!), ...Object.keys(builtins.powers)]
    }
    if (name === 'origin' || name === 'default_origin' || name === 'origins')
      return [...entriesOf(project, 'origin').map((e) => e.info.id!), ...Object.keys(builtins.origins)]
    if (name === 'layer')
      return [...entriesOf(project, 'layer').map((e) => e.info.id!), ...Object.keys(builtins.layers)]
    return undefined
  }, [project, name, kind])
}


interface RowProps {
  label: string
  path: Path
  spec?: FieldKind
  name?: string
  onRemove?: () => void
  children: ReactNode
  inputId?: string
  block?: boolean
}

export function FieldRow({ label, path, spec, name, onRemove, children, inputId, block }: RowProps) {
  const issues = useFieldIssues(path)
  const { technical } = useWs()
  const hint = spec && defaultHint(spec)
  return (
    <div
      className={'field' + (block ? ' block' : '') + (issues.some((i) => i.severity === 'error') ? ' has-error' : '')}
      data-path={pathKey(path)}
    >
      <div className="field-head">
        <label htmlFor={inputId} className="field-label">
          {label}
          {spec?.required && (
            <span className="req" title="Required">
              *
            </span>
          )}
        </label>
        {technical && name && <code className="field-key">{name}</code>}
        {hint !== undefined && <span className="field-default">default: {hint}</span>}
        {onRemove && (
          <button
            type="button"
            className="icon-btn small remove-field"
            onClick={onRemove}
            title="Remove this setting (use the default)"
            aria-label={`Remove ${label}`}
          >
            ✕
          </button>
        )}
      </div>
      <div className="field-body">{children}</div>
      {issues.map((i, n) => (
        <div key={n} className={`field-msg ${i.severity}`}>
          {i.message}
        </div>
      ))}
    </div>
  )
}


interface FieldProps {
  spec: FieldKind
  path: Path
  name: string
  label?: string
  onRemove?: () => void
}

export function FieldEditor({ spec, path, name, label = fieldLabel(name), onRemove }: FieldProps) {
  const { get, set } = useDoc()
  const value = get(path)
  const id = useId()
  const suggestions = useSuggestions(name, spec.kind)
  const k = spec.kind

  if (isCategory(k) && k !== 'power_type') {
    return (
      <TypedSlot
        category={k}
        path={path}
        label={label}
        name={name}
        required={'required' in spec && !!(spec as FieldSpec).required}
        onRemove={onRemove}
      />
    )
  }

  const row = (child: ReactNode, block = false) => (
    <FieldRow label={label} path={path} spec={spec} name={name} onRemove={onRemove} inputId={id} block={block}>
      {child}
    </FieldRow>
  )

  switch (k) {
    case 'boolean':
      return row(
        <Toggle
          id={id}
          checked={value === undefined ? spec.default === true : value === true}
          muted={value === undefined}
          onChange={(v) => set(path, v)}
          label={
            value === undefined ? (spec.default === true ? 'On (default)' : 'Off (default)') : value ? 'On' : 'Off'
          }
        />,
      )
    case 'int':
    case 'float':
      return row(
        <NumberInput
          id={id}
          value={value}
          integer={k === 'int'}
          placeholder={defaultHint(spec)}
          onChange={(v) => set(path, v ?? (spec.required ? 0 : undefined))}
        />,
      )
    case 'enum':
      return row(
        <select
          id={id}
          className="input"
          value={typeof value === 'string' ? value : value === undefined ? '' : String(value)}
          onChange={(e) => set(path, e.target.value === '' ? undefined : e.target.value)}
        >
          {value === undefined && (
            <option value="">{spec.default !== undefined ? `Default (${spec.default})` : 'Choose…'}</option>
          )}
          {spec.values?.map((v) => (
            <option key={v} value={v}>
              {humanize(v)}
            </option>
          ))}
          {typeof value === 'string' && !spec.values?.includes(value) && <option value={value}>{value}</option>}
        </select>,
      )
    case 'comparison':
      return row(
        <select
          id={id}
          className="input narrow"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => set(path, e.target.value)}
        >
          {value === undefined && (
            <option value="">{spec.default !== undefined ? `Default (${spec.default})` : 'Choose…'}</option>
          )}
          {COMPARISONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {typeof value === 'string' && !COMPARISONS.includes(value) && <option value={value}>{value}</option>}
        </select>,
      )
    case 'text':
      return row(<TextField id={id} path={path} multiline={/description|message/.test(name)} />, true)
    case 'string':
    case 'identifier':
    case 'item':
    case 'block':
    case 'block_state':
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
    case 'equipment_slot':
    case 'stat':
    case 'shape':
      if (value !== undefined && typeof value !== 'string')
        return row(<JsonInput id={id} value={value} onChange={(v) => set(path, v)} />, true)
      if (mcListFor(k, spec.registry))
        return row(<McIdPicker id={id} list={mcListFor(k, spec.registry)!} value={value} onChange={(v) => set(path, v, false)} />)
      return row(
        <TextInput
          id={id}
          value={typeof value === 'string' ? value : ''}
          mono={k !== 'string'}
          placeholder={placeholderFor(spec)}
          suggestions={suggestions}
          onChange={(v) => set(path, v)}
        />,
      )
    case 'command':
      return row(
        <TextInput id={id} value={typeof value === 'string' ? value : ''} mono onChange={(v) => set(path, v)} />,
      )
    case 'vector':
      return row(<VectorInput path={path} />)
    case 'list':
      return <ListField spec={spec} path={path} name={name} label={label} onRemove={onRemove} />
    case 'weighted_list':
      return <WeightedListField spec={spec} path={path} name={name} label={label} onRemove={onRemove} />
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
      }[k]!
      return (
        <ListField
          spec={{ ...spec, kind: 'list', of: { kind: single } }}
          path={path}
          name={name}
          label={label}
          onRemove={onRemove}
        />
      )
    }
    case 'key':
      if (typeof value === 'string' || value === undefined)
        return row(
          <div className="inline-row">
            <McIdPicker id={id} list="keys" value={value} onChange={(v) => set(path, v, false)} />
            <button
              type="button"
              className="link-btn"
              onClick={() => set(path, { key: value ?? 'key.origins.primary_active' })}
            >
              More options
            </button>
          </div>,
        )
      return <GroupField label={label} path={path} name={name} fields={dataType('key')!.fields} onRemove={onRemove} />
    case 'item_or_item_stack':
      if (typeof value === 'string' || value === undefined)
        return row(
          <McIdPicker id={id} list="items" value={value} onChange={(v) => set(path, v, false)} />,
        )
      return (
        <GroupField label={label} path={path} name={name} fields={dataType('item_stack')!.fields} onRemove={onRemove} />
      )
    case 'particle':
      if (typeof value === 'string' || value === undefined)
        return row(
          <McIdPicker parameterless id={id} list="particles" value={value} onChange={(v) => set(path, v, false)} />,
        )
      return (
        <GroupField label={label} path={path} name={name} fields={dataType('particle')!.fields} onRemove={onRemove} />
      )
    case 'layer_entry':
      if (typeof value === 'string' || value === undefined)
        return row(
          <div>
            <TextInput id={id} value={value ?? ''} mono suggestions={suggestions} onChange={(v) => set(path, v)} />
            <button
              className="link-btn"
              onClick={() =>
                set(path, { condition: { type: 'apoli:constant', value: true }, origins: value ? [value] : [] }, false)
              }
            >
              Make conditional
            </button>
          </div>,
        )
      return (
        <GroupField
          label={label}
          path={path}
          name={name}
          fields={dataType('layer_entry')!.fields}
          onRemove={onRemove}
        />
      )
    case 'hud_render':
      if (Array.isArray(value)) return row(<JsonInput id={id} value={value} onChange={(v) => set(path, v)} />, true)
      return (
        <GroupField label={label} path={path} name={name} fields={dataType('hud_render')!.fields} onRemove={onRemove} />
      )
    case 'object':
      return (
        <GroupField
          label={label}
          path={path}
          name={name}
          fields={[...(spec.base ? (dataType(spec.base)?.fields ?? []) : []), ...(spec.fields ?? [])]}
          onRemove={onRemove}
        />
      )
    default: {
      const dt = dataType(k)
      if (dt && (value === undefined || isObject(value)))
        return <GroupField label={label} path={path} name={name} fields={dt.fields} onRemove={onRemove} />
      return row(<JsonInput id={id} value={value} onChange={(v) => set(path, v)} />, true)
    }
  }
}

function placeholderFor(spec: FieldKind) {
  switch (spec.kind) {
    case 'item_tag':
    case 'block_tag':
    case 'entity_type_tag':
    case 'fluid_tag':
    case 'biome_tag':
    case 'tag':
      return 'minecraft:logs'
    case 'identifier':
    case 'registry':
      return 'namespace:id'
    default:
      return defaultHint(spec)
  }
}

// a string, or a json text component for formatting
interface TextFieldProps {
  path: Path
  id?: string
  multiline?: boolean
  ariaLabel?: string
  placeholder?: string
  className?: string
  // new values are written as {"text": ...}, power names need that since a plain string is a translation key
  component?: boolean
}

export function TextField({ path, id, multiline, ariaLabel, placeholder, className = '', component }: TextFieldProps) {
  const { get, set } = useDoc()
  const value = get(path)
  // a text component that is only {"text": "..."} edits like plain text and keeps its shape
  const plainComponent =
    isObject(value) && Object.keys(value).length === 1 && typeof value.text === 'string'
  if (value !== undefined && typeof value !== 'string' && !plainComponent) {
    return (
      <div>
        <JsonInput id={id} value={value} onChange={(v) => set(path, v)} />
        <div className="field-note">Formatted text (JSON text component).</div>
      </div>
    )
  }
  const props = {
    id,
    'aria-label': ariaLabel,
    placeholder,
    className: `input ${className}`,
    value: plainComponent ? (value.text as string) : typeof value === 'string' ? value : '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const text = e.target.value
      if (plainComponent || (value === undefined && component)) set([...path, 'text'], text)
      else set(path, text)
    },
  }
  return multiline ? <textarea rows={3} {...props} /> : <input {...props} />
}

function VectorInput({ path }: { path: Path }) {
  const { get, set } = useDoc()
  const v = get(path)
  const obj = isObject(v) ? v : {}
  return (
    <div className="inline-row vector">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <label key={axis} className="vector-axis">
          <span>{axis}</span>
          <NumberInput ariaLabel={axis} value={obj[axis]} onChange={(n) => set([...path, axis], n ?? 0)} />
        </label>
      ))}
    </div>
  )
}


interface ObjectFieldsProps {
  fields: FieldSpec[]
  path: Path
  // keys handled somewhere else, like type or name on a power
  skip?: string[]
  // keys that are not fields but should not be shown as unknown (multiple sub-powers)
  ignoreUnknown?: (key: string, value: Json) => boolean
  collapseOptional?: boolean
}

export function ObjectFields({ fields, path, skip = [], ignoreUnknown, collapseOptional = true }: ObjectFieldsProps) {
  const { get, set } = useDoc()
  const { technical } = useWs()
  const obj = get(path)
  const value = isObject(obj) ? obj : {}
  const shown = fields.filter((f) => !skip.includes(f.name) && (f.required || f.name in value))
  const optional = fields.filter((f) => !skip.includes(f.name) && !f.required && !(f.name in value))
  const known = new Set([...fields.map((f) => f.name), ...skip, 'type'])
  const unknown = Object.keys(value).filter((key) => !known.has(key) && !ignoreUnknown?.(key, value[key]))

  const optionalFields = (
    <div className="option-chips">
      {optional.map((f) => (
        <button
          key={f.name}
          type="button"
          className="chip"
          title={technical ? f.name : `Add ${fieldLabel(f.name)}`}
          onClick={() => set([...path, f.name], starterValue(f) as Json, false)}
        >
          + {fieldLabel(f.name)}
        </button>
      ))}
    </div>
  )

  return (
    <div className="object-fields">
      {shown.map((f) => (
        <FieldEditor
          key={f.name}
          spec={f}
          name={f.name}
          path={[...path, f.name]}
          onRemove={f.required ? undefined : () => set([...path, f.name], undefined, false)}
        />
      ))}
      {unknown.map((key) => (
        <FieldRow
          key={key}
          label={key}
          path={[...path, key]}
          onRemove={() => set([...path, key], undefined, false)}
          block
        >
          <JsonInput value={value[key]} onChange={(v) => set([...path, key], v)} />
        </FieldRow>
      ))}
      {optional.length > 0 && (collapseOptional ? (
        <details className="more-options">
          <summary>
            More options <span className="count">{optional.length}</span>
          </summary>
          {optionalFields}
        </details>
      ) : optionalFields)}
    </div>
  )
}

function GroupField({
  label,
  path,
  name,
  fields,
  onRemove,
}: {
  label: string
  path: Path
  name: string
  fields: FieldSpec[]
  onRemove?: () => void
}) {
  return (
    <FieldRow label={label} path={path} name={name} onRemove={onRemove} block>
      <div className="group-box">
        <ObjectFields fields={fields} path={path} />
      </div>
    </FieldRow>
  )
}


export function useTypePicker(category: Category, onPick: (o: PickerOption) => void) {
  const [open, setOpen] = useState(false)
  const { technical } = useWs()
  const options = useMemo(() => typeOptions(category), [category])
  const element = open ? (
    <TypePicker
      title={`Choose a ${CATEGORY_LABELS[category].toLowerCase()}`}
      options={options}
      technical={technical}
      onClose={() => setOpen(false)}
      onPick={(o) => {
        setOpen(false)
        onPick(o)
      }}
    />
  ) : null
  return { open: () => setOpen(true), element }
}

export function templateJson(t: Template): Json {
  return (t.json ?? skeleton(t.category as Category, t.id)) as Json
}

// an action or condition field that can be empty
function TypedSlot({
  category,
  path,
  label,
  name,
  required,
  onRemove,
}: {
  category: Category
  path: Path
  label: string
  name: string
  required: boolean
  onRemove?: () => void
}) {
  const { get, set } = useDoc()
  const value = get(path)
  const picker = useTypePicker(category, (t) => set(path, templateJson(t), false))
  const kindLabel = CATEGORY_LABELS[category].toLowerCase()
  if (value === undefined) {
    return (
      <FieldRow label={label} path={path} name={name} block>
        <button type="button" className={'add-slot' + (required ? ' required' : '')} onClick={picker.open}>
          + Add {kindLabel}
        </button>
        {picker.element}
      </FieldRow>
    )
  }
  return (
    <FieldRow label={label} path={path} name={name} block>
      <TypedCard category={category} path={path} onRemove={onRemove ?? (() => set(path, undefined, false))} />
    </FieldRow>
  )
}

interface CardProps {
  category: Category
  path: Path
  onRemove?: () => void
  handle?: { attributes: object; listeners: object | undefined }
  extraActions?: ReactNode
}

export function TypedCard({ category, path, onRemove, handle, extraActions }: CardProps) {
  const { get, set } = useDoc()
  const { technical, ws } = useWs()
  const value = get(path)
  const obj = isObject(value) ? value : {}
  const typeId = typeof obj.type === 'string' ? obj.type : ''
  const spec = resolveType(category, typeId)
  const info = spec ? typeInfo(category, spec.id) : null
  const [open, setOpen] = useState(true)
  const { errors, warnings } = useNestedIssueCount(path)
  const focus = ws.state.focus
  useEffect(() => {
    if (focus && startsWith(focus.at, path) && focus.at.length > path.length) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  const picker = useTypePicker(category, (o) => {
    // keep inverted when switching, the rest belongs to the old type
    const next = skeleton(category, o.id) as Record<string, Json>
    if (obj.inverted !== undefined) next.inverted = obj.inverted
    set(path, next, false)
  })

  const isCondition = category.endsWith('_condition')
  const bodyId = useId()
  return (
    <div className={`card typed-card cat-${category}` + (open ? ' open' : '')} data-path={pathKey(path)}>
      <div className="card-head">
        {handle && (
          <button
            type="button"
            className="drag-handle"
            aria-label="Drag to reorder (or focus and use space and arrow keys)"
            {...handle.attributes}
            {...handle.listeners}
          >
            ⠿
          </button>
        )}
        <button
          type="button"
          className="collapse-btn"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? '▾' : '▸'}
        </button>
        <div className="card-title">
          <span className="card-kind">{CATEGORY_LABELS[category]}</span>
          <button type="button" className="type-btn" onClick={picker.open} title="Change type">
            {isCondition && obj.inverted === true && <span className="not-badge">NOT</span>}
            {info?.label ?? (typeId || 'Choose type')}
          </button>
          {technical && typeId && <code className="field-key">{typeId}</code>}
          {typeId.startsWith('viridian:') && <span className="badge mod-only">Viridian only</span>}
        </div>
        {errors > 0 && (
          <span className="issue-badge error" title={`${errors} error(s)`}>
            {errors}
          </span>
        )}
        {warnings > 0 && (
          <span className="issue-badge warning" title={`${warnings} warning(s)`}>
            {warnings}
          </span>
        )}
        <div className="card-actions">
          {extraActions}
          {onRemove && (
            <button type="button" className="icon-btn small" onClick={onRemove} aria-label="Remove" title="Remove">
              🗑
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="card-body" id={bodyId}>
          {info?.description && <p className="card-desc">{info.description}</p>}
          {!spec && typeId && (
            <div className="field-msg warning">
              Viridian doesn't know "{typeId}". It is kept as it is, edit it as JSON below.
            </div>
          )}
          {spec ? (
            <ObjectFields fields={isCondition ? [...spec.fields, INVERTED] : spec.fields} path={path} />
          ) : (
            <JsonInput value={value} onChange={(v) => set(path, v ?? {})} />
          )}
        </div>
      )}
      {picker.element}
    </div>
  )
}

const INVERTED: FieldSpec = { name: 'inverted', kind: 'boolean', required: false, default: false }


function asList(value: Json | undefined): Json[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

interface ListProps {
  spec: FieldKind
  path: Path
  name: string
  label: string
  onRemove?: () => void
}

export function ListField({ spec, path, name, label, onRemove }: ListProps) {
  const { get, set, file } = useDoc()
  const raw = get(path)
  const items = asList(raw)
  const of = spec.of ?? { kind: 'json' }
  const typed = isCategory(of.kind) && of.kind !== 'power_type' ? (of.kind as Category) : null
  const listId = `${file}|${pathKey(path)}`

  const write = (next: Json[]) => set(path, next, false)
  const move = (from: number, to: number) => write(moveItem(items, from, to))
  const insert = (index: number, t: Template) => write(insertItem(items, index, templateJson(t)))
  const picker = useTypePicker(typed ?? 'entity_action', (t) => insert(items.length, t))

  return (
    <FieldRow label={label} path={path} spec={spec} name={name} onRemove={onRemove} block>
      <SortableList listId={listId} count={items.length}>
        {!Array.isArray(raw) && raw !== undefined && (
          <div className="field-note">Written as a single value, adding more turns it into a list.</div>
        )}
        {items.map((_, i) => (
          <SortableItem key={i} listId={listId} index={i} move={move}>
            {(handle) => {
              const itemPath = Array.isArray(raw) ? [...path, i] : path
              const controls = (
                <>
                  <button
                    type="button"
                    className="icon-btn small"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    aria-label="Move up"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn small"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, i + 1)}
                    aria-label="Move down"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn small"
                    onClick={() => write(insertItem(items, i + 1, structuredClone(items[i])))}
                    aria-label="Duplicate"
                    title="Duplicate"
                  >
                    ⧉
                  </button>
                </>
              )
              const remove = () => write(items.filter((__, j) => j !== i))
              if (typed)
                return (
                  <TypedCard
                    category={typed}
                    path={itemPath}
                    handle={handle}
                    onRemove={remove}
                    extraActions={controls}
                  />
                )
              return (
                <div className="list-row">
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label="Drag to reorder"
                    {...handle.attributes}
                    {...handle.listeners}
                  >
                    ⠿
                  </button>
                  <div className="list-row-body">
                    <FieldEditor spec={of} path={itemPath} name={name.replace(/s$/, '')} label={`#${i + 1}`} />
                  </div>
                  <div className="card-actions">
                    {controls}
                    <button
                      type="button"
                      className="icon-btn small"
                      onClick={remove}
                      aria-label="Remove"
                      title="Remove"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            }}
          </SortableItem>
        ))}
        {typed ? (
          <button type="button" className="add-slot" onClick={picker.open}>
            + Add {CATEGORY_LABELS[typed].toLowerCase()}
          </button>
        ) : (
          <button type="button" className="add-slot" onClick={() => write([...items, starterValue(of) as Json])}>
            + Add
          </button>
        )}
      </SortableList>
      {picker.element}
    </FieldRow>
  )
}

function WeightedListField({ spec, path, name, label, onRemove }: ListProps) {
  const { get, set, file } = useDoc()
  const raw = get(path)
  const items = Array.isArray(raw) ? raw : []
  const of = spec.of ?? { kind: 'json' }
  const typed = isCategory(of.kind) ? (of.kind as Category) : null
  const listId = `${file}|${pathKey(path)}`
  const write = (next: Json[]) => set(path, next, false)
  const move = (from: number, to: number) => write(moveItem(items, from, to))
  const insert = (index: number, t: Template) =>
    write(insertItem(items, index, { element: templateJson(t), weight: 1 }))
  const picker = useTypePicker(typed ?? 'entity_action', (t) => insert(items.length, t))
  return (
    <FieldRow label={label} path={path} spec={spec} name={name} onRemove={onRemove} block>
      <SortableList listId={listId} count={items.length}>
        {items.map((_, i) => (
          <SortableItem key={i} listId={listId} index={i} move={move}>
            {(handle) => (
              <div className="weighted-item">
                <div className="card-actions">
                  <button type="button" aria-label="Move choice up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move choice down"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Remove choice"
                    onClick={() => write(items.filter((__, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
                <FieldEditor spec={{ kind: 'int' }} path={[...path, i, 'weight']} name="weight" label="Weight" />
                {typed ? (
                  <TypedCard
                    category={typed}
                    path={[...path, i, 'element']}
                    handle={handle}
                    onRemove={() => write(items.filter((__, j) => j !== i))}
                  />
                ) : (
                  <FieldEditor spec={of} path={[...path, i, 'element']} name="element" />
                )}
              </div>
            )}
          </SortableItem>
        ))}
        <button type="button" className="add-slot" onClick={picker.open}>
          + Add choice
        </button>
      </SortableList>
      {picker.element}
    </FieldRow>
  )
}
