import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PoolService } from '../../src/main/services/pool-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import { insertMatch, memoryDb } from '../helpers/db'

const ME = 'puuid-me'
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
  const add = (id: string, queue: number, creation: number, champion: number, win: boolean, remake = false) => {
    insertMatch(db, {
      id,
      queue,
      creation,
      remake,
      participants: [{ team: 100, champion, win, puuid: ME }],
    })
  }
  add('EUW1_1', 420, 1000, GAREN, true)
  add('EUW1_2', 400, 2000, GAREN, false)
  add('EUW1_3', 440, 3000, AHRI, true)
  add('EUW1_4', 450, 4000, AHRI, true)
  add('EUW1_5', 420, 5000, GAREN, true, true)
  add('EUW1_6', 420, 6000, 999, true)
  return db
}

const account = { puuid: ME, gameName: 'Me', tagLine: 'EUW' }

describe('PoolService', () => {
  it('aggregates my pool by champion with adjusted win rates', () => {
    const service = new PoolService({
      db: seed(),
      source: source('16.3.1'),
      getAccount: () => account,
    })

    const result = service.list()

    expect(result.account).toEqual({ gameName: 'Me', tagLine: 'EUW' })
    expect(result.hasStaticData).toBe(true)
    expect(result.overall).toEqual({
      games: 4,
      wins: 3,
      lowSample: true,
      adjustedWinRate: (3 + 5 * 0.75) / 9,
    })
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({
      championId: 'Garen',
      name: 'Garen',
      games: 2,
      wins: 1,
      lowSample: true,
      lastGameCreation: 2000,
    })
    expect(result.entries[0]?.adjustedWinRate).toBeCloseTo((1 + 5 * 0.75) / 7)
    expect(result.entries[1]).toMatchObject({ championId: 'Ahri', games: 1, wins: 1 })
  })

  it('returns nothing without an account', () => {
    const service = new PoolService({
      db: memoryDb(),
      source: source('16.3.1'),
      getAccount: () => null,
    })

    expect(service.list()).toEqual({
      account: null,
      overall: null,
      entries: [],
      hasStaticData: false,
    })
  })

  it('keeps the overall record when static data is missing', () => {
    const service = new PoolService({ db: seed(), source: source(null), getAccount: () => account })

    const result = service.list()

    expect(result.account).not.toBeNull()
    expect(result.overall?.games).toBe(4)
    expect(result.entries).toEqual([])
    expect(result.hasStaticData).toBe(false)
  })
})
