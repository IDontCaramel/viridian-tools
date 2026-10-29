// small controlled inputs that tolerate half typed values
import { useEffect, useId, useState } from 'react'
import type { Json } from '../../model/json'

export function NumberInput({
  value,
  onChange,
  integer,
  placeholder,
  id,
  ariaLabel,
}: {
  value: Json | undefined
  onChange: (v: number | undefined) => void
  integer?: boolean
  placeholder?: string
  id?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => {
    const parsed = Number(text)
    if (value === undefined && text !== '') setText('')
    else if (value !== undefined && (text === '' || parsed !== value)) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className="input number"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        if (t.trim() === '') return onChange(undefined)
        const n = Number(t)
        if (Number.isFinite(n) && /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t.trim())) onChange(n)
      }}
    />
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  suggestions,
  id,
  ariaLabel,
  mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  suggestions?: string[]
  id?: string
  ariaLabel?: string
  mono?: boolean
}) {
  const listId = useId()
  return (
    <>
      <input
        id={id}
        aria-label={ariaLabel}
        className={'input' + (mono ? ' mono' : '')}
        value={value}
        placeholder={placeholder}
        list={suggestions?.length ? listId : undefined}
        spellCheck={!mono}
        onChange={(e) => onChange(e.target.value)}
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
  muted,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  id?: string
  muted?: boolean
}) {
  return (
    <label className={'toggle' + (muted ? ' muted' : '')}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}

// raw json for anything without a proper form
export function JsonInput({
  value,
  onChange,
  id,
  rows = 4,
}: {
  value: Json | undefined
  onChange: (v: Json | undefined) => void
  id?: string
  rows?: number
}) {
  const printed = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [text, setText] = useState(printed)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) {
      setText(printed)
      setError(null)
    }
  }, [printed, focused])
  return (
    <div className="json-input">
      <textarea
        id={id}
        className={'input mono' + (error ? ' invalid' : '')}
        rows={Math.min(14, Math.max(rows, text.split('\n').length))}
        value={text}
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value.trim() === '') {
            setError(null)
            return onChange(undefined)
          }
          try {
            onChange(JSON.parse(e.target.value))
            setError(null)
          } catch (err) {
            setError((err as Error).message)
          }
        }}
      />
      {error && <div className="field-msg error">Not valid JSON yet: {error}</div>}
    </div>
  )
}
