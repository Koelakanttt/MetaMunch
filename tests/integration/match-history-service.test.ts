import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MatchHistoryService } from '../../src/main/services/match-history-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
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
      participants: [{ team: 100, champion, win, puuid: ME, items: [3033, 0, 0, 0, 0, 0] }],
    })
  }
  add('EUW1_1', 420, 1000, GAREN, true)
  add('EUW1_2', 420, 2000, AHRI, false)
  add('EUW1_3', 440, 3000, GAREN, true)
  add('EUW1_4', 450, 4000, GAREN, true)
  add('EUW1_5', 420, 5000, GAREN, true, true)
  db.prepare("UPDATE matches SET patch = '16.20' WHERE match_id = 'EUW1_2'").run()
  db.prepare("UPDATE participants SET position = 'JUNGLE' WHERE match_id = 'EUW1_2'").run()
  return db
}

describe('MatchHistoryService', () => {
  it('lists my matches newest first with names and patches', () => {
    const service = new MatchHistoryService({
      db: seed(),
      source: source('16.3.1'),
      getAccount: () => ACCOUNT,
    })

    const result = service.list()

    expect(result.account).toEqual({ gameName: 'Me', tagLine: 'EUW' })
    expect(result.hasStaticData).toBe(true)
    expect(result.patches).toEqual(['16.21', '16.20'])
    expect(result.entries.map((entry) => entry.matchId)).toEqual([
      'EUW1_3',
      'EUW1_2',
      'EUW1_1',
    ])
    expect(result.entries[0]?.championName).toBe('Garen')
    expect(result.entries[1]?.position).toBe('JUNGLE')
    expect(result.entries[1]?.patch).toBe('16.20')
    expect(result.entries[0]?.items).toEqual([{ id: 3033, name: 'Mortal Reminder' }])
  })

  it('filters by champion, role and patch', () => {
    const service = new MatchHistoryService({
      db: seed(),
      source: source('16.3.1'),
      getAccount: () => ACCOUNT,
    })

    expect(service.list({ championId: 'Garen' }).entries.map((entry) => entry.matchId)).toEqual([
      'EUW1_3',
      'EUW1_1',
    ])
    expect(service.list({ position: 'JUNGLE' }).entries.map((entry) => entry.matchId)).toEqual([
      'EUW1_2',
    ])
    expect(service.list({ patch: '16.20' }).entries.map((entry) => entry.matchId)).toEqual([
      'EUW1_2',
    ])
    expect(service.list({ queue: 440 }).entries.map((entry) => entry.matchId)).toEqual([
      'EUW1_3',
    ])
    expect(service.list({ queue: 400 }).entries).toEqual([])
  })

  it('returns no entries for an unknown champion but keeps the patches', () => {
    const service = new MatchHistoryService({
      db: seed(),
      source: source('16.3.1'),
      getAccount: () => ACCOUNT,
    })

    const result = service.list({ championId: 'Nobody' })

    expect(result.entries).toEqual([])
    expect(result.patches).toEqual(['16.21', '16.20'])
    expect(result.hasStaticData).toBe(true)
  })

  it('falls back to ids without static data', () => {
    const service = new MatchHistoryService({
      db: seed(),
      source: source(null),
      getAccount: () => ACCOUNT,
    })

    const result = service.list()

    expect(result.hasStaticData).toBe(false)
    expect(result.entries[0]?.championName).toBe('Champion 86')
    expect(result.entries[0]?.items).toEqual([{ id: 3033, name: 'Item 3033' }])
  })

  it('returns nothing without an account', () => {
    const service = new MatchHistoryService({
      db: memoryDb(),
      source: source('16.3.1'),
      getAccount: () => null,
    })

    expect(service.list()).toEqual({
      account: null,
      entries: [],
      patches: [],
      hasStaticData: false,
    })
  })
})
