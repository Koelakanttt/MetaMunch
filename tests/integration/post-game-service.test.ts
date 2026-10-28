import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PostGameService } from '../../src/main/services/post-game-service'
import { RecommendationService } from '../../src/main/services/recommendation-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import { parseRules } from '../../src/shared/rules'
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

function source(version: string | null = '16.3.1'): StaticDataSource {
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
      { team: 100, champion: GAREN, win: true, puuid: ME, items: [1001, 0, 0, 0, 0, 0] },
      { team: 200, champion: AHRI, win: false },
    ],
  })
  return db
}

function service(db = seed(), version: string | null = '16.3.1') {
  const ruleSet = source(version)
  const recommendation = new RecommendationService({
    source: ruleSet,
    rules: parseRules({
      version: 1,
      rules: [],
      coreByClass: { Fighter: { traits: ['ad', 'crit'], reason: 'Test core.' } },
    }),
    tags: { version: 1, champions: {} },
  })
  return new PostGameService({
    db,
    getAccount: () => ACCOUNT,
    source: ruleSet,
    recommendation,
    championChanges: async () => [{ label: 'hp', before: '690', after: '700' }],
  })
}

describe('PostGameService', () => {
  it('compares the last game with the recommendations', async () => {
    const result = await service().review()

    expect(result.state).toBe('ready')
    if (result.state !== 'ready') return

    expect(result.review.match).toMatchObject({
      matchId: 'EUW1_1',
      championId: 'Garen',
      championName: 'Garen',
      win: true,
      patch: '16.21',
    })
    expect(result.review.match.items).toEqual([{ id: 1001, name: 'Boots' }])
    expect(result.review.recommended.map((entry) => entry.name)).toContain('Mortal Reminder')
    expect(result.review.missed).toContain('Mortal Reminder')
    expect(result.review.patchChanges).toEqual([{ label: 'hp', before: '690', after: '700' }])
  })

  it('works without static data', async () => {
    const result = await service(seed(), null).review()

    expect(result.state).toBe('ready')
    if (result.state !== 'ready') return
    expect(result.review.match.championId).toBeNull()
    expect(result.review.recommended).toEqual([])
    expect(result.review.patchChanges).toBeNull()
  })

  it('reports a missing account', async () => {
    const result = await new PostGameService({
      db: memoryDb(),
      getAccount: () => null,
      source: source(),
      recommendation: new RecommendationService({
        source: source(),
        rules: parseRules({ version: 1, rules: [] }),
        tags: { version: 1, champions: {} },
      }),
    }).review()

    expect(result).toEqual({ state: 'no-account' })
  })

  it('reports a missing match', async () => {
    const result = await new PostGameService({
      db: memoryDb(),
      getAccount: () => ACCOUNT,
      source: source(),
      recommendation: new RecommendationService({
        source: source(),
        rules: parseRules({ version: 1, rules: [] }),
        tags: { version: 1, champions: {} },
      }),
    }).review()

    expect(result).toEqual({ state: 'no-matches' })
  })
})
