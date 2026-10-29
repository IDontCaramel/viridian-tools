import { useState } from 'react'
import { slug } from '../model/project'
import { download, exportZip } from '../model/zip'
import { useWs } from '../state/context'
import { Modal } from './Modal'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { ws, issues } = useWs()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.length - errors
  const files = [...new Set(issues.map((i) => i.file))]
  const run = async () => {
    setBusy(true)
    try {
      download(await exportZip(ws.state.project), `${slug(ws.state.project.name) || 'datapack'}.zip`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export this pack.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Export datapack"
      onClose={onClose}
      wide
      footer={
        <button className="primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Preparing zip…' : errors ? 'Download zip with errors' : 'Download zip'}
        </button>
      }
    >
      <div className={'export-summary' + (errors ? ' has-errors' : warnings ? ' has-warnings' : ' ok')}>
        <strong>
          {errors
            ? `${errors} ${errors === 1 ? 'error needs' : 'errors need'} attention`
            : warnings
              ? `Ready, with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`
              : 'Your datapack is ready'}
        </strong>
        <span>
          {errors
            ? 'The mod may reject these files. You can still download your work.'
            : "Put the zip in your world's datapacks folder."}
        </span>
      </div>
      <p className="field-note">Select a problem to jump to it.</p>
      {error && <p role="alert">{error}</p>}
      {files.map((file) => (
        <section className="export-issues" key={file}>
          <h3>{file}</h3>
          {issues
            .filter((i) => i.file === file)
            .map((i, n) => (
              <button
                key={n}
                className={`issue-link ${i.severity}`}
                onClick={() => {
                  ws.focus(i.file, i.at)
                  onClose()
                }}
              >
                <span className="issue-icon" aria-hidden="true">
                  !
                </span>
                <span>
                  {i.message}
                  <code>{i.at.join(' / ')}</code>
                </span>
              </button>
            ))}
        </section>
      ))}
    </Modal>
  )
}
