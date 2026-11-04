import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { researchTimelineCount, saveResearchTimelines } from '../../src/main/db/research-timeline-repo'
import { createResearchSnapshot, saveResearchMatch } from '../../src/main/db/research-repo'
import type { Item } from '../../src/shared/ddragon'
import { shouldCollectTimeline } from '../../src/shared/research'
import {
  compactTimeline,
  MAX_PURCHASE_ORDER,
  parseResearchTimeline,
  STARTING_WINDOW_MS,
  type ResearchTimelineEventLike,
} from '../../src/shared/research-timeline'
import { parseMatch } from '../../src/shared/riot'
import { memoryDb } from '../helpers/db'
import { mkItem } from '../helpers/items'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

const base = parseMatch(fixture('match.json'))

const items: Item[] = [
  mkItem(3033, 'Mortal Reminder'),
  mkItem(323033, 'Mortal Reminder', { goldTotal: 3100 }),
  mkItem(3031, 'Infinity Edge'),
  mkItem(3072, 'Bloodthirster'),
  mkItem(1001, 'Boots', { goldTotal: 300, tags: ['Boots'], into: [3006] }),
  mkItem(3006, "Berserker's Greaves", { goldTotal: 1100, tags: ['Boots'] }),
  mkItem(1036, 'Long Sword', { goldTotal: 350, into: [3033] }),
  mkItem(2003, 'Health Potion', { goldTotal: 50, tags: ['Consumable'] }),
  mkItem(3340, 'Stealth Ward', { goldTotal: 0, tags: ['Trinket'] }),
]

function event(
  partial: Partial<ResearchTimelineEventLike> & { timestamp: number; type: string },
): ResearchTimelineEventLike {
  return {
    participantId: 1,
    itemId: null,
    skillSlot: null,
    level: null,
    ...partial,
  }
}

function purchased(timestamp: number, itemId: number): ResearchTimelineEventLike {
  return event({ timestamp, type: 'ITEM_PURCHASED', itemId })
}

describe('compactTimeline', () => {
  it('keeps completed items in purchase order and merges name variants', () => {
    const events = [
      purchased(1000, 1036), // component
      purchased(30000, 323033), // same name, variant id
      purchased(20000, 2003), // consumable
      purchased(15000, 1001), // base boots, not a completed item
      purchased(90000, 3006),
      purchased(120000, 3033),
      purchased(10000, 3340), // trinket
    ]

    const compacted = compactTimeline(events, 1, items)

    expect(compacted.purchaseOrder).toEqual([3033, 3006])
    expect(compacted.startingItems).toEqual([1036, 3340, 1001, 2003, 3033])
  })

  it('removes undone purchases and sold items', () => {
    const events = [
      purchased(60000, 3033),
      purchased(70000, 3031),
      event({ timestamp: 71000, type: 'ITEM_UNDO', beforeId: 3031 }),
      purchased(80000, 3072),
      event({ timestamp: 90000, type: 'ITEM_SOLD', itemId: 3033 }),
    ]

    expect(compactTimeline(events, 1, items).purchaseOrder).toEqual([3072])
  })

  it('caps the purchase order at seven completed items', () => {
    const many: Item[] = Array.from({ length: 9 }, (_, index) =>
      mkItem(4000 + index, `Item ${index}`),
    )
    const events = many.map((item, index) => purchased(60000 + index * 1000, item.id))

    expect(compactTimeline(events, 1, many).purchaseOrder).toHaveLength(MAX_PURCHASE_ORDER)
  })

  it('builds the skill string from NORMAL level-ups only', () => {
    const events = [
      event({ timestamp: 1000, type: 'SKILL_LEVEL_UP', skillSlot: 1, level: 1, levelUpType: 'NORMAL' }),
      event({ timestamp: 2000, type: 'SKILL_LEVEL_UP', skillSlot: 2, level: 2, levelUpType: 'NORMAL' }),
      event({ timestamp: 3000, type: 'SKILL_LEVEL_UP', skillSlot: 3, level: 3, levelUpType: 'EVOLVE' }),
      event({ timestamp: 4000, type: 'SKILL_LEVEL_UP', skillSlot: 4, level: 5, levelUpType: 'NORMAL' }),
    ]

    expect(compactTimeline(events, 1, items).skillOrder).toBe('QWR')
  })

  it('uses purchases before 90 seconds as starting items', () => {
    const events = [
      purchased(5000, 2003),
      purchased(STARTING_WINDOW_MS - 1, 1036),
      purchased(STARTING_WINDOW_MS, 3033),
    ]

    expect(compactTimeline(events, 1, items).startingItems).toEqual([2003, 1036])
  })

  it('parses raw timelines and keeps undo ids', () => {
    const events = parseResearchTimeline({
      info: {
        frames: [
          {
            events: [
              { timestamp: 1000, type: 'ITEM_PURCHASED', participantId: 2, itemId: 3033 },
              { timestamp: 2000, type: 'ITEM_UNDO', participantId: 2, beforeId: 3033 },
            ],
          },
        ],
      },
    })

    expect(events[1]).toMatchObject({ type: 'ITEM_UNDO', beforeId: 3033, afterId: null })
    expect(compactTimeline(events, 2, items).purchaseOrder).toEqual([])
  })
})

describe('timeline sampling', () => {
  it('is stable and samples about a quarter of the matches', () => {
    const ids = Array.from({ length: 1000 }, (_, index) => `EUW1_${7000000000 + index}`)
    const first = ids.map((id) => shouldCollectTimeline('quarter', id))
    const second = ids.map((id) => shouldCollectTimeline('quarter', id))
    const sampled = first.filter(Boolean).length

    expect(first).toEqual(second)
    expect(sampled).toBeGreaterThan(150)
    expect(sampled).toBeLessThan(350)
    expect(ids.every((id) => shouldCollectTimeline('full', id))).toBe(true)
    expect(ids.some((id) => shouldCollectTimeline('off', id))).toBe(false)
  })
})

describe('research timeline storage', () => {
  it('stores one compact row without player identifiers', () => {
    const db = memoryDb()
    const snapshotId = createResearchSnapshot(db, {
      patch: '16.21',
      region: 'EUW1',
      queueId: 420,
      rankScope: 'MASTER+ / DIAMOND I-IV',
      createdAt: 1,
      targetMatches: 1,
    })
    saveResearchMatch(db, snapshotId, base, 'DIAMOND')
    const saved = saveResearchTimelines(
      db,
      base,
      'DIAMOND',
      new Map([
        [
          1,
          {
            purchaseOrder: [3033, 3006],
            startingItems: [2003],
            skillOrder: 'QWER',
          },
        ],
      ]),
    )

    expect(saved).toBe(1)
    expect(researchTimelineCount(db, snapshotId)).toBe(1)
    const row = db.prepare('SELECT * FROM research_timelines').get() as Record<string, unknown>
    expect(JSON.parse(String(row['purchase_order']))).toEqual([3033, 3006])
    expect(String(row['skill_order'])).toBe('QWER')
    expect(String(row['team_position'])).toBe('TOP')
    const columns = (db.prepare('PRAGMA table_info(research_timelines)').all() as {
      name?: unknown
    }[]).map((column) => String(column.name).toLowerCase())
    expect(columns).not.toContain('puuid')
  })
})
