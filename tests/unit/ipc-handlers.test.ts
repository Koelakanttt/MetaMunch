import { describe, expect, it } from 'vitest'
import { loadChampionTags, loadRules } from '../../src/main/data/rules-data'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import { createHandlers } from '../../src/main/ipc/handlers'
import type { DataDragonProvider } from '../../src/main/providers/data-dragon'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
import { MatchSyncService } from '../../src/main/services/match-sync-service'
import { RecommendationService } from '../../src/main/services/recommendation-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { StaticDataService } from '../../src/main/services/static-data-service'

const dataDragonProvider: DataDragonProvider = {
  getLatestVersion: async () => '16.3.1',
  getChampions: async () => ({ values: [], skipped: [] }),
  getItems: async () => ({ values: [], skipped: [] }),
}

const riotProvider: RiotApiProvider = {
  getAccountByRiotId: async () => ({ puuid: 'puuid-test', gameName: 'Test', tagLine: 'TAG' }),
  getMatchIds: async () => [],
  getMatch: async () => {
    throw new Error('not used')
  },
}

const fakeSource: StaticDataSource = {
  latestVersion: () => null,
  champions: () => [],
  items: () => [],
}

const db = openDb(':memory:')
runMigrations(db, migrations)
const staticData = new StaticDataService({ db, provider: dataDragonProvider })
const matchSync = new MatchSyncService({ db, provider: riotProvider })
const recommendation = new RecommendationService({
  source: fakeSource,
  rules: loadRules(),
  tags: loadChampionTags(),
})
const handlers = createHandlers({ db, staticData, matchSync, recommendation })

describe('ipc handlers', () => {
  it('answers app:ping with pong and a timestamp', async () => {
    const res = await handlers['app:ping']({ message: 'x' })

    expect(res.reply).toBe('pong: x')
    expect(typeof res.at).toBe('number')
  })

  it('reports db info', async () => {
    const res = await handlers['db:info']({})

    expect(res.schemaVersion).toBe(4)
    expect(res.sqliteVersion).toMatch(/^3\./)
  })

  it('lists champions without static data', () => {
    expect(handlers['champions:list']({})).toEqual({ version: null, champions: [] })
  })

  it('rejects recommendations without static data', () => {
    expect(() =>
      handlers['recommend:run']({ meId: 'Garen', role: 'TOP', enemyIds: [] }),
    ).toThrow('Update data')
  })
})
