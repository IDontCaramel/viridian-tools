import { useEffect, useState } from 'react'
import type { Project } from '../model/project'
import { createOriginProject } from '../model/create'
import { importFolder, importZip } from '../model/zip'
import { deleteDraft, listDrafts, loadDraft, type DraftSummary } from '../model/storage'
import { Modal } from './Modal'
import { ChevronRightIcon, PlusIcon, TrashIcon, UploadIcon } from '../ui/icons'
import { Logo } from '../ui/Logo'

export function StartScreen({ onOpen }: { onOpen: (project: Project) => void }) {
  const [create, setCreate] = useState(false)
  const [name, setName] = useState('')
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () =>
    listDrafts()
      .then(setDrafts)
      .catch(() => setError('Local drafts are unavailable. You can still create, open and export packs.'))
  useEffect(() => {
    void refresh()
  }, [])
  async function open(task: () => Promise<Project | undefined>) {
    setBusy(true)
    setError('')
    try {
      const p = await task()
      if (p) onOpen(p)
      else setError('This draft is no longer available.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this datapack.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main
      className="start-screen"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) void open(() => importZip(file, file.name))
      }}
    >
      <header className="start-top">
        <span className="brand">
          <Logo size={28} />
          Viridian Workshop
        </span>
        <span className="version">Minecraft 26.3</span>
      </header>
      <section className="start-intro">
        <h1>Build Origins datapacks in your browser</h1>
        <p>Design origins and their powers visually.</p>
      </section>
      <section className="start-actions" aria-label="Get started">
        <button className="start-card create-card" onClick={() => setCreate(true)}>
          <span className="start-symbol">
            <PlusIcon size={18} />
          </span>
          <h2>Create an origin</h2>
          <p>Start a new pack from a blank origin.</p>
          <span className="start-link">
            Start creating <ChevronRightIcon size={14} />
          </span>
        </button>
        <div className="start-card">
          <span className="start-symbol">
            <UploadIcon size={18} />
          </span>
          <h2>Open a datapack</h2>
          <p>Import a zip or folder to keep editing it.</p>
          <div className="start-card-actions">
            <label className="button secondary">
              Choose a zip
              <input
                className="sr-only"
                type="file"
                accept=".zip"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void open(() => importZip(f, f.name))
                }}
              />
            </label>
            <label className="button ghost">
              Choose a folder
              <input
                className="sr-only"
                type="file"
                multiple
                {...{ webkitdirectory: '' }}
                disabled={busy}
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? [])
                  if (fs.length) void open(() => importFolder(fs))
                }}
              />
            </label>
          </div>
        </div>
      </section>
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="muted" role="status">
          Opening datapack…
        </p>
      )}
      <section className="drafts">
        <div className="section-head">
          <h2>Recent drafts</h2>
          <span className="muted">This browser only</span>
        </div>
        {drafts.length ? (
          <div className="draft-list">
            {drafts.map((d) => (
              <div className="draft-row" key={d.id}>
                <button onClick={() => void open(() => loadDraft(d.id))}>
                  <strong>{d.name}</strong>
                  <span>
                    {new Date(d.updatedAt).toLocaleDateString()} · {d.fileCount} files
                  </span>
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Delete draft ${d.name}`}
                  title="Delete draft"
                  onClick={() =>
                    void deleteDraft(d.id)
                      .then(refresh)
                      .catch(() => setError('Could not delete this draft.'))
                  }
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="drafts-empty">Your drafts will show up here once you start creating.</p>
        )}
      </section>
      {create && (
        <Modal title="Create an origin" onClose={() => setCreate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onOpen(createOriginProject(name.trim()))
            }}
          >
            <label className="form-label">
              Origin name
              <input
                autoFocus
                required
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="For example, Mosskeeper"
              />
            </label>
            <div className="form-actions">
              <button type="button" className="ghost" onClick={() => setCreate(false)}>
                Cancel
              </button>
              <button className="primary" disabled={!name.trim()}>
                Create origin
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  )
}
