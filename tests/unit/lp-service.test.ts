import { describe, expect, it } from 'vitest'
import { memoryDb } from '../helpers/db'
import { upsertAccount } from '../../src/main/db/matches-repo'
import { LpService } from '../../src/main/services/lp-service'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'

const account = { puuid: 'puuid-me', gameName: 'Me', tagLine: '1' }

function provider(calls: { value: number }): RiotApiProvider {
  return {
    getAccountByRiotId: async () => account,
    getMatchIds: async () => [],
    getMatch: async () => {
      throw new Error('not used')
    },
    getLeagueEntriesByPuuid: async () => {
      calls.value += 1
      return [
        {
          tier: 'GOLD',
          rank: 'II',
          queueType: 'RANKED_SOLO_5x5',
          leaguePoints: 42,
          wins: 10,
          losses: 8,
        },
      ]
    },
  }
}

describe('LpService', () => {
  it('stores at most one snapshot per hour', async () => {
    const db = memoryDb()
    upsertAccount(db, account, 'EUW1', 1)
    const calls = { value: 0 }
    let now = 1_000_000
    const service = new LpService({
      db,
      provider: () => provider(calls),
      getAccount: () => account,
      now: () => now,
    })
    expect(await service.snapshot()).toMatchObject({ tier: 'GOLD', division: 'II', leaguePoints: 42 })
    now += 30 * 60 * 1000
    await service.snapshot()
    expect(calls.value).toBe(1)
    expect(service.history()).toHaveLength(1)
    now += 60 * 60 * 1000
    await service.snapshot()
    expect(calls.value).toBe(2)
    expect(service.history()).toHaveLength(2)
  })
})
