import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
import { PurchaseOrderService } from '../../src/main/services/purchase-order-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { SkillOrderService } from '../../src/main/services/skill-order-service'
import { MatchTimelineService } from '../../src/main/services/match-timeline-service'
import { TimelineBackfillService } from '../../src/main/services/timeline-backfill-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import type { TimelineEvent } from '../../src/shared/timeline'
import { saveTimelineEvents } from '../../src/main/db/timeline-repo'
import { insertMatch, memoryDb } from '../helpers/db'

const ME = 'puuid-me'
const GAREN = 86
const AHRI = 103
const ACCOUNT = { puuid: ME, gameName: 'Me', tagLine: 'EUW' }

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values
const items = parseItemList(fixture('item.json')).values

function source(): StaticDataSource {
  return {
    latestVersion: () => '16.3.1',
    champions: () => champions,
    items: () => items,
  }
}

function purchased(timestamp: number, itemId: number): TimelineEvent {
  return {
    timestamp,
    type: 'ITEM_PURCHASED',
    participantId: 1,
    itemId,
    skillSlot: null,
    level: null,
  }
}

function seed() {
  const db = memoryDb()
  for (let i = 1; i <= 2; i += 1) {
    insertMatch(db, {
      id: `EUW1_${i}`,
      queue: 420,
      creation: i,
      participants: [
        { team: 100, champion: GAREN, win: true, puuid: ME },
        { team: 200, champion: AHRI, win: false },
      ],
    })
  }
  const participants = new Map([
    [1, ME],
    [2, 'puuid-enemy'],
  ])
  saveTimelineEvents(
    db,
    'EUW1_1',
    [purchased(60000, 1054), purchased(120000, 1001)],
    participants,
    new Set([ME]),
  )
  saveTimelineEvents(
    db,
    'EUW1_2',
    [purchased(120000, 1054)],
    participants,
    new Set([ME]),
  )
  return db
}

describe('PurchaseOrderService', () => {
  it('averages first purchase times per item', () => {
    const service = new PurchaseOrderService({
      db: seed(),
      source: source(),
      getAccount: () => ACCOUNT,
    })

    const result = service.forChampion('Garen')

    expect(result.sampleMatches).toBe(2)
    expect(result.hasTimeline).toBe(true)
    expect(result.items[0]).toMatchObject({ itemId: 1054, games: 2, averageSeconds: 90 })
    expect(result.items[1]).toMatchObject({ itemId: 1001, games: 1, averageSeconds: 120 })
    expect(result.paths[0]?.items.map((item) => item.itemId)).toEqual([1054, 1001])
  })

  it('returns an empty state without an account', () => {
    const service = new PurchaseOrderService({
      db: memoryDb(),
      source: source(),
      getAccount: () => null,
    })

    expect(service.forChampion('Garen')).toMatchObject({
      championId: 'Garen',
      sampleMatches: 0,
      items: [],
      hasTimeline: false,
    })
  })
})

describe('TimelineBackfillService', () => {
  it('fetches timelines for matches that do not have one', async () => {
    const db = memoryDb()
    insertMatch(db, {
      id: 'EUW1_1',
      queue: 420,
      creation: 1,
      participants: [
        { team: 100, champion: GAREN, win: true, puuid: ME },
        { team: 200, champion: AHRI, win: false },
      ],
    })
    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ACCOUNT,
      getMatchIds: async () => [],
      getMatch: async () => {
        throw new Error('not used')
      },
      getTimeline: async () => [purchased(60000, 1054)],
    }
    const service = new TimelineBackfillService({
      db,
      provider,
      getAccount: () => ACCOUNT,
    })

    expect(await service.run()).toEqual({ requested: 1, saved: 1, failed: 0 })
    expect(await service.run()).toEqual({ requested: 0, saved: 0, failed: 0 })
  })
})

describe('SkillOrderService', () => {
  it('groups the most common level-up sequences', () => {
    const db = memoryDb()
    for (let i = 1; i <= 2; i += 1) {
      insertMatch(db, {
        id: `EUW1_${i}`,
        queue: 420,
        creation: i,
        participants: [
          { team: 100, champion: GAREN, win: i === 1, puuid: ME },
          { team: 200, champion: AHRI, win: i !== 1 },
        ],
      })
    }
    const participants = new Map([
      [1, ME],
      [2, 'puuid-enemy'],
    ])
    const skill = (timestamp: number, skillSlot: number): TimelineEvent => ({
      timestamp,
      type: 'SKILL_LEVEL_UP',
      participantId: 1,
      itemId: null,
      skillSlot,
      level: skillSlot,
    })
    for (const matchId of ['EUW1_1', 'EUW1_2']) {
      saveTimelineEvents(
        db,
        matchId,
        [skill(1000, 1), skill(2000, 2), skill(3000, 3)],
        participants,
        new Set([ME]),
      )
    }
    const service = new SkillOrderService({ db, source: source(), getAccount: () => ACCOUNT })

    const result = service.forChampion('Garen')

    expect(result.sampleMatches).toBe(2)
    expect(result.orders[0]).toMatchObject({
      slots: ['Q', 'W', 'E'],
      games: 2,
      wins: 1,
      winRate: 0.5,
    })
  })
})

describe('MatchTimelineService', () => {
  it('returns purchases and skills for one match', () => {
    const db = memoryDb()
    insertMatch(db, {
      id: 'EUW1_1',
      queue: 420,
      creation: 1,
      participants: [
        { team: 100, champion: GAREN, win: true, puuid: ME },
        { team: 200, champion: AHRI, win: false },
      ],
    })
    saveTimelineEvents(
      db,
      'EUW1_1',
      [
        purchased(60000, 1054),
        {
          timestamp: 70000,
          type: 'SKILL_LEVEL_UP',
          participantId: 1,
          itemId: null,
          skillSlot: 1,
          level: 1,
        },
      ],
      new Map([
        [1, ME],
        [2, 'puuid-enemy'],
      ]),
      new Set([ME]),
    )
    const service = new MatchTimelineService({
      db,
      source: source(),
      getAccount: () => ACCOUNT,
    })

    const result = service.forMatch('EUW1_1')

    expect(result.hasTimeline).toBe(true)
    expect(result.purchases[0]).toMatchObject({ itemId: 1054, seconds: 60 })
    expect(result.skills[0]).toMatchObject({ slot: 'Q', level: 1, seconds: 70 })
    expect(() => service.forMatch('EUW1_2')).toThrow('Match not found')
  })
})
