import { useDoc } from '../../state/doc'
import { ObjectFields } from '../fields/Fields'
import { JsonPanel } from '../JsonPanel'

export function PackEditor() {
  const { json } = useDoc()
  return (
    <>
      <div className="editor-heading">
        <div className="editor-kind">Pack</div>
        <h1>Pack settings</h1>
        <p>New packs target Minecraft 26.3, data pack version 121.</p>
      </div>
      <section className="editor-section">
        <ObjectFields
          path={[]}
          fields={[
            {
              name: 'pack',
              kind: 'object',
              required: true,
              fields: [
                { name: 'description', kind: 'text', required: true },
                ...['min_format', 'max_format', 'pack_format'].map((name) => ({ name, kind: 'json', required: false })),
              ],
            },
          ]}
        />
        {json === undefined && <JsonPanel />}
      </section>
    </>
  )
}
