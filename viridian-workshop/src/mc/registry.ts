// minecraft ids, names and icons written by `npm run assets` into public/mc-assets
// the folder is not committed, so everything here copes with it being missing
import { useEffect, useState } from 'react'

// texture path like "block/stone", or [path, rgb] for tinted textures
export type Face = string | [string, number]
export type Icon = { layers: Face[] } | { cube: [Face, Face, Face] }

export interface McEntry {
  id: string
  name: string
  icon?: Icon
}

export type McList = 'items' | 'blocks' | 'effects' | 'sounds'
export type McRegistry = Record<McList, McEntry[]>

const BASE = `${import.meta.env.BASE_URL}mc-assets/`

let loading: Promise<McRegistry | null> | undefined

function loadRegistry() {
  loading ??= fetch(`${BASE}registry.json`)
    .then((res) => (res.ok ? (res.json() as Promise<McRegistry>) : null))
    .catch(() => null)
  return loading
}

// undefined while loading, null when the assets were never extracted
export function useMcRegistry() {
  const [registry, setRegistry] = useState<McRegistry | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    void loadRegistry().then((r) => active && setRegistry(r))
    return () => {
      active = false
    }
  }, [])
  return registry
}

export function textureUrl(face: Face) {
  return `${BASE}textures/${typeof face === 'string' ? face : face[0]}.png`
}

export function faceTint(face: Face) {
  return typeof face === 'string' ? undefined : `#${face[1].toString(16).padStart(6, '0')}`
}

// "speed" and "minecraft:speed" are the same id
export function findEntry(list: McEntry[] | undefined, id: string) {
  const full = id.includes(':') ? id : `minecraft:${id}`
  return list?.find((e) => e.id === full)
}
