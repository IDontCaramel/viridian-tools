// built-in origins, layers and powers that ship with the mod
import raw from './generated.json'
import type { Json } from '../model/json'

interface Builtins {
  powers: Record<string, Json>
  origins: Record<string, Json>
  layers: Record<string, Json>
  lang: Record<string, string>
}

export const builtins = (raw as unknown as { builtins: Builtins }).builtins

export function translate(key: string): string | undefined {
  return builtins.lang[key]
}
