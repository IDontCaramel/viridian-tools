import { LOGO_URL } from './assets'

export function Logo({ size = 26 }: { size?: number }) {
  return <img className="brand-mark" src={LOGO_URL} width={size} height={size} alt="" />
}
