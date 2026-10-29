// scratch style blocks over the same json the forms edit: every block is a json path,
// every change goes through useDoc so undo, validation and the json panel keep working
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  isConditionCategory,
  resolveType,
  skeleton,
  typeInfo,
  type Category,
  type FieldKind,
  type FieldSpec,
} from '../../catalog/catalog'
import { humanize } from '../../catalog/descriptions'
import { insertItem, moveItem, pathKey, type Path } from '../../model/edit'
import { isObject, type Json } from '../../model/json'
import { useWs, type Template } from '../../state/context'
import { useDoc, useFieldIssues, useNestedIssueCount } from '../../state/doc'
import { SortableItem, SortableList } from '../../ui/dnd'
import { fieldLabel, ObjectFields, templateJson, useSuggestions } from '../fields/Fields'
import { JsonInput, NumberInput, TextInput } from '../fields/inputs'
import { McIdPicker, mcListFor } from '../McPicker'
import { TypePicker, typeOptions, type PickerOption } from '../TypePicker'
import { familyOf, parseTemplate, placement, presetOptions, rowLabel, templateFor, type Piece } from './blockDefs'

type Handle = { attributes: object; listeners: object | undefined }

const COMPARISONS = ['>=', '>', '==', '!=', '<=', '<']

// the block picker: quick blocks and variables first, then every type in the catalog
export function useBlockPicker(category: Category, onPick: (o: PickerOption) => void) {
  const [open, setOpen] = useState(false)
  const { technical, ws } = useWs()
  const project = ws.state.project
  const options = useMemo(
    () => (open ? [...presetOptions(category, project), ...typeOptions(category)] : []),
    [category, project, open],
  )
  const kind = category === 'power_type' ? 'trigger' : isConditionCategory(category) ? 'condition' : 'block'
  const element = open ? (
    <TypePicker
      title={`Choose a ${kind}`}
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

function pickJson(o: Template): Json {
  return structuredClone(templateJson(o))
}


export interface HatOptions {
  // extra fields every power has (name, hidden, ...)
  common?: FieldSpec[]
  // fields edited somewhere else
  skip?: string[]
  // keys that are not unknown fields (sub-powers of a multiple power)
  ignore?: (key: string, value: Json) => boolean
}

interface BlockProps {
  category: Category
  path: Path
  handle?: Handle
  // move, duplicate, remove and so on, from whatever holds this block
  menu?: MenuItem[]
  hat?: HatOptions
}

export interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

export function Block({ category, path, handle, menu = [], hat }: BlockProps) {
  const { get, set } = useDoc()
  const { technical } = useWs()
  const value = get(path)
  const obj = isObject(value) ? value : {}
  const typeId = typeof obj.type === 'string' ? obj.type : ''
  const spec = resolveType(category, typeId)
  const info = spec ? typeInfo(category, spec.id) : null
  const isCondition = isConditionCategory(category)
  const { errors, warnings } = useNestedIssueCount(path)
  const picker = useBlockPicker(category, (o) => {
    const next = (o.json ? pickJson(o) : skeleton(category, o.id)) as Record<string, Json>
    // keep inverted and the power wide settings when switching, the rest belongs to the old type
    if (isCondition && obj.inverted !== undefined && next.inverted === undefined) next.inverted = obj.inverted
    if (hat) for (const f of hat.common ?? []) if (f.name !== 'type' && obj[f.name] !== undefined) next[f.name] = obj[f.name]
    if (hat && obj.condition !== undefined && next.condition === undefined) next.condition = obj.condition
    set(path, next, false)
  })

  const family = familyOf(category, typeId)
  const shape = hat ? 'blk-hat' : isCondition ? 'blk-cond' : 'blk-cmd'
  const tools = (
    <span className="blk-tools">
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
      <BlockMenu
        items={[
          { label: hat ? 'Change trigger' : 'Change block', onClick: picker.open },
          ...(isCondition && isObject(value)
            ? [
                {
                  label: obj.inverted === true ? 'Remove "not"' : 'Invert with "not"',
                  onClick: () => set([...path, 'inverted'], obj.inverted === true ? undefined : true, false),
                },
              ]
            : []),
          ...menu,
        ]}
      />
    </span>
  )
  const grip = handle && (
    <button
      type="button"
      className="blk-grip"
      aria-label="Drag to reorder (or focus and use space and arrow keys)"
      {...handle.attributes}
      {...handle.listeners}
    >
      ⠿
    </button>
  )

  if (!isObject(value) || !spec) {
    return (
      <div className={`blk ${shape} fam-unknown`} data-path={pathKey(path)}>
        <div className="blk-head">
          {grip}
          <span className="blk-text">{typeId || 'Unknown block'}</span>
          {technical && typeId && <code className="blk-id">{typeId}</code>}
          {tools}
        </div>
        <div className="blk-drawer open">
          <p className="field-msg warning">
            {typeId
              ? `Viridian doesn't know "${typeId}". It is kept as it is, edit it as JSON here.`
              : 'This is not a block Viridian can show. It is kept as it is, edit it as JSON here.'}
          </p>
          <JsonInput value={value} onChange={(v) => set(path, v ?? {})} />
        </div>
        {picker.element}
      </div>
    )
  }

  const skip = new Set(hat?.skip ?? [])
  const fields: FieldSpec[] = []
  for (const f of [...spec.fields, ...(hat?.common ?? [])])
    if (f.name !== 'type' && !fields.some((g) => g.name === f.name)) fields.push(f)
  const byName = new Map(fields.map((f) => [f.name, f]))
  const used = new Set<string>()

  const template = templateFor(category, spec.id)
  const pieces: Piece[] = template ? parseTemplate(template) : [{ text: info!.label }]
  const head: ReactNode[] = []
  pieces.forEach((p, i) => {
    if ('text' in p) {
      head.push(
        <span key={i} className="blk-text">
          {p.text}
        </span>,
      )
      return
    }
    const f = byName.get(p.field)
    if (!f || skip.has(f.name)) return
    const where = placement(f, obj[f.name])
    if (where !== 'inline' && where !== 'condition') return
    used.add(f.name)
    head.push(<InlineField key={i} spec={f} name={f.name} path={[...path, f.name]} />)
  })
  // other simple settings that are set or required go after the sentence
  for (const f of fields) {
    if (used.has(f.name) || skip.has(f.name)) continue
    if (placement(f, obj[f.name]) !== 'inline' || !(f.required || f.name in obj)) continue
    used.add(f.name)
    head.push(
      <span key={f.name} className="blk-labeled">
        <span className="blk-lbl">{fieldLabel(f.name).toLowerCase()}</span>
        <InlineField
          spec={f}
          name={f.name}
          path={[...path, f.name]}
          onRemove={f.required ? undefined : () => set([...path, f.name], undefined, false)}
        />
      </span>,
    )
  }

  // fields that hold other blocks get their own row, empty ones included so there is a place to drop
  const rows: ReactNode[] = []
  let conditionRows = 0
  for (const f of fields) {
    if (used.has(f.name) || skip.has(f.name)) continue
    const where = placement(f, obj[f.name])
    if (where === 'inline' || where === 'drawer') continue
    if (!f.required && obj[f.name] === undefined && !(hat && f.name === 'condition')) continue
    used.add(f.name)
    const kind = (where === 'stack_list' || where === 'condition_list' ? f.of!.kind : f.kind) as Category
    const row = <SlotRow key={f.name} spec={f} where={where} category={kind} path={[...path, f.name]} />
    // conditions read best right under the sentence, before the stacks they guard
    if (where === 'condition' || where === 'condition_list') rows.splice(conditionRows++, 0, row)
    else rows.push(row)
  }

  const drawerSkip = [...used, ...skip, 'type', ...(isCondition ? ['inverted'] : [])]
  const known = new Set([...fields.map((f) => f.name), ...drawerSkip])
  const drawerShown = fields.filter((f) => !drawerSkip.includes(f.name) && (f.required || f.name in obj))
  const drawerOptional = fields.filter((f) => !drawerSkip.includes(f.name) && !f.required && !(f.name in obj))
  const unknown = Object.keys(obj).filter((k) => !known.has(k) && !hat?.ignore?.(k, obj[k]))

  return (
    <div className={`blk ${shape} fam-${family}`} data-path={pathKey(path)}>
      <div className="blk-head">
        {grip}
        {isCondition && obj.inverted === true && (
          <button
            type="button"
            className="blk-not on"
            aria-pressed="true"
            title="Inverted: true becomes false. Click to remove."
            onClick={() => set([...path, 'inverted'], undefined, false)}
          >
            not
          </button>
        )}
        {head}
        {typeId.startsWith('viridian:') && <span className="badge mod-only">Viridian only</span>}
        {technical && <code className="blk-id">{typeId}</code>}
        {tools}
      </div>
      {rows}
      {(drawerShown.length > 0 || drawerOptional.length > 0 || unknown.length > 0) && (
        <Drawer
          defaultOpen={drawerShown.length > 0 || unknown.length > 0}
          count={drawerShown.length + unknown.length}
          extra={drawerOptional.length}
        >
          <ObjectFields fields={fields} path={path} skip={drawerSkip} ignoreUnknown={hat?.ignore} />
        </Drawer>
      )}
      {picker.element}
    </div>
  )
}

function Drawer({
  defaultOpen,
  count,
  extra,
  children,
}: {
  defaultOpen: boolean
  count: number
  extra: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={'blk-drawer' + (open ? ' open' : '')}>
      <button type="button" className="blk-drawer-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {count > 0 ? `Settings (${count})` : 'More options'}
        {!open && extra > 0 && count > 0 && <span className="muted"> +{extra} more</span>}
      </button>
      {open && (
        <div id={id} className="blk-drawer-body">
          {children}
        </div>
      )}
    </div>
  )
}

function SlotRow({
  spec,
  where,
  category,
  path,
}: {
  spec: FieldSpec
  where: 'stack' | 'stack_list' | 'condition' | 'condition_list'
  category: Category
  path: Path
}) {
  const name = String(path[path.length - 1])
  const label = rowLabel(name, fieldLabel(name))
  const issues = useFieldIssues(path)
  const isStack = where === 'stack' || where === 'stack_list'
  return (
    <div className={'blk-row' + (isStack ? ' has-mouth' : '')} data-path={pathKey(path)}>
      {label && (
        <span className="blk-row-label">
          {label}
          {spec.required && <span className="req">*</span>}
        </span>
      )}
      {where === 'stack' && <SlotStack category={category} path={path} />}
      {where === 'stack_list' && <ListStack category={category} path={path} />}
      {where === 'condition' && <ConditionSlot category={category} path={path} label={label || fieldLabel(name)} />}
      {where === 'condition_list' && <ConditionList category={category} path={path} />}
      {issues.map((i, n) => (
        <div key={n} className={`field-msg ${i.severity}`}>
          {i.message}
        </div>
      ))}
    </div>
  )
}


function InlineField({
  spec,
  name,
  path,
  onRemove,
}: {
  spec: FieldKind
  name: string
  path: Path
  onRemove?: () => void
}) {
  const { get, set } = useDoc()
  const issues = useFieldIssues(path)
  const value = get(path)
  const suggestions = useSuggestions(name, spec.kind)
  const label = fieldLabel(name)
  const k = spec.kind
  const bad = issues.some((i) => i.severity === 'error')
  const title = issues.map((i) => i.message).join('\n') || undefined
  const placeholder = spec.default !== undefined && typeof spec.default !== 'object' ? String(spec.default) : undefined
  let input: ReactNode
  if (k.endsWith('_condition')) {
    input = <ConditionSlot category={k as Category} path={path} label={label} inline />
  } else if (k === 'boolean') {
    const on = value === undefined ? spec.default === true : value === true
    input = (
      <button
        type="button"
        className={'blk-bool' + (value === undefined ? ' muted' : '')}
        aria-pressed={on}
        aria-label={label}
        onClick={() => set(path, !on, false)}
      >
        {on ? 'true' : 'false'}
      </button>
    )
  } else if (k === 'int' || k === 'float') {
    input = (
      <NumberInput
        ariaLabel={label}
        value={value}
        integer={k === 'int'}
        placeholder={placeholder}
        onChange={(v) => set(path, v ?? ('required' in spec && spec.required ? 0 : undefined))}
      />
    )
  } else if (k === 'enum' || k === 'comparison') {
    const values = k === 'comparison' ? COMPARISONS : (spec.values ?? [])
    input = (
      <select
        className="input"
        aria-label={label}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => set(path, e.target.value === '' ? undefined : e.target.value, false)}
      >
        {value === undefined && <option value="">{placeholder ?? '…'}</option>}
        {values.map((v) => (
          <option key={v} value={v}>
            {k === 'comparison' ? v : humanize(v).toLowerCase()}
          </option>
        ))}
        {typeof value === 'string' && !values.includes(value) && <option value={value}>{value}</option>}
      </select>
    )
  } else if (mcListFor(k, spec.registry) && (value === undefined || typeof value === 'string')) {
    input = <McIdPicker parameterless={k === 'particle'} compact ariaLabel={label} list={mcListFor(k, spec.registry)!} value={value} onChange={(v) => set(path, v, false)} />
  } else {
    input = (
      <TextInput
        ariaLabel={label}
        value={typeof value === 'string' ? value : ''}
        mono={k !== 'string'}
        placeholder={placeholder ?? (k === 'key' ? 'key.origins.primary_active' : label.toLowerCase())}
        suggestions={suggestions}
        onChange={(v) => set(path, v)}
      />
    )
  }
  return (
    <span className={'blk-field' + (bad ? ' has-error' : '')} data-path={pathKey(path)} title={title}>
      {input}
      {onRemove && (
        <button type="button" className="blk-x" onClick={onRemove} aria-label={`Remove ${label}`} title="Use the default">
          ✕
        </button>
      )}
    </span>
  )
}


interface StackModel {
  paths: Path[]
  move: (from: number, to: number) => void
  insert: (index: number, json: Json) => void
  remove: (index: number) => void
}

// a single action field shown as a stack: several blocks are stored as an "and" action,
// so only the "and" that is the field's own value is flattened, nested ones stay visible blocks
function useSlotModel(category: Category, path: Path): StackModel {
  const { get, set } = useDoc()
  const value = get(path)
  const isAnd =
    isObject(value) && resolveType(category, value.type)?.id === 'apoli:and' && Array.isArray(value.actions)
  if (isAnd) {
    const actions = (value as { actions: Json[] }).actions
    const at = [...path, 'actions']
    return {
      paths: actions.map((_, i) => [...at, i]),
      move: (from, to) => set(at, moveItem(actions, from, to), false),
      insert: (index, json) => set(at, insertItem(actions, index, json), false),
      // removing the last block clears the field, keeping an empty "and" around helps no one
      remove: (index) =>
        actions.length <= 1 ? set(path, undefined, false) : set(at, actions.filter((_, j) => j !== index), false),
    }
  }
  if (value === undefined)
    return { paths: [], move: () => {}, insert: (_, json) => set(path, json, false), remove: () => {} }
  // new types start with a "nothing" placeholder, the first real block takes its place
  const placeholder =
    isObject(value) && Object.keys(value).length === 1 && resolveType(category, value.type)?.id === 'apoli:nothing'
  return {
    paths: [path],
    move: () => {},
    insert: (index, json) =>
      set(path, placeholder ? json : { type: 'apoli:and', actions: index === 0 ? [json, value] : [value, json] }, false),
    remove: () => set(path, undefined, false),
  }
}

function useListModel(path: Path): StackModel {
  const { get, set } = useDoc()
  const raw = get(path)
  const items = Array.isArray(raw) ? raw : []
  return {
    paths: items.map((_, i) => [...path, i]),
    move: (from, to) => set(path, moveItem(items, from, to), false),
    insert: (index, json) => set(path, insertItem(items, index, json), false),
    remove: (index) => set(path, items.filter((_, j) => j !== index), false),
  }
}

function SlotStack({ category, path }: { category: Category; path: Path }) {
  return <Stack category={category} path={path} model={useSlotModel(category, path)} />
}

function ListStack({ category, path }: { category: Category; path: Path }) {
  return <Stack category={category} path={path} model={useListModel(path)} />
}

function Stack({ category, path, model }: { category: Category; path: Path; model: StackModel }) {
  const { file, get } = useDoc()
  const listId = `${file}|blocks|${pathKey(path)}`
  const count = model.paths.length
  const insert = (index: number, t: Template) => model.insert(index, pickJson(t))
  return (
    <div className="blk-mouth">
      <SortableList listId={listId} count={count}>
        {model.paths.map((p, i) => (
          <SortableItem key={i} listId={listId} index={i} move={model.move}>
            {(handle) => (
              <Block
                category={category}
                path={p}
                handle={count > 1 ? handle : undefined}
                menu={[
                  ...(count > 1
                    ? [
                        { label: 'Move up', onClick: () => model.move(i, i - 1), disabled: i === 0 },
                        { label: 'Move down', onClick: () => model.move(i, i + 1), disabled: i === count - 1 },
                      ]
                    : []),
                  { label: 'Duplicate', onClick: () => model.insert(i + 1, structuredClone(get(p) ?? {})) },
                  { label: 'Remove block', onClick: () => model.remove(i), danger: true },
                ]}
              />
            )}
          </SortableItem>
        ))}
        <AddBlock category={category} add={(t) => insert(count, t)} empty={!count} />
      </SortableList>
    </div>
  )
}

function AddBlock({ category, add, empty }: { category: Category; add: (t: Template) => void; empty: boolean }) {
  const picker = useBlockPicker(category, add)
  return (
    <>
      <button
        type="button"
        className={'blk-add' + (empty ? ' empty' : '')}
        onClick={picker.open}
      >
        + {empty ? 'Add a block' : 'Add'}
      </button>
      {picker.element}
    </>
  )
}


function ConditionSlot({
  category,
  path,
  label,
  inline,
}: {
  category: Category
  path: Path
  label: string
  inline?: boolean
}) {
  const { get, set } = useDoc()
  const value = get(path)
  const picker = useBlockPicker(category, (t) => set(path, pickJson(t), false))
  if (value === undefined)
    return (
      <div className={'blk-cond-slot' + (inline ? ' inline' : '')}>
        <button
          type="button"
          className="blk-cond-empty"
          onClick={picker.open}
          aria-label={`Add condition: ${label}`}
        >
          + condition
        </button>
        {picker.element}
      </div>
    )
  return (
    <div className={'blk-cond-slot filled' + (inline ? ' inline' : '')}>
      <Block
        category={category}
        path={path}
        menu={[{ label: 'Remove condition', onClick: () => set(path, undefined, false), danger: true }]}
      />
    </div>
  )
}

function ConditionList({ category, path }: { category: Category; path: Path }) {
  const { file } = useDoc()
  const model = useListModel(path)
  const listId = `${file}|blocks|${pathKey(path)}`
  const count = model.paths.length
  const insert = (index: number, t: Template) => model.insert(index, pickJson(t))
  return (
    <div className="blk-cond-list">
      <SortableList listId={listId} count={count}>
        {model.paths.map((p, i) => (
          <SortableItem key={i} listId={listId} index={i} move={model.move}>
            {(handle) => (
              <Block
                category={category}
                path={p}
                handle={count > 1 ? handle : undefined}
                menu={[{ label: 'Remove condition', onClick: () => model.remove(i), danger: true }]}
              />
            )}
          </SortableItem>
        ))}
        <AddCondition category={category} add={(t) => insert(count, t)} />
      </SortableList>
    </div>
  )
}

function AddCondition({ category, add }: { category: Category; add: (t: Template) => void }) {
  const picker = useBlockPicker(category, add)
  return (
    <>
      <button
        type="button"
        className="blk-cond-empty"
        onClick={picker.open}
      >
        + condition
      </button>
      {picker.element}
    </>
  )
}

// one small menu per block instead of a row of buttons, easier to read and to tap on a phone
function BlockMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const list = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return
        ref.current?.querySelector('button')?.focus()
      } else if (ref.current?.contains(e.target as Node) || list.current?.contains(e.target as Node)) return
      setOpen(null)
    }
    window.addEventListener('scroll', close, true)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])
  return (
    <span className="blk-menu" ref={ref}>
      <button
        type="button"
        className="blk-menu-btn"
        aria-label="Block options"
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-controls={id}
        onClick={(e) => {
          // the list lives in a portal so hexagon clipping and scroll areas can't cut it off
          const r = e.currentTarget.getBoundingClientRect()
          setOpen(open ? null : { top: r.bottom + 4, right: window.innerWidth - r.right })
        }}
      >
        ⋯
      </button>
      {open &&
        createPortal(
        <span className="blk-menu-list" role="menu" id={id} ref={list} style={{ top: open.top, right: open.right }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? 'danger' : undefined}
              disabled={item.disabled}
              onClick={() => {
                setOpen(null)
                item.onClick()
              }}
            >
              {item.label}
            </button>
          ))}
        </span>,
          document.body,
        )}
    </span>
  )
}
