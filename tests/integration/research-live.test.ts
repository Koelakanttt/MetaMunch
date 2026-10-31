import { describe, it } from 'vitest'
import { getRiotApiKey, loadEnv } from '../../src/main/env'
import { openDb } from '../../src/main/db/open'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { HttpDataDragonProvider } from '../../src/main/providers/http-data-dragon'
import { HttpRiotApiProvider } from '../../src/main/providers/http-riot-api'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { ResearchService } from '../../src/main/services/research-service'
import { toPatch } from '../../src/shared/riot'

describe.skipIf(!process.env['LIVE_RESEARCH'])('Research sample live', () => {
  it(
    'crawls 10 real matches and prints the aggregated row count',
    async () => {
      loadEnv(process.cwd())
      const apiKey = getRiotApiKey()
      if (!apiKey) throw new Error('RIOT_API_KEY must be set for the live research test')

      const dragon = new HttpDataDragonProvider()
      const version = await dragon.getLatestVersion()
      const provider = new HttpRiotApiProvider({
        apiKey,
        platform: 'EUW1',
        region: 'europe',
      })
      const source: StaticDataSource = {
        latestVersion: () => version,
        champions: () => [],
        items: () => [],
      }
      const db = openDb(':memory:')
      runMigrations(db, migrations)
      const service = new ResearchService({
        db,
        provider,
        source,
        getPatch: () => toPatch(version),
        getRegion: () => 'EUW1',
      })

      const result = await service.collect(10)
      const status = service.status()
      console.info(
        JSON.stringify({
          saved: result.saved,
          state: status.state,
          matches: status.matches,
          participants: status.participants,
          coverageRows: status.coverage.length,
        }),
      )
    },
    180000,
  )
})
