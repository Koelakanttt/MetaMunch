import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
import { RiotApiError } from '../../src/main/providers/riot-api'
import { ResearchService } from '../../src/main/services/research-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import { parseMatch } from '../../src/shared/riot'
import { memoryDb } from '../helpers/db'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

function dragonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(dragonFixture('champion.json')).values
const items = parseItemList(dragonFixture('item.json')).values

function source(): StaticDataSource {
  return {
    latestVersion: () => '16.3.1',
    champions: () => champions,
    items: () => items,
  }
}

describe('ResearchService', () => {
  it('collects a ladder-seeded match and reports the sample', async () => {
    let leagueCalls = 0
    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => ['EUW1_7000000001'],
      getMatch: async () => parseMatch(fixture('match.json')),
      getLeagueEntries: async () => {
        leagueCalls += 1
        return leagueCalls === 1
          ? [
              {
                puuid: 'seed',
                tier: 'DIAMOND',
                rank: 'I',
                queueType: 'RANKED_SOLO_5x5',
                leaguePoints: 0,
                wins: 0,
                losses: 0,
              },
            ]
          : []
      },
    }
    const service = new ResearchService({
      db: memoryDb(),
      provider,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
      now: () => 1,
    })

    const result = await service.collect(1)

    expect(result).toMatchObject({ requested: 1, saved: 1, skipped: 0, seedPlayers: 1 })
    expect(service.status()).toMatchObject({
      matches: 1,
      participants: 10,
      snapshot: { patch: '16.21', region: 'EUW1', rankScope: 'MASTER+ / DIAMOND I-IV' },
    })
    expect(service.summary().champions.length).toBeGreaterThan(0)
  })

  it('rejects collection without static data', async () => {
    const service = new ResearchService({
      db: memoryDb(),
      provider: {} as RiotApiProvider,
      source: source(),
      getPatch: () => null,
      getRegion: () => 'EUW1',
    })

    await expect(service.collect(1)).rejects.toThrow('Static data')
  })

  it('stores compact timelines for sampled matches', async () => {
    const db = memoryDb()
    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => ['EUW1_7000000001'],
      getMatch: async () => parseMatch(fixture('match.json')),
      getLeagueEntries: async () => [
        {
          puuid: 'seed',
          tier: 'DIAMOND',
          rank: 'I',
          queueType: 'RANKED_SOLO_5x5',
          leaguePoints: 0,
          wins: 0,
          losses: 0,
        },
      ],
      getTimelineRaw: async () => ({
        info: {
          frames: [
            {
              events: [
                { timestamp: 1000, type: 'ITEM_PURCHASED', participantId: 1, itemId: 2003 },
                { timestamp: 60000, type: 'ITEM_PURCHASED', participantId: 1, itemId: 3033 },
                {
                  timestamp: 61000,
                  type: 'SKILL_LEVEL_UP',
                  participantId: 1,
                  skillSlot: 1,
                  level: 1,
                  levelUpType: 'NORMAL',
                },
              ],
            },
          ],
        },
      }),
    }
    const service = new ResearchService({
      db,
      provider,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
      getTimelineMode: () => 'full',
      now: () => 1,
    })

    await service.collect(1)
    const status = service.status()

    expect(status.timelineMode).toBe('full')
    expect(status.timelineEvents).toBe(10)
    const row = db
      .prepare('SELECT purchase_order, skill_order FROM research_timelines WHERE participant_id = 1')
      .get() as Record<string, unknown>
    expect(JSON.parse(String(row['purchase_order']))).toEqual([3033])
    expect(String(row['skill_order'])).toBe('Q')
  })

  it('does not request timelines when collection is off', async () => {
    let timelineCalls = 0
    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => ['EUW1_7000000001'],
      getMatch: async () => parseMatch(fixture('match.json')),
      getLeagueEntries: async () => [
        {
          puuid: 'seed',
          tier: 'DIAMOND',
          rank: 'I',
          queueType: 'RANKED_SOLO_5x5',
          leaguePoints: 0,
          wins: 0,
          losses: 0,
        },
      ],
      getTimelineRaw: async () => {
        timelineCalls += 1
        return { info: { frames: [] } }
      },
    }
    const service = new ResearchService({
      db: memoryDb(),
      provider,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
      getTimelineMode: () => 'off',
      now: () => 1,
    })

    await service.collect(1)

    expect(timelineCalls).toBe(0)
    expect(service.status().timelineEvents).toBe(0)
  })

  it('keeps collecting matches when a timeline request fails', async () => {
    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => ['EUW1_7000000001'],
      getMatch: async () => parseMatch(fixture('match.json')),
      getLeagueEntries: async () => [
        {
          puuid: 'seed',
          tier: 'DIAMOND',
          rank: 'I',
          queueType: 'RANKED_SOLO_5x5',
          leaguePoints: 0,
          wins: 0,
          losses: 0,
        },
      ],
      getTimelineRaw: async () => {
        throw new RiotApiError(429, 'rate limited')
      },
    }
    const service = new ResearchService({
      db: memoryDb(),
      provider,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
      getTimelineMode: () => 'full',
      now: () => 1,
    })

    const result = await service.collect(1)
    const status = service.status()

    expect(result.saved).toBe(1)
    expect(status.state).toBe('complete')
    expect(status.lastError).toBeNull()
    expect(status.timelineEvents).toBe(0)
  })
})
