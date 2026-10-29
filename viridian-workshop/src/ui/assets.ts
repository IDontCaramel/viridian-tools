// workshop art in public/viridian, resolved against the pages subpath
const BASE = `${import.meta.env.BASE_URL}viridian/`

export const LOGO_URL = `${BASE}logo.png`

export const IMPACT_NAMES = ['none', 'low', 'medium', 'high'] as const

// the 28x8 pip strips from the selection screen, none is the original origins one
export function impactUrl(level: number) {
  return `${BASE}impact/${IMPACT_NAMES[level] ?? 'none'}.png`
}
