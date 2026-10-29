// the main editing page: the origin's basics and preview on top, its powers as an accordion below
import { useEffect, useState } from 'react'
import { dataType, skeleton } from '../../catalog/catalog'
import { builtins } from '../../catalog/builtins'
import { insertItem, moveItem, setIn } from '../../model/edit'
import { isObject, type Json } from '../../model/json'
import { classify, entriesOf, pathFor, uniqueId, type Project } from '../../model/project'
import { useWs, type Template } from '../../state/context'
import { useDoc } from '../../state/doc'
import { SortableItem, SortableList } from '../../ui/dnd'
import { powerDisplay } from '../../ui/text'
import { impactUrl } from '../../ui/assets'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, PlusIcon } from '../../ui/icons'
import { ObjectFields, TextField } from '../fields/Fields'
import { JsonPanel } from '../JsonPanel'
import { McIdPicker } from '../McPicker'
import { OriginPreview } from '../OriginPreview'
import { TypePicker, typeOptions, type PickerOption } from '../TypePicker'
import { PowerRow } from './PowerRow'
import { grantedPowers, helperOwners, removalBatch, unusedPowers } from './powers'
import { resolveRef } from '../../model/validate'

function powerOptions(project: Project): PickerOption[] {
  const inPack = entriesOf(project, 'power').map((e) => e.info.id!)
  const existing = [
    ...inPack.map((id) => ({ id, group: 'In this pack' })),
    ...Object.keys(builtins.powers)
      .filter((id) => !inPack.includes(id))
      .map((id) => ({ id, group: 'Built-in' })),
  ]
  return [
    ...typeOptions('power_type'),
    ...existing.map(({ id, group }) => {
      const display = powerDisplay(project, id, project.namespace)
      return {
        category: 'existing_power',
        id,
        label: display.name,
        description: display.description,
        group,
        modOnly: id.startsWith('viridian:'),
      }
    }),
  ]
}

const IMPACTS = ['None', 'Low', 'Medium', 'High']

// which power rows are open, by power id
export function useExpanded() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string, open = !expanded.has(id)) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  return [expanded, toggle] as const
}

export function OriginPage() {
  const { json, set, file } = useDoc()
  const { ws, technical } = useWs()
  const [picking, setPicking] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [expanded, toggle] = useExpanded()
  const project = ws.state.project
  const info = classify(file, project.root)
  const ns = info.namespace ?? project.namespace
  const obj = isObject(json) ? json : {}
  const powers = Array.isArray(obj.powers) ? obj.powers : []
  const rawImpact = obj.impact
  const impact =
    typeof rawImpact === 'string'
      ? IMPACTS.findIndex((i) => i.toLowerCase() === rawImpact.toLowerCase())
      : (rawImpact ?? 0)
  const iconValue = isObject(obj.icon) ? obj.icon.item : obj.icon


  // export links and variable chips point at power files, open the matching row
  const focus = ws.state.focus
  useEffect(() => {
    const target = focus && classify(focus.file, project.root)
    if (target?.kind === 'power') toggle(target.id!, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  // hidden cooldowns and resource bars show inside the power that uses them, not as their own row
  const owners = helperOwners(project, ns, powers)
  const refId = (ref: Json) => (typeof ref === 'string' ? resolveRef(ref, ns) : '')
  const rows = powers.map((_, i) => i).filter((i) => !owners.has(refId(powers[i])))
  const helpersOf = (id: string) => [...owners].filter(([, owner]) => owner === id).map(([h]) => h)
  const granted = grantedPowers(project)
  const elsewhere = (id: string) => [...granted].some(([path, ids]) => path !== file && ids.has(id))
  const [notice, setNotice] = useState('')

  // moves are in visible rows, the helpers keep their place relative to the rest
  const move = (from: number, to: number) => set(['powers'], moveItem(powers, rows[from], rows[to]), false)
  const remove = (i: number) => {
    const { files, deleted } = removalBatch(project, file, ns, powers, i)
    ws.batch(files)
    const name = powerDisplay(project, String(powers[i]), ns).name
    setNotice(deleted.length ? `Deleted ${name}. Undo brings it back.` : `Removed ${name} from this origin.`)
  }
  const add = (t: Template) => {
    if (t.category === 'existing_power') {
      set(['powers'], [...powers, t.id], false)
      return
    }
    const id = uniqueId(project, 'power', t.label)
    ws.batch({
      [pathFor(project, 'power', id)]: { ...skeleton('power_type', t.id), name: { text: t.label } } as Json,
      [file]: setIn(json, ['powers'], insertItem(powers, powers.length, id)),
    })
    toggle(id, true)
  }

  const listId = `${file}|powers`
  return (
    <div className="origin-page">
      <div className="origin-top">
        <section className="origin-basics" data-file={file} data-path="">
          <div className="origin-title-row" data-path="name">
            <div data-path="icon">
              <McIdPicker
                tile
                list="items"
                ariaLabel="Origin icon"
                value={typeof iconValue === 'string' ? iconValue : undefined}
                onChange={(id) => set(isObject(obj.icon) ? ['icon', 'item'] : ['icon'], id, false)}
              />
            </div>
            <TextField path={['name']} ariaLabel="Origin name" placeholder="Origin name" className="origin-name" />
          </div>
          {technical && <code>{info.id}</code>}
          <div data-path="description">
            <TextField
              path={['description']}
              multiline
              ariaLabel="Origin description"
              placeholder="Describe the origin. This shows on the selection screen."
              className="origin-description"
            />
          </div>
          <div className="impact-row" data-path="impact">
            <div className="impact-segments" role="group" aria-label="Difficulty">
              {IMPACTS.map((label, n) => (
                <button
                  key={label}
                  className={`impact-${n}`}
                  aria-pressed={impact === n}
                  onClick={() => set(['impact'], n, false)}
                >
                  <img src={impactUrl(n)} alt="" />
                  {label}
                </button>
              ))}
            </div>
            <span className="impact-label">Difficulty</span>
          </div>
          <details className="origin-advanced">
            <summary>Advanced options</summary>
            <ObjectFields
              fields={dataType('origin')!.fields}
              collapseOptional={false}
              path={[]}
              skip={['name', 'description', 'icon', 'impact', 'powers']}
            />
          </details>
          <button className="ghost small" aria-pressed={showJson} onClick={() => setShowJson(!showJson)}>
            {showJson ? 'Hide JSON' : 'Show JSON'}
          </button>
          {showJson && <JsonPanel />}
        </section>
        <aside className="origin-preview-box" aria-label="Origin preview">
          <OriginPreview />
        </aside>
      </div>

      <section className="origin-powers" data-file={file} data-path="powers">
        <button className="primary add-power" onClick={() => setPicking(true)}>
          <PlusIcon size={15} /> Add power
        </button>
        {!powers.length && <p className="powers-empty">No powers yet. Add one to give this origin its first ability.</p>}
        {notice && (
          <p className="field-note" role="status">
            {notice}
          </p>
        )}
        <SortableList listId={listId} count={rows.length}>
          {rows.map((i, row) => {
            const ref = powers[i]
            const id = typeof ref === 'string' ? powerDisplay(project, ref, ns).id : ''
            const kept = elsewhere(id)
            return (
              <SortableItem key={`${i}:${String(ref)}`} listId={listId} index={row} move={move}>
                {(handle) => (
                  <div data-path={`powers/${i}`}>
                    <PowerRow
                      powerRef={ref}
                      namespace={ns}
                      helpers={helpersOf(id)}
                      open={expanded.has(id)}
                      onToggle={() => toggle(id)}
                      handle={handle}
                      actions={(name) => (
                        <>
                          <button
                            aria-label={`Move ${name} up`}
                            title="Move up"
                            disabled={row === 0}
                            onClick={() => move(row, row - 1)}
                          >
                            <ArrowUpIcon size={14} />
                          </button>
                          <button
                            aria-label={`Move ${name} down`}
                            title="Move down"
                            disabled={row === rows.length - 1}
                            onClick={() => move(row, row + 1)}
                          >
                            <ArrowDownIcon size={14} />
                          </button>
                          <button
                            aria-label={kept ? `Remove ${name} from this origin` : `Delete ${name}`}
                            title={kept ? 'Remove from this origin (another origin still has it)' : 'Delete power'}
                            onClick={() => remove(i)}
                          >
                            <CloseIcon size={14} />
                          </button>
                        </>
                      )}
                    />
                  </div>
                )}
              </SortableItem>
            )
          })}
        </SortableList>
      </section>

      <UnusedPowers
        expanded={expanded}
        toggle={toggle}
        addToOrigin={(id) => set(['powers'], [...powers, id], false)}
      />

      {picking && (
        <TypePicker
          title="Add a power"
          options={powerOptions(project)}
          technical={technical}
          onClose={() => setPicking(false)}
          onPick={(t) => {
            add(t)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

// powers in the pack that no origin grants, like freshly made variables or leftovers from an import
export function UnusedPowers({
  expanded,
  toggle,
  addToOrigin,
}: {
  expanded: Set<string>
  toggle: (id: string, open?: boolean) => void
  addToOrigin?: (id: string) => void
}) {
  const { ws } = useWs()
  const project = ws.state.project
  const unused = unusedPowers(project)
  const [open, setOpen] = useState(false)
  const focus = ws.state.focus
  useEffect(() => {
    if (focus && unused.some((e) => e.path === focus.file)) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])
  if (!unused.length) return null
  return (
    <details className="unused-powers" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Not in any origin <span className="count">{unused.length}</span>
      </summary>
      <p className="field-note">
        These powers are in the pack, but no origin gives them to players, so they do nothing in game. Add them to this
        origin or delete them.
      </p>
      {unused.map((e) => (
        <PowerRow
          key={e.path}
          powerRef={e.info.id!}
          namespace={e.info.namespace!}
          open={expanded.has(e.info.id!)}
          onToggle={() => toggle(e.info.id!)}
          actions={(name) => (
            <>
              {addToOrigin && (
                <button className="card-edit" onClick={() => addToOrigin(e.info.id!)}>
                  Add to origin
                </button>
              )}
              <button aria-label={`Delete ${name}`} title="Delete power" onClick={() => ws.deleteFile(e.path)}>
                <CloseIcon size={14} />
              </button>
            </>
          )}
        />
      ))}
    </details>
  )
}
