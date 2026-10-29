import { useId, useState } from 'react'
import { dataType, resolveType, skeleton, typeInfo } from '../../catalog/catalog'
import { renameKey } from '../../model/edit'
import { isObject, type Json } from '../../model/json'
import { POWER_COMMON } from '../../model/validate'
import { useDoc } from '../../state/doc'
import { useWs } from '../../state/context'
import { ObjectFields, TextField, useTypePicker } from '../fields/Fields'
import { Block } from '../blocks/Blocks'
import { Variables } from '../blocks/Variables'
import { JsonPanel } from '../JsonPanel'

const VIEW_KEY = 'viridian-workshop.power-view'

function usePowerView() {
  const [view, setView] = useState<'blocks' | 'json'>(() => {
    try {
      return ['json', 'forms'].includes(localStorage.getItem(VIEW_KEY) ?? '') ? 'json' : 'blocks'
    } catch {
      return 'blocks'
    }
  })
  const change = (next: 'blocks' | 'json') => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // private mode, the choice just won't stick
    }
  }
  return [view, change] as const
}

export function PowerEditor() {
  const { json, set } = useDoc()
  const { technical } = useWs()
  const obj = isObject(json) ? json : {}
  const spec = resolveType('power_type', obj.type)
  const info = spec ? typeInfo('power_type', spec.id) : null
  const multiple = spec?.id === 'apoli:multiple'
  const picker = useTypePicker('power_type', (t) => {
    const next = skeleton('power_type', t.id) as Record<string, Json>
    for (const key of POWER_COMMON) if (key !== 'type' && obj[key] !== undefined) next[key] = obj[key]
    set([], next, false)
  })
  const subPicker = useTypePicker('power_type', (t) => {
    let key = 'power'
    let n = 2
    while (key in obj) key = `power_${n++}`
    set([key], skeleton('power_type', t.id) as Json, false)
  })
  const common = dataType('power')?.fields ?? []
  const [view, setView] = usePowerView()
  const subPowers = multiple ? Object.keys(obj).filter((key) => !POWER_COMMON.includes(key) && isObject(obj[key])) : []
  const isSubPower = (key: string, value: Json) => multiple && !POWER_COMMON.includes(key) && isObject(value)
  // what the selection screen shows, first because it is what people name and describe first
  const display = (
    <section className="power-identity" data-path="name">
      <TextField path={['name']} component ariaLabel="Name" placeholder="Power name" className="power-name-input" />
      <div data-path="description">
        <TextField
          path={['description']}
          component
          multiline
          ariaLabel="Description"
          placeholder="Describe what this power does. This shows on the selection screen."
        />
      </div>
      <label className="toggle" data-path="hidden">
        <input
          type="checkbox"
          checked={obj.hidden === true}
          onChange={(e) => set(['hidden'], e.target.checked ? true : undefined, false)}
        />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
        Hide from the selection screen
      </label>
    </section>
  )
  return (
    <>
      <div className="power-toolbar">
        <p className="type-line">
          {String(obj.type).startsWith('viridian:') && <span className="badge mod-only">Viridian only</span>}
          {info?.description && <span>{info.description}</span>}
          {technical && <code>{String(obj.type ?? '')}</code>}
        </p>
        <div className="heading-actions">
          <button className="secondary" onClick={picker.open}>
            Change type
          </button>
          <div className="segments view-toggle" role="group" aria-label="Editor view">
            <button aria-pressed={view === 'blocks'} onClick={() => setView('blocks')}>
              Blocks
            </button>
            <button aria-pressed={view === 'json'} onClick={() => setView('json')}>
              JSON
            </button>
          </div>
        </div>
      </div>
      {view === 'json' ? <JsonPanel /> : (
        <>
          {display}
          <section className="editor-section">
            <div className="section-head">
              <h2>Script</h2>
              <span className="muted">Tap + to add a block</span>
            </div>
            <div className="script-area">
              <Block
                category="power_type"
                path={[]}
                hat={{ common, skip: ['name', 'description', 'hidden', 'badges', 'loading_priority'], ignore: isSubPower }}
              />
              {subPowers.map((key) => (
                <div className="sub-power script-sub" key={key}>
                  <SubPowerKey
                    value={key}
                    onRename={(next) => {
                      if (!/^[a-z0-9_./-]+$/.test(next) || (next !== key && next in obj) || POWER_COMMON.includes(next))
                        return false
                      if (next !== key) set([], renameKey(obj, key, next), false)
                      return true
                    }}
                  />
                  <Block
                    category="power_type"
                    path={[key]}
                    hat={{ common }}
                    menu={[{ label: 'Remove sub-power', onClick: () => set([key], undefined, false), danger: true }]}
                  />
                </div>
              ))}
              {multiple && (
                <button className="blk-add empty" onClick={subPicker.open}>
                  + Add sub-power
                </button>
              )}
            </div>
            <Variables />
          </section>
          <details className="editor-section">
            <summary>Advanced options</summary>
            <ObjectFields
              fields={common}
              collapseOptional={false}
              path={[]}
              skip={[
                ...Object.keys(obj).filter((k) => !['badges', 'loading_priority'].includes(k)),
                ...common.filter((f) => !['badges', 'loading_priority'].includes(f.name)).map((f) => f.name),
              ]}
            />
          </details>
        </>
      )}
      {picker.element}
      {subPicker.element}
    </>
  )
}

function SubPowerKey({ value, onRename }: { value: string; onRename: (next: string) => boolean }) {
  const [text, setText] = useState(value)
  const [error, setError] = useState(false)
  const id = useId()
  return (
    <div className="sub-power-key">
      <label className="form-label" htmlFor={id}>
        Sub-power key
      </label>
      <div className="inline-row">
        <input
          id={id}
          className="input mono"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(false)
          }}
        />
        {text !== value && <button onClick={() => setError(!onRename(text))}>Rename</button>}
      </div>
      {error && (
        <p className="field-msg error" role="alert">
          Use a unique resource path for this sub-power.
        </p>
      )}
    </div>
  )
}
