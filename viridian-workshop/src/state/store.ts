import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DEFAULT_FORMAT, isObject, type Json } from '../model/json'
import { classify, entriesOf, pathFor, type Project } from '../model/project'
import type { Path } from '../model/edit'
import { saveDraft } from '../model/storage'

export interface Focus {
  file: string
  at: Path
  // bumps so focusing the same field twice still scrolls
  nonce: number
}

interface State {
  project: Project
  past: Project[]
  future: Project[]
  selected: string | null
  focus: Focus | null
  // edits with the same key close together merge into one undo step (typing)
  lastKey: string | null
  lastTime: number
}

type Action =
  | { type: 'change'; project: Project; key?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; path: string | null }
  | { type: 'focus'; file: string; at: Path }
  | { type: 'replace'; project: Project }

const HISTORY = 200
const MERGE_MS = 800

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'change': {
      const now = Date.now()
      const merge = action.key && action.key === state.lastKey && now - state.lastTime < MERGE_MS
      return {
        ...state,
        project: { ...action.project, updatedAt: now },
        past: merge ? state.past : [...state.past.slice(-HISTORY), state.project],
        future: [],
        lastKey: action.key ?? null,
        lastTime: now,
        selected: state.selected && !action.project.files[state.selected] ? null : state.selected,
      }
    }
    case 'undo': {
      if (!state.past.length) return state
      const prev = state.past[state.past.length - 1]
      return {
        ...state,
        project: prev,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
        lastKey: null,
        selected: state.selected && prev.files[state.selected] ? state.selected : null,
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      const next = state.future[0]
      return {
        ...state,
        project: next,
        past: [...state.past, state.project],
        future: state.future.slice(1),
        lastKey: null,
        selected: state.selected && next.files[state.selected] ? state.selected : null,
      }
    }
    case 'select':
      return { ...state, selected: action.path, lastKey: null }
    case 'focus':
      // the workspace decides which page shows the file, a power can live inside any origin page
      return { ...state, focus: { file: action.file, at: action.at, nonce: Date.now() } }
    case 'replace':
      return { ...state, project: action.project, past: [], future: [], lastKey: null }
  }
}

export function useWorkspace(initial: Project, initialSelection: string | null) {
  const [state, dispatch] = useReducer(reducer, {
    project: initial,
    past: [],
    future: [],
    selected: initialSelection,
    focus: null,
    lastKey: null,
    lastTime: 0,
  })

  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saving')

  const saveTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    let active = true
    setSaveStatus('saving')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(state.project)
        .then(() => {
          if (active) setSaveStatus('saved')
        })
        .catch(() => {
          if (active) setSaveStatus('error')
        })
    }, 400)
    return () => {
      active = false
      window.clearTimeout(saveTimer.current)
    }
  }, [state.project])

  const projectRef = useRef(state.project)
  projectRef.current = state.project

  const change = useCallback((project: Project, key?: string) => dispatch({ type: 'change', project, key }), [])

  const api = useMemo(() => {
    const current = () => projectRef.current
    return {
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      select: (path: string | null) => dispatch({ type: 'select', path }),
      focus: (file: string, at: Path) => dispatch({ type: 'focus', file, at }),
      replace: (project: Project) => dispatch({ type: 'replace', project }),
      setMeta: (meta: Partial<Pick<Project, 'name' | 'namespace'>>) => change({ ...current(), ...meta }, 'meta'),
      edit: (path: string, update: (json: Json | undefined) => Json | undefined, key?: string) => {
        const project = current()
        const file = project.files[path]
        if (!file) return
        const json = update(file.json)
        if (json === undefined) return
        change(
          { ...project, files: { ...project.files, [path]: { ...file, json, dirty: true, loadWarning: undefined } } },
          key && `${path}|${key}`,
        )
      },
      setText: (path: string, text: string) => {
        const project = current()
        const file = project.files[path]
        change({ ...project, files: { ...project.files, [path]: { ...file, text, dirty: true } } }, `${path}|text`)
      },
      replaceFile: (path: string, json: Json) => {
        const project = current()
        const file = project.files[path]
        change(
          {
            ...project,
            files: {
              ...project.files,
              [path]: { ...file, json, text: undefined, parseError: undefined, loadWarning: undefined, dirty: true },
            },
          },
          `${path}|json`,
        )
      },
      addFile: (path: string, json: Json, select = true) => {
        const project = current()
        change({ ...project, files: { ...project.files, [path]: { path, json, format: DEFAULT_FORMAT, dirty: true } } })
        if (select) dispatch({ type: 'select', path })
      },
      // several files at once as a single undo step
      batch: (files: Record<string, Json | null>) => {
        const project = current()
        const next = { ...project.files }
        for (const [path, json] of Object.entries(files)) {
          if (json === null) delete next[path]
          else next[path] = { ...(next[path] ?? { path, format: DEFAULT_FORMAT }), json, dirty: true }
        }
        change({ ...project, files: next })
      },
      deleteFile: (path: string) => {
        const project = current()
        const files = { ...project.files }
        delete files[path]
        change({ ...project, files })
      },
      // moves a power/origin/layer file and fixes references to it in this pack
      renameFile: (from: string, to: string) => {
        const project = current()
        if (from === to || project.files[to]) return false
        const fromInfo = classify(from, project.root)
        const toInfo = classify(to, project.root)
        const files = { ...project.files }
        files[to] = { ...files[from], path: to, dirty: true }
        delete files[from]
        if (fromInfo.id && toInfo.id && fromInfo.kind === toInfo.kind) {
          const listKey = fromInfo.kind === 'power' ? 'powers' : fromInfo.kind === 'origin' ? 'origins' : null
          const owners = fromInfo.kind === 'power' ? 'origin' : fromInfo.kind === 'origin' ? 'layer' : null
          if (listKey && owners) {
            for (const e of entriesOf({ ...project, files }, owners)) {
              const json = e.file.json
              if (!isObject(json) || !Array.isArray(json[listKey])) continue
              const replaced = replaceRefs(json[listKey] as Json[], fromInfo.id, toInfo.id)
              if (replaced !== json[listKey])
                files[e.path] = { ...e.file, json: { ...json, [listKey]: replaced }, dirty: true }
            }
          }
        }
        change({ ...project, files })
        dispatch({ type: 'select', path: to })
        return true
      },
      pathFor: (kind: 'origin' | 'layer' | 'power', id: string) => pathFor(current(), kind, id),
    }
  }, [change])

  return { state, saveStatus, ...api }
}

function replaceRefs(list: Json[], from: string, to: string): Json[] {
  let changed = false
  const out = list.map((entry) => {
    if (entry === from) {
      changed = true
      return to
    }
    if (isObject(entry) && Array.isArray(entry.origins)) {
      const inner = replaceRefs(entry.origins, from, to)
      if (inner !== entry.origins) {
        changed = true
        return { ...entry, origins: inner }
      }
    }
    return entry
  })
  return changed ? out : list
}

export type Workspace = ReturnType<typeof useWorkspace>
