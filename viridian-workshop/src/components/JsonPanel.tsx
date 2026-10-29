import { useEffect, useRef, useState } from 'react'
import { jsonSyntax, parseJson, printJson } from '../model/json'
import { useFile, useWs } from '../state/context'

export function JsonPanel() {
  const { ws } = useWs()
  const path = useFile()
  const file = ws.state.project.files[path]
  const source = file ? (file.json === undefined ? (file.text ?? '') : printJson(file.json, file.format, jsonSyntax(path))) : ''
  const [text, setText] = useState(source)
  const [error, setError] = useState('')
  const focused = useRef(false)
  const lastFile = useRef(path)
  useEffect(() => {
    if (lastFile.current !== path || !focused.current) {
      setText(source)
      setError('')
    }
    lastFile.current = path
  }, [source, path])
  const update = (next: string) => {
    setText(next)
    const parsed = parseJson(next, jsonSyntax(path))
    setError(parsed.error ?? '')
    if (parsed.value !== undefined && !parsed.error) ws.replaceFile(path, parsed.value)
    else if (file?.parseError) ws.setText(path, next)
  }
  return (
    <div className="json-panel">
      <p className="field-note">
        Changes to valid JSON appear in the forms. Invalid text stays here until you fix it. Export uses the last valid
        version.
      </p>
      <textarea
        className="json-input"
        aria-label="File JSON"
        spellCheck={false}
        value={text}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
        }}
        onChange={(e) => update(e.target.value)}
      />
      {error && (
        <p role="alert" className="field-msg error">
          {error}
        </p>
      )}
    </div>
  )
}
