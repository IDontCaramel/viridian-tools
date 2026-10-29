// searchable item, block, effect and sound pickers with icons, instead of typing ids
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ID_PATTERN } from '../model/project'
import { faceTint, findEntry, textureUrl, useMcRegistry, type Face, type Icon, type McEntry, type McList } from '../mc/registry'
import { SoundIcon } from '../ui/icons'
import { TextInput } from './fields/inputs'
import { Modal } from './Modal'
import scriptOptions from '../mc/script-options.json'

const TITLES: Record<McList, string> = {
  items: 'Choose an item',
  blocks: 'Choose a block',
  effects: 'Choose an effect',
  sounds: 'Choose a sound',
  entities: 'Choose an entity',
  particles: 'Choose a particle',
  keys: 'Choose an ability key',
}
const PLACEHOLDERS: Record<McList, string> = {
  items: 'minecraft:stone',
  blocks: 'minecraft:stone',
  effects: 'minecraft:speed',
  sounds: 'minecraft:entity.player.levelup',
  entities: 'minecraft:arrow',
  particles: 'minecraft:flame',
  keys: 'Primary ability',
}
const LIST_FOR_KIND: Record<string, McList> = {
  item: 'items',
  block: 'blocks',
  status_effect: 'effects',
  sound_event: 'sounds',
  particle: 'particles',
  particle_type: 'particles',
  key: 'keys',
}

// catalog field kinds that get a picker
export function mcListFor(kind: string, registry?: string): McList | undefined {
  if (kind === 'registry' && registry === 'entity_type') return 'entities'
  return LIST_FOR_KIND[kind]
}

const KEY_ENTRIES: McEntry[] = [
  { id: 'key.origins.primary_active', name: 'Primary ability' },
  { id: 'key.origins.secondary_active', name: 'Secondary ability' },
  { id: 'key.use', name: 'Use item' },
  { id: 'key.attack', name: 'Attack' },
  { id: 'key.sneak', name: 'Sneak' },
  { id: 'key.jump', name: 'Jump' },
  { id: 'key.saveToolbarActivator', name: 'Save toolbar' },
  { id: 'key.loadToolbarActivator', name: 'Load toolbar' },
]
const KEY_ALIASES: Record<string, string> = {
  primary: 'key.origins.primary_active', none: 'key.origins.primary_active',
  secondary: 'key.origins.secondary_active',
}

// rendering every sound or item row at once makes typing laggy
const SHOWN = 150

function FaceImage({ face, className }: { face: Face; className?: string }) {
  const url = `url("${textureUrl(face)}")`
  const tint = faceTint(face)
  // tinted textures are grey in the jar, multiply them with the tint and clip to the texture's own alpha
  const style: CSSProperties = tint
    ? { backgroundImage: url, backgroundColor: tint, backgroundBlendMode: 'multiply', maskImage: url, WebkitMaskImage: url }
    : { backgroundImage: url }
  return <span className={'mc-face ' + (className ?? '')} style={style} />
}

export function McIcon({ icon, list, size = 32 }: { icon?: Icon; list: McList; size?: number }) {
  const style = { '--mc-size': `${size}px` } as CSSProperties
  if (!icon)
    return (
      <span className="mc-icon empty" style={style} aria-hidden="true">
        {list === 'sounds' ? <SoundIcon size={size * 0.6} /> : '?'}
      </span>
    )
  return (
    <span className="mc-icon" style={style} aria-hidden="true">
      {'cube' in icon ? (
        <span className="mc-cube">
          <FaceImage face={icon.cube[0]} className="top" />
          <FaceImage face={icon.cube[1]} className="left" />
          <FaceImage face={icon.cube[2]} className="right" />
        </span>
      ) : (
        icon.layers.map((face, i) => <FaceImage key={i} face={face} />)
      )}
    </span>
  )
}

function search(entries: McEntry[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  const words = q.split(/\s+/)
  const hits = entries.filter((e) => {
    const hay = `${e.name} ${e.id}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  const rank = (e: McEntry) => (e.name.toLowerCase().startsWith(q) || e.id.slice(e.id.indexOf(':') + 1).startsWith(q) ? 0 : 1)
  return hits.sort((a, b) => rank(a) - rank(b))
}

interface PickerProps {
  list: McList
  value: string | undefined
  onChange: (id: string) => void
  id?: string
  ariaLabel?: string
  // small inline button for the blocks view
  compact?: boolean
  // just a big icon, for the origin icon
  tile?: boolean
  parameterless?: boolean
}

// falls back to a plain id input when the assets were not extracted
export function McIdPicker({ list, value, onChange, id, ariaLabel, compact, tile, parameterless }: PickerProps) {
  const registry = useMcRegistry()
  const [open, setOpen] = useState(false)
  const entries: McEntry[] | undefined = list === 'keys' ? KEY_ENTRIES
    : list === 'entities' || list === 'particles' ? scriptOptions[list] : registry?.[list]
  if (registry === null && !entries)
    return (
      <TextInput id={id} ariaLabel={ariaLabel} value={value ?? ''} mono placeholder={PLACEHOLDERS[list]} onChange={onChange} />
    )
  const entry = value ? (list === 'keys' ? entries?.find((e) => e.id === (KEY_ALIASES[value] ?? value)) : findEntry(entries, value)) : undefined
  return (
    <>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        className={'mc-pick' + (compact ? ' compact' : '') + (tile ? ' tile' : '')}
        disabled={!entries}
        onClick={() => setOpen(true)}
        title={entry ? `${entry.name} (${entry.id})` : value}
      >
        {!['entities', 'particles', 'keys'].includes(list) && <McIcon icon={entry?.icon} list={list} size={tile ? 40 : compact ? 18 : 24} />}
        {!tile && (
          <span className="mc-pick-text">
            <span className="mc-pick-name">{entry?.name ?? (value || 'Choose…')}</span>
            {!compact && value && <code>{value}</code>}
          </span>
        )}
        {!tile && <span aria-hidden="true">▾</span>}
      </button>
      {open && entries && (
        <McPickerDialog
          list={list}
          parameterless={parameterless}
          entries={entries}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            setOpen(false)
            onChange(picked)
          }}
        />
      )}
    </>
  )
}

function McPickerDialog({
  list,
  entries,
  parameterless,
  onPick,
  onClose,
}: {
  list: McList
  entries: McEntry[]
  parameterless?: boolean
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const results = useMemo(() => search(entries.filter((e) => !parameterless || !e.requiresParams), query), [entries, query, parameterless])
  const shown = results.slice(0, SHOWN)
  // modded or datapack ids aren't in the vanilla lists, let them be typed in
  const custom = list === 'keys' ? query.trim() : query.trim().toLowerCase()
  const offerCustom = (list === 'keys' ? /^key\.[a-zA-Z0-9_.]+$/.test(custom) : ID_PATTERN.test(custom)) && !entries.some((e) => e.id === (custom.includes(':') || list === 'keys' ? custom : `minecraft:${custom}`))
  const options = offerCustom ? [...shown, { id: custom, name: `Use "${custom}"` }] : shown

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && options[index]) {
      e.preventDefault()
      onPick(options[index].id)
    }
  }

  return (
    <Modal title={TITLES[list]} onClose={onClose} wide>
      <input
        className="picker-search"
        autoFocus
        placeholder="Search by name or id"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        aria-label="Search"
        role="combobox"
        aria-expanded="true"
        aria-controls="mc-picker-list"
        aria-activedescendant={options[index] ? `mc-picker-${index}` : undefined}
      />
      {parameterless && <p className="field-note">Particles that need extra data, such as dust or block particles, can be configured in the advanced JSON panel using the object form.</p>}
      <ul className="picker-list mc-list" id="mc-picker-list" role="listbox" ref={listRef}>
        {options.length === 0 && <li className="picker-empty">Nothing matches "{query}".</li>}
        {options.map((e, i) => (
          <li key={e.id + i} role="presentation">
            <button
              type="button"
              role="option"
              id={`mc-picker-${i}`}
              data-index={i}
              aria-selected={i === index}
              className={'mc-option' + (i === index ? ' active' : '')}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onPick(e.id)}
            >
              {!['entities', 'particles', 'keys'].includes(list) && <McIcon icon={'icon' in e ? e.icon : undefined} list={list} />}
              <span className="mc-option-name">{e.name}</span>
              <code>{e.id}</code>
            </button>
          </li>
        ))}
      </ul>
      {results.length > SHOWN && (
        <p className="field-note">
          Showing {SHOWN} of {results.length}. Keep typing to narrow it down.
        </p>
      )}
    </Modal>
  )
}

// icon for an item id where it is only shown, like the origin list and preview
export function McItemIcon({ id, size }: { id: string; size?: number }) {
  const registry = useMcRegistry()
  return <McIcon icon={findEntry(registry?.items, id)?.icon} list="items" size={size} />
}
