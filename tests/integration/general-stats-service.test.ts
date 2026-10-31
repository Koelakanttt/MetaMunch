import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GeneralStatsService } from '../../src/main/services/general-stats-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import { insertMatch, memoryDb } from '../helpers/db'

const GAREN = 86
const AHRI = 103

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values
const items = parseItemList(fixture('item.json')).values

function source(version: string | null): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => items,
  }
}

function seed() {
  const db = memoryDb()
  insertMatch(db, {
    id: 'EUW1_1',
    queue: 420,
    creation: 1000,
    participants: [
      { team: 100, champion: GAREN, win: true, items: [3033, 1001, 0, 0, 0, 0] },
      { team: 100, champion: AHRI, win: true, items: [3033, 0, 0, 0, 0, 0] },
      { team: 200, champion: GAREN, win: false, items: [1001, 0, 0, 0, 0, 0] },
      { team: 200, champion: AHRI, win: false },
    ],
  })
  insertMatch(db, {
    id: 'EUW1_2',
    queue: 440,
    creation: 2000,
    participants: [
      { team: 100, champion: GAREN, win: true, items: [1001, 0, 0, 0, 0, 0] },
      { team: 200, champion: AHRI, win: false, items: [3033, 0, 0, 0, 0, 0] },
    ],
  })
  db.prepare("UPDATE matches SET patch = '16.20' WHERE match_id = 'EUW1_2'").run()
  return db
}

describe('GeneralStatsService', () => {
  it('aggregates champions and items over all participants', () => {
    const service = new GeneralStatsService({ db: seed(), source: source('16.3.1') })

    const result = service.run()

    expect(result.sample).toEqual({ matches: 2, picks: 6 })
    expect(result.patches).toEqual(['16.21', '16.20'])
    expect(result.hasStaticData).toBe(true)

    const garen = result.champions.find((entry) => entry.championId === 'Garen')
    expect(garen).toMatchObject({ picks: 3, wins: 2 })
    expect(garen?.pickRate).toBeCloseTo(3 / 6)
    expect(garen?.winRate).toBeCloseTo(2 / 3)

    const ahri = result.champions.find((entry) => entry.championId === 'Ahri')
    expect(ahri).toMatchObject({ picks: 3, wins: 1 })

    const mortal = result.items.find((entry) => entry.itemId === 3033)
    expect(mortal).toMatchObject({ name: 'Mortal Reminder', purchases: 3, wins: 2 })
    expect(mortal?.winRate).toBeCloseTo(2 / 3)
    expect(result.items.find((entry) => entry.itemId === 1001)).toMatchObject({
      name: 'Boots',
      purchases: 3,
      wins: 2,
    })
  })

  it('filters by queue and patch', () => {
    const service = new GeneralStatsService({ db: seed(), source: source('16.3.1') })

    const byQueue = service.run({ queue: 440 })
    expect(byQueue.sample).toEqual({ matches: 1, picks: 2 })
    expect(byQueue.champions.find((entry) => entry.championId === 'Garen')).toMatchObject({
      picks: 1,
      wins: 1,
    })
    expect(byQueue.items.find((entry) => entry.itemId === 3033)).toMatchObject({
      purchases: 1,
      wins: 0,
    })

    expect(service.run({ patch: '16.20' }).sample).toEqual({ matches: 1, picks: 2 })
  })

  it('falls back to ids without static data', () => {
    const service = new GeneralStatsService({ db: seed(), source: source(null) })

    const result = service.run()

    expect(result.hasStaticData).toBe(false)
    expect(result.champions[0]?.name).toMatch(/^Champion \d+$/)
    expect(result.items[0]?.name).toMatch(/^Item \d+$/)
  })

  it('uses only the tracked account when a getAccount provider is supplied', () => {
    const db = memoryDb()
    insertMatch(db, {
      id: 'EUW1_OWN',
      queue: 420,
      creation: 1000,
      participants: [
        { team: 100, champion: GAREN, win: true, puuid: 'me' },
        { team: 200, champion: AHRI, win: false },
      ],
    })
    const service = new GeneralStatsService({
      db,
      source: source('16.3.1'),
      getAccount: () => ({ puuid: 'me' }),
    })

    const result = service.run()

    expect(result.sample).toEqual({ matches: 1, picks: 1 })
    expect(result.champions.map((entry) => entry.championId)).toEqual(['Garen'])
    expect(result.champions.find((entry) => entry.championId === 'Ahri')).toBeUndefined()
  })

  it('handles an empty sample', () => {
    const service = new GeneralStatsService({ db: memoryDb(), source: source('16.3.1') })

    const result = service.run()

    expect(result.sample).toEqual({ matches: 0, picks: 0 })
    expect(result.champions).toEqual([])
    expect(result.items).toEqual([])
    expect(result.patches).toEqual([])
    expect(result.hasStaticData).toBe(true)
  })
})
