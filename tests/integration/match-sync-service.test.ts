import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import { RiotApiError } from '../../src/main/providers/riot-api'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
import { MatchSyncService } from '../../src/main/services/match-sync-service'
import { parseAccount, parseMatch } from '../../src/shared/riot'
import type { Match } from '../../src/shared/riot'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

const ids = ['EUW1_7000000003', 'EUW1_7000000002', 'EUW1_7000000001']

function matchWithId(raw: unknown, matchId: string): Match {
  const copy = JSON.parse(JSON.stringify(raw)) as { metadata: { matchId: string } }
  copy.metadata.matchId = matchId
  return parseMatch(copy)
}

function createProvider(
  fixtureIds: string[],
  options: { failingMatchId?: string; error?: Error } = {},
) {
  const raw = fixture('match.json')
  const calls = { ids: 0, matches: 0 }
  const provider: RiotApiProvider = {
    getAccountByRiotId: async () => parseAccount(fixture('account.json')),
    getMatchIds: async () => {
      calls.ids += 1
      return fixtureIds
    },
    getMatch: async (matchId) => {
      calls.matches += 1
      if (matchId === options.failingMatchId) throw options.error ?? new Error('boom')
      return matchWithId(raw, matchId)
    },
  }
  return { provider, calls }
}

function migratedDb() {
  const db = openDb(':memory:')
  runMigrations(db, migrations)
  return db
}

async function readyService(provider: RiotApiProvider): Promise<MatchSyncService> {
  const service = new MatchSyncService({ db: migratedDb(), provider })
  await service.setAccount('Бигбули#22222')
  return service
}

describe('MatchSyncService', () => {
  it('saves new matches, then skips them on the next sync', async () => {
    const { provider, calls } = createProvider(ids)
    const service = await readyService(provider)

    const first = await service.sync()
    expect(first).toEqual({ requested: 3, saved: 3, skippedExisting: 0, failed: 0 })
    expect(service.status()).toEqual({
      account: { gameName: 'Бигбули', tagLine: '22222' },
      matches: 3,
      lastGameCreation: 1761350000000,
    })
    expect(calls.matches).toBe(3)

    const second = await service.sync()
    expect(second).toEqual({ requested: 0, saved: 0, skippedExisting: 3, failed: 0 })
    expect(calls.matches).toBe(3)
  })

  it('counts a plain failure and keeps going', async () => {
    const failingMatchId = ids[1] ?? 'EUW1_7000000002'
    const { provider } = createProvider(ids, { failingMatchId })
    const service = await readyService(provider)

    const result = await service.sync()

    expect(result).toEqual({ requested: 3, saved: 2, skippedExisting: 0, failed: 1 })
  })

  it('rethrows a 403 from getMatch', async () => {
    const { provider } = createProvider(ids, {
      failingMatchId: ids[0],
      error: new RiotApiError(403, 'forbidden'),
    })
    const service = await readyService(provider)

    await expect(service.sync()).rejects.toMatchObject({ status: 403 })
  })

  it('honours maxNewMatches', async () => {
    const { provider } = createProvider(ids)
    const service = await readyService(provider)

    const result = await service.sync({ maxNewMatches: 2 })

    expect(result).toEqual({ requested: 2, saved: 2, skippedExisting: 0, failed: 0 })
  })

  it('stores the account and reports it', async () => {
    const { provider } = createProvider(ids)
    const service = await readyService(provider)

    expect(service.status()).toEqual({
      account: { gameName: 'Бигбули', tagLine: '22222' },
      matches: 0,
      lastGameCreation: null,
    })
  })

  it('rejects sync without an account', async () => {
    const { provider } = createProvider(ids)
    const service = new MatchSyncService({ db: migratedDb(), provider })

    await expect(service.sync()).rejects.toThrow('No account set')
  })
})
