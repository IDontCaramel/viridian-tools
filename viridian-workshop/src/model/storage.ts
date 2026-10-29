// local drafts in indexeddb. they never leave this browser
import type { Project } from './project'

const DB = 'viridian-workshop'
const STORE = 'drafts'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onerror = () => reject(req.error)
    t.onabort = () => {
      db.close()
      reject(t.error ?? new Error('Could not save the draft.'))
    }
    t.oncomplete = () => {
      db.close()
      resolve(req.result)
    }
  })
}

export interface DraftSummary {
  id: string
  name: string
  updatedAt: number
  fileCount: number
}

export function saveDraft(project: Project) {
  return tx('readwrite', (s) => s.put(project))
}

export function loadDraft(id: string) {
  return tx<Project | undefined>('readonly', (s) => s.get(id))
}

export function deleteDraft(id: string) {
  return tx('readwrite', (s) => s.delete(id))
}

export async function listDrafts(): Promise<DraftSummary[]> {
  const all = await tx<Project[]>('readonly', (s) => s.getAll())
  return all
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, fileCount: Object.keys(p.files).length }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
