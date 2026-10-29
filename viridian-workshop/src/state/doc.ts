// hooks for reading and writing the json of the file being edited by path
import { useCallback, useMemo } from 'react'
import { deleteIn, getIn, pathKey, setIn, type Path } from '../model/edit'
import type { Json } from '../model/json'
import { useFile, useWs } from './context'

export function useDoc() {
  const { ws, issues } = useWs()
  const file = useFile()
  const json = ws.state.project.files[file]?.json
  const set = useCallback(
    (path: Path, value: Json | undefined, merge = true) => {
      ws.edit(
        file,
        (cur) => (value === undefined ? (deleteIn(cur, path) ?? {}) : setIn(cur, path, value)),
        merge ? pathKey(path) : undefined,
      )
    },
    [ws, file],
  )
  const get = useCallback((path: Path) => getIn(json, path), [json])
  const fileIssues = useMemo(() => issues.filter((i) => i.file === file), [issues, file])
  return { file, json, get, set, issues: fileIssues }
}

export function startsWith(path: Path, prefix: Path) {
  return prefix.length <= path.length && prefix.every((p, i) => path[i] === p)
}

export function useFieldIssues(path: Path) {
  const { issues } = useDoc()
  const key = pathKey(path)
  return issues.filter((i) => pathKey(i.at) === key)
}

// issues anywhere under a path, for badges on collapsed cards
export function useNestedIssueCount(path: Path) {
  const { issues } = useDoc()
  let errors = 0
  let warnings = 0
  for (const i of issues) {
    if (!startsWith(i.at, path)) continue
    if (i.severity === 'error') errors++
    else warnings++
  }
  return { errors, warnings }
}
