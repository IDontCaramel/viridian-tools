// one power in the origin's list, collapsed to its name or expanded into the full power editor
import { useId, type ReactNode } from 'react'
import { resolveType, typeInfo } from '../../catalog/catalog'
import { builtins } from '../../catalog/builtins'
import { isObject, type Json } from '../../model/json'
import { FileCtx, useWs } from '../../state/context'
import { ChevronDownIcon, ChevronRightIcon, GripIcon } from '../../ui/icons'
import { powerDisplay } from '../../ui/text'
import { pathFor } from '../../model/project'
import { KIND_LABEL } from '../blocks/Variables'
import { variableKind } from './powers'
import { PowerEditor } from '../editors/PowerEditor'
import { JsonPanel } from '../JsonPanel'

interface Props {
  powerRef: Json
  // namespace of the origin, for refs written without one
  namespace: string
  open: boolean
  onToggle: () => void
  handle?: { attributes: object; listeners: object | undefined }
  // hidden cooldowns and resource bars that belong to this power, shown with it
  helpers?: string[]
  actions: (name: string) => ReactNode
}

export function PowerRow({ powerRef, namespace, open, onToggle, handle, helpers = [], actions }: Props) {
  const { ws, issues, technical } = useWs()
  const bodyId = useId()
  const project = ws.state.project
  const display =
    typeof powerRef === 'string'
      ? powerDisplay(project, powerRef, namespace)
      : { id: '', name: 'Invalid power reference', description: '', source: 'missing' as const, path: undefined }
  const file = display.path ? project.files[display.path] : undefined
  const json = file ? file.json : builtins.powers[display.id]
  const type = isObject(json) ? resolveType('power_type', json.type) : undefined
  const problems = display.path ? issues.filter((i) => i.file === display.path) : []
  const hasError = problems.some((i) => i.severity === 'error')

  return (
    <article className={'card power-card' + (open ? ' open' : '')} data-file={display.path} data-path="">
      <div className="card-head">
        {handle && (
          <button className="drag-handle" aria-label="Drag to reorder" {...handle.attributes} {...handle.listeners}>
            <GripIcon />
          </button>
        )}
        <button className="power-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          {open ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
          <strong>{display.name}</strong>
          {type && <span className="type-pill">{typeInfo('power_type', type.id).label}</span>}
          {display.source === 'builtin' && <span className="badge">Built-in</span>}
          {display.id.startsWith('viridian:') && <span className="badge mod-only">Viridian only</span>}
          {technical && <code>{String(powerRef)}</code>}
          {helpers.map((h) => {
            const kind = variableKind(project.files[pathFor(project, 'power', h)]?.json)
            return (
              <span key={h} className={`variable-tag kind-${kind}`} title={technical ? h : undefined}>
                {kind ? KIND_LABEL[kind] : 'Uses'}: {powerDisplay(project, h, namespace).name}
              </span>
            )
          })}
        </button>
        {problems.length > 0 && (
          <span
            className={'issue-dot' + (hasError ? ' error' : ' warning')}
            title={`${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`}
          />
        )}
        <div className="card-actions">{actions(display.name)}</div>
      </div>
      {!open && display.description && <p className="power-description">{display.description}</p>}
      {open && (
        <div className="power-body" id={bodyId}>
          {display.path && file ? (
            <FileCtx.Provider value={display.path}>
              {file.hadComments && (
                <p className="notice warning">This file contains comments. Editing it will remove them on export.</p>
              )}
              {file.parseError ? (
                <>
                  <p className="notice error">{file.parseError}</p>
                  <JsonPanel />
                </>
              ) : (
                <PowerEditor />
              )}
            </FileCtx.Provider>
          ) : display.source === 'builtin' ? (
            <p className="field-note">
              {display.description || 'No description.'} This power is built into the mod and can't be edited here.
            </p>
          ) : (
            <p className="notice warning">This power is not in the pack or built into the mod.</p>
          )}
        </div>
      )}
    </article>
  )
}
