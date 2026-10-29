import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTimeline } from '../../src/shared/timeline'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

describe('parseTimeline', () => {
  it('flattens frames and keeps participant events', () => {
    const events = parseTimeline(fixture('timeline.json'))

    expect(events).toHaveLength(4)
    expect(events[0]).toEqual({
      timestamp: 1000,
      type: 'ITEM_PURCHASED',
      participantId: 3,
      itemId: 1054,
      skillSlot: null,
      level: null,
    })
    expect(events[2]).toMatchObject({ type: 'SKILL_LEVEL_UP', skillSlot: 1, level: 1 })
  })

  it('rejects malformed timelines', () => {
    expect(() => parseTimeline({})).toThrow()
    expect(() => parseTimeline({ info: { frames: 'nope' } })).toThrow()
  })
})
