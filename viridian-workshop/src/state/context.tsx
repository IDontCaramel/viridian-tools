import { createContext, useContext } from 'react'
import type { Workspace } from './store'
import type { Issue } from '../model/validate'
import type { Json } from '../model/json'

export interface Template {
  // power_type, entity_action, ... or 'existing_power' for adding a power that already exists
  category: string
  // type id for new things, power id for existing ones
  id: string
  label: string
  json?: Json
}

export interface WorkspaceContext {
  ws: Workspace
  issues: Issue[]
  technical: boolean
}

export const Ctx = createContext<WorkspaceContext | null>(null)

export function useWs() {
  const c = useContext(Ctx)
  if (!c) throw new Error('no workspace')
  return c
}

// the file currently being edited, for building paths and issue lookups
export const FileCtx = createContext<string>('')
export const useFile = () => useContext(FileCtx)
