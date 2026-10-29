import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { Workspace } from '../Workspace'
import { createOriginProject } from '../../model/create'
import { pathFor, type Project } from '../../model/project'
import { DEFAULT_FORMAT, type Json } from '../../model/json'
import { validateProject } from '../../model/validate'
import { CATEGORIES, typesIn } from '../../catalog/catalog'
import { ALL_TEMPLATES, parseTemplate, PRESET_LIST, typePath } from './blockDefs'

vi.mock('../../model/storage', () => ({
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
  localStorage.clear()
})

function withPower(json: Json): { project: Project; path: string } {
  const project = createOriginProject('Test', 'test')
  const path = pathFor(project, 'power', 'test:script')
  project.files[path] = { path, json, format: DEFAULT_FORMAT, dirty: true }
  const origin = pathFor(project, 'origin', 'test:test')
  project.files[origin] = { ...project.files[origin], json: { name: 'Test', powers: ['test:script'] } }
  return { project, path }
}

function renderPower(json: Json) {
  const { project, path } = withPower(json)
  render(<Workspace project={project} onClose={() => {}} />)
  // expand the power row on the origin page
  return { path, open: () => userEvent.setup().click(screen.getByRole('button', { name: /^Script/ })) }
}

const currentJson = async (user: ReturnType<typeof userEvent.setup>) => {
  const body = within(document.querySelector<HTMLElement>('.power-body')!)
  if (!body.queryByRole('textbox', { name: 'File JSON' }))
    await user.click(body.getByRole('button', { name: 'JSON' }))
  const json = JSON.parse((body.getByRole('textbox', { name: 'File JSON' }) as HTMLTextAreaElement).value)
  await user.click(body.getByRole('button', { name: 'Blocks' }))
  return json
}

async function pick(user: ReturnType<typeof userEvent.setup>, button: HTMLElement, search: string) {
  await user.click(button)
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByRole('combobox', { name: 'Search' }), search)
  await user.click(within(dialog).getAllByRole('option')[0])
}

it('replaces forms with a JSON view that updates the blocks', async () => {
  const user = userEvent.setup()
  const { open } = renderPower({ type: 'apoli:action_on_key_press', entity_action: { type: 'apoli:nothing' } })
  await open()
  const body = within(document.querySelector<HTMLElement>('.power-body')!)
  expect(body.queryByRole('button', { name: 'Forms' })).not.toBeInTheDocument()
  await user.click(body.getByRole('button', { name: 'JSON' }))
  expect(body.queryByRole('heading', { name: 'Script' })).not.toBeInTheDocument()
  const editor = body.getByRole('textbox', { name: 'File JSON' })
  await user.click(editor)
  await user.clear(editor)
  await user.paste(JSON.stringify({ type: 'apoli:action_on_key_press', name: 'Changed', entity_action: { type: 'apoli:nothing' } }))
  await user.click(body.getByRole('button', { name: 'Blocks' }))
  expect(body.getByRole('heading', { name: 'Script' })).toBeInTheDocument()
  expect(body.getByRole('textbox', { name: 'Name' })).toHaveValue('Changed')
})

it('shows optional fields after opening advanced sections once', async () => {
  const user = userEvent.setup()
  const { open } = renderPower({ type: 'apoli:action_on_key_press', entity_action: { type: 'apoli:nothing' } })
  await open()

  const advanced = screen.getAllByText('Advanced options')
  expect(advanced).toHaveLength(2)
  for (const summary of advanced) {
    await user.click(summary)
    const section = summary.parentElement!
    expect(section.querySelector('details')).toBeNull()
    expect(within(section).getAllByRole('button').length).toBeGreaterThan(0)
  }

  const drawers = document.querySelectorAll<HTMLElement>('.blk-drawer')
  expect(drawers.length).toBeGreaterThan(0)
  for (const drawer of drawers) {
    const toggle = within(drawer).getByRole('button', { expanded: false })
    await user.click(toggle)
    expect(drawer.querySelector('details.more-options')).toBeNull()
    expect(drawer.querySelector('.option-chips button')).not.toBeNull()
  }
})

describe('block definitions', () => {
  it('only puts real catalog fields in block sentences', () => {
    for (const [kind, templates] of ALL_TEMPLATES) {
      const categories = CATEGORIES.filter((c) =>
        kind === 'power_type' ? c === 'power_type' : kind === 'action' ? c.endsWith('_action') : c.endsWith('_condition'),
      )
      for (const [path, template] of Object.entries(templates)) {
        const specs = categories.flatMap((c) => typesIn(c)).filter((t) => typePath(t.id) === path)
        expect(specs.length, `${kind} ${path} is not in the catalog`).toBeGreaterThan(0)
        for (const piece of parseTemplate(template)) {
          if (!('field' in piece)) continue
          expect(
            specs.some((s) => s.fields.some((f) => f.name === piece.field)),
            `${kind} ${path} has no field ${piece.field}`,
          ).toBe(true)
        }
      }
    }
  })

  it('ships quick blocks that pass validation', () => {
    for (const preset of PRESET_LIST) {
      const power: Json =
        preset.category === 'entity_action'
          ? { type: 'apoli:action_on_key_press', entity_action: preset.json }
          : { type: 'apoli:action_on_key_press', entity_action: { type: 'apoli:nothing' }, condition: preset.json }
      const { project } = withPower(power)
      const problems = validateProject(project).filter((i) => i.file.endsWith('script.json'))
      expect(problems, preset.label).toEqual([])
    }
  })
})

describe('blocks view', () => {
  it('stacks blocks as an "and" and replaces the starting placeholder', async () => {
    const user = userEvent.setup()
    const { open } = renderPower({ type: 'apoli:action_on_key_press', entity_action: { type: 'apoli:nothing' } })
    await open()
    await pick(user, screen.getByRole('button', { name: '+ Add' }), 'heal 2 hearts')
    expect((await currentJson(user)).entity_action).toEqual({ type: 'apoli:heal', amount: 4 })
    await pick(user, screen.getByRole('button', { name: '+ Add' }), 'launch upward')
    expect((await currentJson(user)).entity_action).toEqual({
      type: 'apoli:and',
      actions: [
        { type: 'apoli:heal', amount: 4 },
        { type: 'apoli:add_velocity', y: 1.2 },
      ],
    })
  })

  it('flattens only the top "and" and keeps nested ones as their own block', async () => {
    const user = userEvent.setup()
    const nested: Json = {
      type: 'apoli:and',
      actions: [
        {
          type: 'apoli:and',
          actions: [
            { type: 'apoli:heal', amount: 1 },
            { type: 'apoli:heal', amount: 2 },
          ],
        },
        { type: 'apoli:heal', amount: 3 },
      ],
    }
    const { open } = renderPower({ type: 'apoli:action_on_key_press', entity_action: nested })
    await open()
    expect(screen.getAllByText('do all of these')).toHaveLength(1)
    expect(screen.getAllByText('heal')).toHaveLength(3)
    expect((await currentJson(user)).entity_action).toEqual(nested)
  })

  it('moves and removes blocks from the block menu', async () => {
    const user = userEvent.setup()
    const { open } = renderPower({
      type: 'apoli:action_on_key_press',
      entity_action: {
        type: 'apoli:and',
        actions: [
          { type: 'apoli:heal', amount: 1 },
          { type: 'apoli:feed', food: 2, saturation: 1 },
        ],
      },
    })
    await open()
    const menus = () => screen.getAllByRole('button', { name: 'Block options' })
    // the first menu is the trigger, then the two blocks in order
    await user.click(menus()[2])
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect((await currentJson(user)).entity_action.actions.map((a: { type: string }) => a.type)).toEqual([
      'apoli:feed',
      'apoli:heal',
    ])
    await user.click(menus()[1])
    await user.click(screen.getByRole('menuitem', { name: 'Remove block' }))
    await user.click(menus()[1])
    await user.click(screen.getByRole('menuitem', { name: 'Remove block' }))
    expect('entity_action' in (await currentJson(user))).toBe(false)
  })

  it('adds a condition and toggles its inversion', async () => {
    const user = userEvent.setup()
    const { open } = renderPower({ type: 'apoli:action_on_land', entity_action: { type: 'apoli:heal', amount: 1 } })
    await open()
    await pick(user, screen.getByRole('button', { name: 'Add condition: only when' }), 'sneaking')
    expect((await currentJson(user)).condition).toEqual({ type: 'apoli:sneaking' })
    await user.click(screen.getAllByRole('button', { name: 'Block options' })[1])
    await user.click(screen.getByRole('menuitem', { name: 'Invert with "not"' }))
    expect((await currentJson(user)).condition).toEqual({ type: 'apoli:sneaking', inverted: true })
    await user.click(screen.getByRole('button', { name: 'not' }))
    expect((await currentJson(user)).condition).toEqual({ type: 'apoli:sneaking' })
  })

  it('picks entities, particles and readable ability keys using their json ids', async () => {
    const user = userEvent.setup()
    const { open } = renderPower({
      type: 'apoli:action_on_key_press', key: 'key.origins.primary_active',
      entity_action: { type: 'apoli:fire_projectile', entity_type: 'minecraft:arrow',
        projectile_action: { type: 'apoli:spawn_particles', particle: 'minecraft:flame' } },
    })
    await open()
    expect(screen.getByText('Primary ability')).toBeInTheDocument()
    await pick(user, screen.getByRole('button', { name: 'Key' }), 'secondary')
    await pick(user, screen.getByRole('button', { name: 'Entity type' }), 'snowball')
    await pick(user, screen.getByRole('button', { name: 'Particle' }), 'cloud')
    const json = await currentJson(user)
    expect(json.key).toBe('key.origins.secondary_active')
    expect(json.entity_action.entity_type).toBe('minecraft:snowball')
    expect(json.entity_action.projectile_action.particle).toBe('minecraft:cloud')
  })

  it('edits inline values and keeps unknown types as raw json', async () => {
    const user = userEvent.setup()
    const { open } = renderPower({
      type: 'apoli:action_over_time',
      interval: 20,
      entity_action: { type: 'othermod:zap', power: 3 },
    })
    await open()
    const interval = screen.getByRole('textbox', { name: 'Interval (ticks)' })
    await user.clear(interval)
    await user.type(interval, '40')
    expect(screen.getByText(/Viridian doesn't know "othermod:zap"/)).toBeInTheDocument()
    const json = await currentJson(user)
    expect(json.interval).toBe(40)
    expect(json.entity_action).toEqual({ type: 'othermod:zap', power: 3 })
  })
})
