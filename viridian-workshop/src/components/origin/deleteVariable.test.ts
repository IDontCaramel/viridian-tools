import { describe, expect, it } from 'vitest'
import { projectFromFiles } from '../../model/project'
import { deleteVariableBatch } from './deleteVariable'

describe('delete variable everywhere', () => {
  it.each(['cooldown', 'resource'])('removes a shared %s and its blocks while keeping unrelated data', async (kind) => {
    const timer = { type: `apoli:${kind}`, cooldown: 100, min: 0, max: 10 }
    const action = { type: 'apoli:execute_command', command: 'say timer' }
    const power = {
      type: 'apoli:active_self',
      name: 'test:timer',
      custom: { power: 'test:timer' },
      entity_action: { type: 'apoli:and', actions: [action, { type: 'apoli:trigger_cooldown', power: '*:timer' }] },
      condition: { type: 'apoli:resource', resource: '*:timer', comparison: '<=', compare_to: 0 },
    }
    const docs = {
      'pack.mcmeta': { pack: { pack_format: 1, description: 'test' } },
      'data/test/powers/timer.json': timer,
      'data/test/powers/a.json': power,
      'data/test/powers/b.json': power,
      'data/test/origins/a.json': { powers: ['test:a', '*:timer'] },
      'data/test/origins/b.json': { powers: ['test:b', 'test:timer'] },
    }
    const project = await projectFromFiles('Test', Object.entries(docs).map(([path, json]) => ({ path, bytes: new TextEncoder().encode(JSON.stringify(json)) })))
    const batch = deleteVariableBatch(project, 'test:timer')
    expect(batch['data/test/powers/timer.json']).toBeNull()
    for (const id of ['a', 'b']) {
      expect(batch[`data/test/powers/${id}.json`]).toEqual({
        ...power, entity_action: { type: 'apoli:and', actions: [action] }, condition: undefined,
      })
      expect(batch[`data/test/origins/${id}.json`]).toEqual({ powers: [`test:${id}`] })
    }
    expect(project.files['data/test/powers/a.json'].json).toEqual(power)
  })
})
