// resource and cooldown powers work like scratch variables. they are their own power files, but a player
// only has them when an origin grants them, so this panel makes them next to the power that uses them,
// grants them to the same origins and edits their settings in place
import { useState } from 'react'
import { resolveType } from '../../catalog/catalog'
import { insertItem } from '../../model/edit'
import { isObject, type Json } from '../../model/json'
import { classify, pathFor, uniqueId } from '../../model/project'
import { resolveRef } from '../../model/validate'
import { FileCtx, useWs } from '../../state/context'
import { useDoc } from '../../state/doc'
import { originDisplay, powerDisplay } from '../../ui/text'
import { FieldEditor } from '../fields/Fields'
import { grantedPowers, variableKind, variablesUsedBy, type VariableKind } from '../origin/powers'

const SETTINGS: Record<VariableKind, string[]> = {
  resource: ['min', 'max', 'start_value'],
  cooldown: ['cooldown'],
}

export const KIND_LABEL: Record<VariableKind, string> = { resource: 'Resource bar', cooldown: 'Cooldown' }

export function Variables() {
  const { ws } = useWs()
  const { file, json } = useDoc()
  const project = ws.state.project
  const info = classify(file, project.root)
  const ns = info.namespace ?? project.namespace
  const powerId = info.id
  // made here this session but not used by a block yet, so they don't vanish from the panel
  const [made, setMade] = useState<string[]>([])
  const usedIds = variablesUsedBy(project, json, ns).filter((id) => id !== powerId)
  const used = [...usedIds, ...made.filter((id) => !usedIds.includes(id) && project.files[pathFor(project, 'power', id)])]
  // the origins this power is part of, new variables go to the same ones
  const owners = powerId
    ? [...grantedPowers(project)].filter(([, ids]) => ids.has(powerId)).map(([path]) => path)
    : []
  const ownCooldown = resolveType('power_type', isObject(json) ? json.type : undefined)?.fields.some(
    (f) => f.name === 'cooldown',
  )

  // origin json with the refs added right after this power
  const granting = (ids: string[], files: Record<string, Json | null> = {}) => {
    for (const path of owners) {
      const origin = (files[path] ?? project.files[path]?.json) as Json
      if (!isObject(origin)) continue
      const originNs = classify(path, project.root).namespace ?? ns
      let powers = Array.isArray(origin.powers) ? origin.powers : []
      const has = (id: string) => powers.some((r) => typeof r === 'string' && resolveRef(r, originNs) === id)
      let at = powers.findIndex((r) => typeof r === 'string' && resolveRef(r, originNs) === powerId) + 1 || powers.length
      for (const id of ids) {
        if (has(id)) continue
        powers = insertItem(powers, at++, id)
      }
      files[path] = { ...origin, powers }
    }
    return files
  }

  const create = (kind: VariableKind) => {
    const own = powerId ? powerDisplay(project, powerId, ns).name : 'Power'
    const base = `${own} ${kind === 'resource' ? 'bar' : 'cooldown'}`
    const id = uniqueId(project, 'power', base)
    const name = { text: base }
    const varJson: Json =
      kind === 'resource'
        ? { type: 'apoli:resource', name, min: 0, max: 10, start_value: 0, hidden: true }
        : { type: 'apoli:cooldown', name, cooldown: 100, hidden: true }
    const files = granting([id], { [pathFor(project, 'power', id)]: varJson })
    // a new cooldown works right away: started by the trigger's actions and checked by its condition
    if (kind === 'cooldown' && isObject(json)) {
      const wired = wireCooldown(json, id)
      if (wired) files[file] = wired
    }
    ws.batch(files)
    setMade((m) => [...m, id])
  }

  return (
    <div className="variables">
      <div className="section-head">
        <h3>Cooldowns and resource bars</h3>
      </div>
      {used.length > 0 ? (
        <ul className="variable-cards">
          {used.map((id) => {
            const path = pathFor(project, 'power', id)
            const kind = variableKind(project.files[path]?.json)!
            const missing = owners.filter((o) => {
              const originNs = classify(o, project.root).namespace ?? ns
              const json = project.files[o]?.json
              const refs = isObject(json) && Array.isArray(json.powers) ? json.powers : []
              return !refs.some((r) => typeof r === 'string' && resolveRef(r, originNs) === id)
            })
            return (
              <li key={id} className={`variable-card kind-${kind}`}>
                <div className="variable-card-head">
                  <span className="variable-kind">{KIND_LABEL[kind]}</span>
                  <strong title={id}>{powerDisplay(project, id, ns).name}</strong>
                </div>
                <FileCtx.Provider value={path}>
                  <VariableSettings kind={kind} />
                </FileCtx.Provider>
                {missing.length > 0 && (
                  <div className="notice warning variable-missing">
                    <span>
                      {missing.map((o) => originDisplay(project.files[o]?.json, classify(o, project.root).id!).name).join(', ')}{' '}
                      {missing.length === 1 ? "doesn't" : "don't"} give the player this {KIND_LABEL[kind].toLowerCase()}, so the
                      blocks using it won't work in game.
                    </span>
                    <button className="secondary small" onClick={() => ws.batch(granting([id]))}>
                      Add it to the origin
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="field-note">
          {ownCooldown
            ? 'This trigger has its own cooldown on the block above. Make a separate cooldown only to share one timer between powers.'
            : 'Count something or time something across blocks and powers.'}
        </p>
      )}
      <div className="inline-row">
        <button className="secondary small" onClick={() => create('cooldown')}>
          + New cooldown
        </button>
        <button className="secondary small" onClick={() => create('resource')}>
          + New resource bar
        </button>
      </div>
      <p className="field-note">
        Use them with the "Start", "is ready", "Change" and "value" blocks under Variables in the block picker.
        {owners.length > 0 && ' New ones are added to this origin for you, hidden from the selection screen.'}
      </p>
    </div>
  )
}

function wireCooldown(power: Record<string, Json>, id: string): Json | null {
  const spec = resolveType('power_type', power.type)
  const slot = spec?.fields.find((f) => f.kind === 'entity_action' && f.required)
    ?? spec?.fields.find((f) => f.kind === 'entity_action')
  const hasCondition = spec?.fields.some((f) => f.name === 'condition' && f.kind === 'entity_condition')
  if (!slot || !hasCondition) return null
  const start: Json = { type: 'apoli:trigger_cooldown', power: id }
  const ready: Json = { type: 'apoli:resource', resource: id, comparison: '<=', compare_to: 0 }
  const action = power[slot.name]
  const isNothing = isObject(action) && Object.keys(action).length === 1 && resolveType('entity_action', action.type)?.id === 'apoli:nothing'
  const isAnd = isObject(action) && resolveType('entity_action', action.type)?.id === 'apoli:and' && Array.isArray(action.actions)
  const nextAction =
    action === undefined || isNothing
      ? start
      : isAnd
        ? { ...action, actions: [...(action.actions as Json[]), start] }
        : { type: 'apoli:and', actions: [action, start] }
  const condition = power.condition
  const nextCondition = condition === undefined ? ready : { type: 'apoli:and', conditions: [condition, ready] }
  return { ...power, [slot.name]: nextAction, condition: nextCondition }
}

function VariableSettings({ kind }: { kind: VariableKind }) {
  const fields = resolveType('power_type', `apoli:${kind}`)?.fields ?? []
  return (
    <div className="variable-settings">
      {SETTINGS[kind].map((name) => {
        const spec = fields.find((f) => f.name === name)
        return spec ? <FieldEditor key={name} path={[name]} name={name} spec={spec} /> : null
      })}
    </div>
  )
}
