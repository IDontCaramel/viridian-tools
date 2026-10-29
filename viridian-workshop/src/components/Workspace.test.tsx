import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { App } from '../App'
import { Workspace } from './Workspace'
import { createOriginProject } from '../model/create'
import { parseJson } from '../model/json'
import { fileBytes, projectFromFiles } from '../model/project'
import { exportZip } from '../model/zip'
import { validateProject } from '../model/validate'
import { saveDraft } from '../model/storage'

vi.mock('../model/storage', () => ({
  listDrafts: vi.fn(async () => []),
  saveDraft: vi.fn(async () => {}),
  loadDraft: vi.fn(),
  deleteDraft: vi.fn(async () => {}),
}))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.clearAllMocks()
})

async function addPower(user: ReturnType<typeof userEvent.setup>, search: string, label: string) {
  await user.click(screen.getByRole('button', { name: /Add power/ }))
  const dialog = screen.getByRole('dialog', { name: 'Add a power' })
  await user.type(within(dialog).getByRole('combobox'), search)
  await user.click(within(dialog).getAllByRole('option', { name: new RegExp(label) })[0])
}

describe('workshop', () => {
  it('opens json5, applies json5 edits and exports without changing untouched files', async () => {
    const user = userEvent.setup()
    const originPath = 'data/test/origins/test.json5'
    const powerPath = 'data/test/powers/resource.json5'
    const resource = "{type:'apoli:resource', min:'0', max:0x10}"
    const project = projectFromFiles('JSON5', [
      { path: originPath, bytes: new TextEncoder().encode("{name:'Before', powers:['test:resource']}") },
      { path: powerPath, bytes: new TextEncoder().encode(resource) },
    ])
    render(<Workspace project={project} onClose={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Origin name' })).toHaveValue('Before')
    expect(screen.queryByRole('heading', { name: 'Repair JSON' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show JSON' }))
    const editor = screen.getByRole('textbox', { name: 'File JSON' })
    fireEvent.focus(editor)
    fireEvent.change(editor, { target: { value: "{name:'After', powers:['test:resource'], impact:0x1}" } })
    expect(screen.getByRole('textbox', { name: 'Origin name' })).toHaveValue('After')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(saveDraft).mock.calls.at(-1)?.[0].files[originPath].json).toMatchObject({ name: 'After', impact: 1 }))
    const saved = vi.mocked(saveDraft).mock.calls.at(-1)![0]
    expect(validateProject(saved).filter((i) => i.severity === 'error')).toEqual([])
    const zip = await JSZip.loadAsync(await exportZip(saved))
    expect(parseJson(await zip.file(originPath)!.async('string'), 'json5').value).toEqual({
      name: 'After', powers: ['test:resource'], impact: 1,
    })
    expect(await zip.file(powerPath)!.async('string')).toBe(resource)
  })

  it('creates an origin with a main layer, adds and reorders powers, undoes, redoes and exports', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Create an origin/ }))
    await user.type(screen.getByRole('textbox', { name: 'Origin name' }), 'Mosskeeper')
    await user.click(screen.getByRole('button', { name: 'Create origin' }))
    expect(await screen.findByRole('textbox', { name: 'Origin name' })).toHaveValue('Mosskeeper')
    await addPower(user, 'fire immunity', 'Fire immunity')
    await addPower(user, 'invisibility', 'Invisibility')
    const cards = () => Array.from(document.querySelectorAll('.power-card strong')).map((el) => el.textContent)
    expect(cards()).toEqual(['Fire immunity', 'Invisibility'])
    await user.click(screen.getByRole('button', { name: 'Move Invisibility up' }))
    expect(cards()).toEqual(['Invisibility', 'Fire immunity'])
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(cards()).toEqual(['Fire immunity', 'Invisibility'])
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(cards()).toEqual(['Invisibility', 'Fire immunity'])
    await waitFor(() => expect(saveDraft).toHaveBeenCalled())
    const saved = vi.mocked(saveDraft).mock.calls.at(-1)![0]
    expect(validateProject(saved)).toEqual([])
    const zip = await JSZip.loadAsync(await exportZip(saved))
    // the namespace comes from the origin name
    const origin = JSON.parse(await zip.file('data/mosskeeper/origins/mosskeeper.json')!.async('string'))
    expect(origin.powers).toEqual(['mosskeeper:invisibility', 'mosskeeper:fire_immunity'])
    expect(JSON.parse(await zip.file('data/origins/origin_layers/origin.json')!.async('string'))).toEqual({
      replace: false,
      origins: ['mosskeeper:mosskeeper'],
    })
    await user.click(screen.getByRole('button', { name: /Export/ }))
    expect(screen.getByRole('button', { name: 'Download zip' })).toBeInTheDocument()
  })

  it('keeps invalid JSON out of forms and applies valid JSON in both directions', async () => {
    const user = userEvent.setup()
    render(<Workspace project={createOriginProject('Test', 'test')} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Show JSON' }))
    const editor = screen.getByRole('textbox', { name: 'File JSON' })
    const name = screen.getByRole('textbox', { name: 'Origin name' })
    fireEvent.focus(editor)
    fireEvent.change(editor, { target: { value: '{broken' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(name).toHaveValue('Test')
    fireEvent.change(editor, { target: { value: '{"name":"Changed", "powers":[]}' } })
    expect(name).toHaveValue('Changed')
    fireEvent.blur(editor)
    fireEvent.change(name, { target: { value: 'From form' } })
    expect(JSON.parse((editor as HTMLTextAreaElement).value).name).toBe('From form')
  })

  it('repairs malformed files without discarding other pack contents', async () => {
    const user = userEvent.setup()
    const project = projectFromFiles('Broken', [
      { path: 'data/test/origins/test.json', bytes: new TextEncoder().encode('{broken') },
      { path: 'notes.txt', bytes: new TextEncoder().encode('keep me') },
    ])
    render(<Workspace project={project} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'File JSON' }), {
      target: { value: '{"name":"Fixed", "powers":[]}' },
    })
    expect(screen.getByRole('textbox', { name: 'Origin name' })).toHaveValue('Fixed')
    await waitFor(() => {
      const saved = vi.mocked(saveDraft).mock.calls.at(-1)![0]
      expect(saved.files['data/test/origins/test.json'].json).toEqual({ name: 'Fixed', powers: [] })
      expect(new TextDecoder().decode(fileBytes(saved.files['notes.txt']))).toBe('keep me')
    })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('heading', { name: 'Repair JSON' })).toBeInTheDocument()
  })

  it('creates a power and its reference as one undo step', async () => {
    const user = userEvent.setup()
    render(<Workspace project={createOriginProject('Test', 'test')} onClose={() => {}} />)
    await addPower(user, 'fire immunity', 'Fire immunity')
    expect(document.querySelectorAll('.power-card')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(document.querySelectorAll('.power-card')).toHaveLength(0)
    expect(screen.getByText(/No powers yet/)).toBeInTheDocument()
    await waitFor(() => {
      const saved = vi.mocked(saveDraft).mock.calls.at(-1)![0]
      expect(Object.keys(saved.files).filter((path) => path.includes('/powers/'))).toHaveLength(0)
      expect(saved.files['data/test/origins/test.json'].json).toMatchObject({ powers: [] })
    })
  })

  it('grants a new cooldown to the origin and shows it inside the power that made it', async () => {
    const user = userEvent.setup()
    render(<Workspace project={createOriginProject('Test', 'test')} onClose={() => {}} />)
    await addPower(user, 'use a key', 'Use a key')
    await user.click(screen.getByRole('button', { name: '+ New cooldown' }))
    expect(screen.queryByText(/Not in any origin/)).not.toBeInTheDocument()
    expect(document.querySelectorAll('.power-card')).toHaveLength(1)
    expect(document.querySelector('.variable-tag')).toHaveTextContent('Cooldown: Use a key cooldown')
    await waitFor(() => {
      const saved = vi.mocked(saveDraft).mock.calls.at(-1)![0]
      const origin = saved.files['data/test/origins/test.json'].json as { powers: string[] }
      expect(origin.powers).toEqual(['test:use_a_key', 'test:use_a_key_cooldown'])
      expect(saved.files['data/test/powers/use_a_key_cooldown.json'].json).toMatchObject({
        type: 'apoli:cooldown',
        hidden: true,
      })
      // and it already does something: started by the key, checked before running
      expect(saved.files['data/test/powers/use_a_key.json'].json).toMatchObject({
        entity_action: { type: 'apoli:trigger_cooldown', power: 'test:use_a_key_cooldown' },
        condition: { type: 'apoli:resource', resource: 'test:use_a_key_cooldown', comparison: '<=', compare_to: 0 },
      })
    })
    // deleting the power takes its cooldown along, in one undo step
    await user.click(screen.getByRole('button', { name: 'Delete Use a key' }))
    expect(document.querySelectorAll('.power-card')).toHaveLength(0)
    await waitFor(() => {
      const saved = vi.mocked(saveDraft).mock.calls.at(-1)![0]
      expect(Object.keys(saved.files).filter((path) => path.includes('/powers/'))).toHaveLength(0)
    })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(document.querySelectorAll('.power-card')).toHaveLength(1)
    expect(document.querySelector('.variable-tag')).toBeInTheDocument()
  })

  it('offers to grant a cooldown a power uses but the origin is missing', async () => {
    const user = userEvent.setup()
    const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))
    const project = projectFromFiles('Missing', [
      { path: 'data/test/origins/test.json', bytes: enc({ name: 'Test', powers: ['test:dash'] }) },
      {
        path: 'data/test/powers/dash.json',
        bytes: enc({ type: 'apoli:active_self', entity_action: { type: 'apoli:trigger_cooldown', power: 'test:timer' } }),
      },
      { path: 'data/test/powers/timer.json', bytes: enc({ type: 'apoli:cooldown', cooldown: 40, hidden: true }) },
    ])
    render(<Workspace project={project} onClose={() => {}} />)
    await user.click(document.querySelector<HTMLElement>('.power-toggle')!)
    await user.click(screen.getByRole('button', { name: 'Add it to the origin' }))
    await waitFor(() => {
      const saved = vi.mocked(saveDraft).mock.calls.at(-1)![0]
      expect(saved.files['data/test/origins/test.json'].json).toMatchObject({ powers: ['test:dash', 'test:timer'] })
    })
    expect(screen.queryByText(/Not in any origin/)).not.toBeInTheDocument()
  })
})
