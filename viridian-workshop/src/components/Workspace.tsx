import { useEffect, useMemo, useState } from 'react'
import { mainLayerWith, originJson } from '../model/create'
import { pathKey } from '../model/edit'
import { isObject } from '../model/json'
import { classify, entriesOf, uniqueId, type Project } from '../model/project'
import { saveDraft } from '../model/storage'
import { validateProject } from '../model/validate'
import { Ctx, FileCtx } from '../state/context'
import { useWorkspace } from '../state/store'
import { DndProvider } from '../ui/dnd'
import { DownloadIcon, PlusIcon, RedoIcon, SettingsIcon, UndoIcon } from '../ui/icons'
import { iconItem, originDisplay } from '../ui/text'
import { PackEditor } from './editors/PackEditor'
import { ExportDialog } from './ExportDialog'
import { JsonPanel } from './JsonPanel'
import { McItemIcon } from './McPicker'
import { Modal } from './Modal'
import { OriginPage, UnusedPowers, useExpanded } from './origin/OriginPage'
import { grantedPowers } from './origin/powers'
import { Logo } from '../ui/Logo'

// the page that shows a file: powers live inside the origin that grants them
function pageFor(project: Project, file: string, current: string) {
  const info = classify(file, project.root)
  if (info.kind !== 'power') return file
  const granted = grantedPowers(project)
  if (granted.get(current)?.has(info.id!)) return current
  for (const [origin, ids] of granted) if (ids.has(info.id!)) return origin
  // not granted anywhere, it shows under unused powers on any origin page
  return granted.has(current) ? current : ([...granted.keys()][0] ?? '')
}

export function Workspace({ project, onClose }: { project: Project; onClose: () => void }) {
  const ws = useWorkspace(project, entriesOf(project, 'origin')[0]?.path ?? null)
  const [technical, setTechnical] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const issues = useMemo(() => validateProject(ws.state.project), [ws.state.project])
  const page = ws.state.selected ?? ''
  const current = ws.state.project.files[page]
  const kind = classify(page, ws.state.project.root).kind
  const origins = entriesOf(ws.state.project, 'origin')
  const granted = useMemo(() => grantedPowers(ws.state.project), [ws.state.project])

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'z' || k === 'y') {
        e.preventDefault()
        if (k === 'y' || e.shiftKey) ws.redo()
        else ws.undo()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [ws.undo, ws.redo])

  useEffect(() => {
    const focus = ws.state.focus
    if (!focus) return
    const target = pageFor(ws.state.project, focus.file, page)
    if (target !== page) ws.select(target)
    // wait for the page to switch and the power row to expand
    const timer = window.setTimeout(() => {
      const containers = Array.from(document.querySelectorAll<HTMLElement>('.editor [data-file]')).filter(
        (c) => c.dataset.file === focus.file,
      )
      // only fields of this file, not of power editors nested inside an origin
      const candidates = containers.flatMap((c) =>
        [c, ...c.querySelectorAll<HTMLElement>('[data-path]')].filter((el) => el.closest('[data-file]') === c),
      )
      const at = [...focus.at]
      let el: HTMLElement | undefined
      while (!el) {
        el = candidates.find((e) => e.dataset.path === pathKey(at))
        if (!at.length) break
        at.pop()
      }
      if (!el) return
      let parent = el.parentElement
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true
        parent = parent.parentElement
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.querySelector<HTMLElement>('input,textarea,select,button')?.focus()
      el.classList.add('flash')
      window.setTimeout(() => el?.classList.remove('flash'), 1800)
    }, 60)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.state.focus])

  const createOrigin = () => {
    const project = ws.state.project
    const id = uniqueId(project, 'origin', name)
    const path = ws.pathFor('origin', id)
    const layer = mainLayerWith(project, id)
    ws.batch({ [path]: originJson(name.trim()), ...(layer && { [layer.path]: layer.json }) })
    ws.select(path)
    setCreating(false)
    setName('')
  }

  const openPackSettings = () => {
    const meta = `${ws.state.project.root}pack.mcmeta`
    if (!ws.state.project.files[meta])
      ws.addFile(meta, { pack: { description: ws.state.project.name, min_format: 121, max_format: 121 } })
    else ws.select(meta)
  }

  return (
    <Ctx.Provider value={{ ws, issues, technical }}>
      <DndProvider>
        <div className="workspace">
          <header className="workspace-bar">
            <button
              className="brand compact"
              onClick={async () => {
                try {
                  await saveDraft(ws.state.project)
                  onClose()
                } catch {
                  setNotice('Could not save the draft. Export your pack before closing this editor.')
                }
              }}
              aria-label="Back to projects"
            >
              <Logo />
            </button>
            <span className="bar-sep" aria-hidden="true">
              /
            </span>
            <input
              className="project-name"
              aria-label="Project name"
              value={ws.state.project.name}
              onChange={(e) => ws.setMeta({ name: e.target.value })}
            />
            <span
              className={'save-status ' + ws.saveStatus}
              role="status"
              title="Drafts are saved in this browser and don't sync to other devices"
            >
              {ws.saveStatus === 'saved'
                ? 'Saved locally'
                : ws.saveStatus === 'saving'
                  ? 'Saving…'
                  : 'Not saved, export to keep your work'}
            </span>
            <div className="bar-actions">
              <div className="history-buttons">
                <button
                  className="icon-btn"
                  disabled={!ws.state.past.length}
                  onClick={ws.undo}
                  aria-label="Undo"
                  title="Undo (Ctrl/Cmd+Z)"
                >
                  <UndoIcon />
                </button>
                <button
                  className="icon-btn"
                  disabled={!ws.state.future.length}
                  onClick={ws.redo}
                  aria-label="Redo"
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                >
                  <RedoIcon />
                </button>
              </div>
              <label className="toggle technical-toggle" title="Show ids and raw type names">
                <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} />
                <span className="toggle-track" aria-hidden="true">
                  <span className="toggle-thumb" />
                </span>
                <span className="technical-label">Technical details</span>
              </label>
              <button className="primary" onClick={() => setExporting(true)}>
                <DownloadIcon />
                Export
                {issues.length > 0 && (
                  <span className="export-count" title={`${issues.length} problems`}>
                    {issues.length}
                  </span>
                )}
              </button>
            </div>
          </header>
          {notice && (
            <p role="alert" className="notice warning">
              {notice}
            </p>
          )}
          <div className="workspace-body">
            <nav className="sidebar" aria-label="Origins">
              <div className="section-head">
                <h2>
                  Origins
                  {origins.length > 0 && <span className="sidebar-count">{origins.length}</span>}
                </h2>
                <button className="icon-btn" aria-label="New origin" title="New origin" onClick={() => setCreating(true)}>
                  <PlusIcon size={15} />
                </button>
              </div>
              {origins.map((e) => {
                const powers = granted.get(e.path)
                const problems = issues.filter(
                  (i) => i.file === e.path || powers?.has(classify(i.file, ws.state.project.root).id ?? ''),
                )
                const json = e.file.json
                return (
                  <button
                    className={'file-link' + (e.path === page ? ' active' : '')}
                    key={e.path}
                    onClick={() => ws.select(e.path)}
                    title={e.info.id}
                  >
                    <McItemIcon id={iconItem(isObject(json) ? json.icon : undefined)} size={18} />
                    <span className="file-name">
                      <span className="file-path">{originDisplay(json, e.info.id!).name}</span>
                      {technical && <small>{e.info.id}</small>}
                    </span>
                    {problems.length > 0 && (
                      <span
                        className={
                          'issue-dot' + (problems.some((i) => i.severity === 'error') ? ' error' : ' warning')
                        }
                        title={`${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`}
                      />
                    )}
                  </button>
                )
              })}
              {!origins.length && <p className="sidebar-empty">No origins yet</p>}
              <button className={'file-link settings' + (kind === 'meta' ? ' active' : '')} onClick={openPackSettings}>
                <SettingsIcon size={14} />
                Pack settings
              </button>
            </nav>
            <FileCtx.Provider value={page}>
              <main className="editor" key={page}>
                {current?.hadComments && (
                  <p className="notice warning">
                    This file contains comments. Editing it will remove the comments on export.
                  </p>
                )}
                {!current ? (
                  <EmptyPage hasOrigins={origins.length > 0} onCreate={() => setCreating(true)} />
                ) : current.parseError ? (
                  <div data-file={page} data-path="">
                    <h1>Repair JSON</h1>
                    <p className="notice error">{current.parseError}</p>
                    <JsonPanel />
                  </div>
                ) : kind === 'origin' ? (
                  <OriginPage />
                ) : kind === 'meta' ? (
                  <div data-file={page} data-path="">
                    <PackEditor />
                  </div>
                ) : (
                  <div data-file={page} data-path="">
                    <div className="editor-heading">
                      <h1>{page}</h1>
                      <p>The workshop has no editor for this file. It is kept in the pack, edit it as JSON here.</p>
                    </div>
                    <JsonPanel />
                  </div>
                )}
              </main>
            </FileCtx.Provider>
          </div>
        </div>
        {exporting && <ExportDialog onClose={() => setExporting(false)} />}
        {creating && (
          <Modal title="Create an origin" onClose={() => setCreating(false)}>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createOrigin()
              }}
            >
              <label className="form-label">
                Origin name
                <input className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="form-actions">
                <button type="button" className="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button className="primary" disabled={!name.trim()}>
                  Create origin
                </button>
              </div>
            </form>
          </Modal>
        )}
      </DndProvider>
    </Ctx.Provider>
  )
}

function EmptyPage({ hasOrigins, onCreate }: { hasOrigins: boolean; onCreate: () => void }) {
  const [expanded, toggle] = useExpanded()
  return (
    <>
      <div className="panel-empty">
        <h1>{hasOrigins ? 'Pick an origin' : 'No origins yet'}</h1>
        <p>{hasOrigins ? 'Choose an origin in the sidebar to edit it.' : 'Create an origin to start adding powers.'}</p>
        {!hasOrigins && (
          <button className="primary" onClick={onCreate}>
            <PlusIcon size={15} /> Create origin
          </button>
        )}
      </div>
      <UnusedPowers expanded={expanded} toggle={toggle} />
    </>
  )
}
