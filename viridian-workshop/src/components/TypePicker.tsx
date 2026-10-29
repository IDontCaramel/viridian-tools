// searchable list of types (and existing powers) to pick from, used as a modal
import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_LABELS, typeInfo, typesIn, type Category } from '../catalog/catalog'
import type { Template } from '../state/context'
import { Modal } from './Modal'

export interface PickerOption extends Template {
  group: string
  description: string
  modOnly?: boolean
}

export function typeOptions(category: Category): PickerOption[] {
  return typesIn(category)
    .filter((t) => !isHiddenAlias(t.id))
    .map((t) => {
      const info = typeInfo(category, t.id)
      return {
        category,
        id: t.id,
        label: info.label,
        description: info.description,
        group: info.group,
        modOnly: t.id.startsWith('viridian:'),
      }
    })
    .sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.label.localeCompare(b.label))
}

// the origins: copies of apoli types are the same thing, keep the list short
function isHiddenAlias(id: string) {
  return id.startsWith('origins:') && id !== 'origins:origin' && id !== 'origins:action_on_callback'
}

const GROUPS = [
  'Quick blocks',
  'Variables',
  'Logic',
  'General',
  'Triggers',
  'State',
  'Attributes',
  'Movement',
  'Survival',
  'Restrictions',
  'Items',
  'Visual',
  'In this pack',
  'Built-in',
  'Other',
]
function groupOrder(g: string) {
  const i = GROUPS.indexOf(g)
  return i === -1 ? GROUPS.length : i
}

export function filterOptions(options: PickerOption[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return options
  const words = q.split(/\s+/)
  return options.filter((o) => {
    const hay = `${o.label} ${o.id} ${o.description} ${o.group}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

interface Props {
  title: string
  options: PickerOption[]
  onPick: (option: PickerOption) => void
  onClose: () => void
  technical: boolean
}

export function TypePicker({ title, options, onPick, onClose, technical }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const filtered = useMemo(() => filterOptions(options, query), [options, query])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[index]) {
      e.preventDefault()
      onPick(filtered[index])
    }
  }

  let lastGroup = ''
  return (
    <Modal title={title} onClose={onClose} wide>
      <input
        className="picker-search"
        autoFocus
        placeholder="Search, for example: fly, damage, key, water"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        aria-label="Search"
        role="combobox"
        aria-expanded="true"
        aria-controls="picker-list"
        aria-activedescendant={filtered[index] ? `picker-${index}` : undefined}
      />
      <ul className="picker-list" id="picker-list" role="listbox" ref={listRef}>
        {filtered.length === 0 && <li className="picker-empty">Nothing matches "{query}".</li>}
        {filtered.map((o, i) => {
          const header = o.group !== lastGroup && !query ? o.group : null
          lastGroup = o.group
          return (
            <li key={`${o.category}:${o.id}`} role="presentation">
              {header && <div className="picker-group">{header}</div>}
              <button
                type="button"
                role="option"
                id={`picker-${i}`}
                data-index={i}
                aria-selected={i === index}
                className={'picker-option' + (i === index ? ' active' : '')}
                onMouseEnter={() => setIndex(i)}
                onClick={() => onPick(o)}
              >
                <span className="picker-label">
                  {o.label}
                  {o.modOnly && <span className="badge mod-only">Viridian only</span>}
                  {query && <span className="picker-group-inline">{o.group}</span>}
                </span>
                {o.description && <span className="picker-desc">{o.description}</span>}
                {technical && <code className="picker-id">{o.id}</code>}
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

export function categoryTitle(category: string) {
  return CATEGORY_LABELS[category as Category] ?? category
}
