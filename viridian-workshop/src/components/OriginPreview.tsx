import { isObject } from '../model/json'
import { classify } from '../model/project'
import { useDoc } from '../state/doc'
import { useWs } from '../state/context'
import { iconItem, originDisplay, powerDisplay } from '../ui/text'
import { McItemIcon } from './McPicker'
import { impactUrl } from '../ui/assets'

export function OriginPreview() {
  const { json, file } = useDoc()
  const { ws } = useWs()
  const info = classify(file, ws.state.project.root)
  const obj = isObject(json) ? json : {}
  const impact =
    typeof obj.impact === 'string'
      ? ['none', 'low', 'medium', 'high'].indexOf(obj.impact.toLowerCase())
      : Number(obj.impact ?? 0)
  const display = originDisplay(json, info.id!)
  const powers = (Array.isArray(obj.powers) ? obj.powers : [])
    .filter((r): r is string => typeof r === 'string')
    .map((r) => powerDisplay(ws.state.project, r, info.namespace!))
    .filter((p) => !p.hidden)
  return (
    <div className="preview-wrap">
      <article className="origin-preview">
        <div className="preview-top">
          <span className="preview-icon" title={iconItem(obj.icon)}>
            <McItemIcon id={iconItem(obj.icon)} size={32} />
          </span>
          <h2>{display.name || 'Untitled origin'}</h2>
          <img className="impact-pips" src={impactUrl(impact)} alt={`Impact ${impact} of 3`} />
        </div>
        <p className="preview-description">{display.description || 'Your origin description will appear here.'}</p>
        {powers.map((p, n) => (
          <section className="preview-power" key={`${p.id}:${n}`}>
            <h3>{p.name}</h3>
            <p>{p.description || 'No description yet.'}</p>
          </section>
        ))}
        {!powers.length && <div className="preview-empty">Add a power to give this origin its first ability.</div>}
      </article>
    </div>
  )
}
