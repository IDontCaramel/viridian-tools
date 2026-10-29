import { useId, useState } from 'react'
import { dataType, resolveType, skeleton, typeInfo } from '../../catalog/catalog'
import { renameKey } from '../../model/edit'
import { isObject, type Json } from '../../model/json'
import { POWER_COMMON } from '../../model/validate'
import { useDoc } from '../../state/doc'
import { useWs } from '../../state/context'
import { FieldEditor, ObjectFields, TypedCard, useTypePicker } from '../fields/Fields'
import { Block } from '../blocks/Blocks'
import { Variables } from '../blocks/Variables'
import { JsonPanel } from '../JsonPanel'

const VIEW_KEY = 'viridian-workshop.power-view'

function usePowerView() {
  const [view, setView] = useState<'blocks' | 'forms'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'forms' ? 'forms' : 'blocks'
    } catch {
      return 'blocks'
    }
  })
  const change = (next: 'blocks' | 'forms') => {
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
  const [showJson, setShowJson] = useState(false)
  const subPowers = multiple ? Object.keys(obj).filter((key) => !POWER_COMMON.includes(key) && isObject(obj[key])) : []
  const isSubPower = (key: string, value: Json) => multiple && !POWER_COMMON.includes(key) && isObject(value)
  const display = (
    <section className="editor-section">
      <h2>Display</h2>
      {['name', 'description', 'hidden'].map((name) => (
        <FieldEditor
          key={name}
          path={[name]}
          name={name}
          spec={common.find((f) => f.name === name) ?? { kind: name === 'hidden' ? 'boolean' : 'text' }}
        />
      ))}
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
            <button aria-pressed={view === 'forms'} onClick={() => setView('forms')}>
              Forms
            </button>
          </div>
          <button className="ghost" aria-pressed={showJson} onClick={() => setShowJson(!showJson)}>
            {showJson ? 'Hide JSON' : 'Show JSON'}
          </button>
        </div>
      </div>
      {showJson && <JsonPanel />}
      {view === 'blocks' ? (
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
      ) : (
        display
      )}
      {view === 'blocks' ? (
        display
      ) : (
        <section className="editor-section">
          <h2>Behavior</h2>
          {!spec && (
            <p className="notice warning">This type is not in Viridian's catalog. Its fields are preserved below.</p>
          )}
          <ObjectFields
            fields={[...(spec?.fields ?? []), ...common]}
            path={[]}
            skip={['type', 'name', 'description', 'hidden', 'badges', 'loading_priority']}
            ignoreUnknown={(key, value) => multiple && !POWER_COMMON.includes(key) && isObject(value)}
          />
          {multiple && (
            <>
              {Object.entries(obj)
                .filter(([key, value]) => !POWER_COMMON.includes(key) && isObject(value))
                .map(([key]) => (
                  <div className="sub-power" key={key}>
                    <SubPowerKey
                      value={key}
                      onRename={(next) => {
                        if (!/^[a-z0-9_./-]+$/.test(next) || (next !== key && next in obj) || POWER_COMMON.includes(next))
                          return false
                        if (next !== key) set([], renameKey(obj, key, next), false)
                        return true
                      }}
                    />
                    <TypedCard category="power_type" path={[key]} onRemove={() => set([key], undefined, false)} />
                  </div>
                ))}
              <button className="add-slot" onClick={subPicker.open}>
                + Add sub-power
              </button>
            </>
          )}
        </section>
      )}
      <details className="editor-section">
        <summary>Advanced options</summary>
        <ObjectFields
          fields={common}
          path={[]}
          skip={[
            ...Object.keys(obj).filter((k) => !['badges', 'loading_priority'].includes(k)),
            ...common.filter((f) => !['badges', 'loading_priority'].includes(f.name)).map((f) => f.name),
          ]}
        />
      </details>
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
