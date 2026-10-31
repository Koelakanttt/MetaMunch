import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
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
                tier: 'EMERALD',
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
})
