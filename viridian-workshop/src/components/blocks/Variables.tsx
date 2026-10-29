// resource and cooldown powers work like scratch variables, this lists them and makes new ones
import { useState } from 'react'
import type { Json } from '../../model/json'
import { uniqueId } from '../../model/project'
import { useWs } from '../../state/context'
import { variablePowers } from './blockDefs'

export function Variables() {
  const { ws } = useWs()
  const [made, setMade] = useState<string | null>(null)
  const vars = variablePowers(ws.state.project)
  const create = (kind: 'resource' | 'cooldown') => {
    const id = uniqueId(ws.state.project, 'power', kind === 'resource' ? 'mana' : 'cooldown')
    const json: Json =
      kind === 'resource'
        ? { type: 'apoli:resource', min: 0, max: 10, start_value: 0, hidden: true }
        : { type: 'apoli:cooldown', cooldown: 100, hidden: true }
    ws.addFile(ws.pathFor('power', id), json, false)
    setMade(id)
  }
  return (
    <div className="variables">
      <div className="section-head">
        <h3>Variables</h3>
        <span className="muted">resources and cooldowns in this pack</span>
      </div>
      {vars.length ? (
        <div className="variable-list">
          {vars.map((id) => (
            <button key={id} className="variable-chip" onClick={() => ws.focus(ws.pathFor('power', id), [])} title={id}>
              {id.split(':')[1]}
            </button>
          ))}
        </div>
      ) : (
        <p className="field-note">No variables yet.</p>
      )}
      <p className="field-note">
        Use the "Change", "Set" and "value" blocks under Variables in the block picker to read and change them.
      </p>
      <div className="inline-row">
        <button onClick={() => create('resource')}>+ New resource</button>
        <button onClick={() => create('cooldown')}>+ New cooldown</button>
      </div>
      {made && (
        <p className="field-note" role="status">
          Created {made}. It is a hidden power and stays under Unused powers until an origin grants it.
        </p>
      )}
    </div>
  )
}
