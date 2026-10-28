import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import type { DataDragonProvider } from '../../src/main/providers/data-dragon'
import { StaticDataService } from '../../src/main/services/static-data-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values
const items = parseItemList(fixture('item.json')).values

function migratedDb() {
  const db = openDb(':memory:')
  runMigrations(db, migrations)
  return db
}

describe('StaticDataService', () => {
  it('refreshes once and then serves from cache', async () => {
    const calls = { version: 0, champions: 0, items: 0 }
    const provider: DataDragonProvider = {
      getLatestVersion: async () => {
        calls.version += 1
        return '16.3.1'
      },
      getChampions: async () => {
        calls.champions += 1
        return { values: champions, skipped: [] }
      },
      getItems: async () => {
        calls.items += 1
        return { values: items, skipped: [] }
      },
      getVersions: async () => [],
      getChampionDetail: async () => {
        throw new Error('not used')
      },
    }

    const service = new StaticDataService({ db: migratedDb(), provider, now: () => 42 })

    expect(service.status()).toBeNull()

    const first = await service.refresh()
    expect(first).toEqual({ version: '16.3.1', fromCache: false, champions: 3, items: 4 })
    expect(service.status()).toEqual({
      version: '16.3.1',
      fetchedAt: 42,
      champions: 3,
      items: 4,
    })
    expect(calls).toEqual({ version: 1, champions: 1, items: 1 })

    const second = await service.refresh()
    expect(second).toEqual({ version: '16.3.1', fromCache: true, champions: 3, items: 4 })
    expect(calls).toEqual({ version: 2, champions: 1, items: 1 })
  })

  it('writes nothing when a provider call fails', async () => {
    const provider: DataDragonProvider = {
      getLatestVersion: async () => '16.3.1',
      getChampions: async () => ({ values: champions, skipped: [] }),
      getItems: async () => {
        throw new Error('boom')
      },
      getVersions: async () => [],
      getChampionDetail: async () => {
        throw new Error('not used')
      },
    }

    const service = new StaticDataService({ db: migratedDb(), provider })

    await expect(service.refresh()).rejects.toThrow('boom')
    expect(service.status()).toBeNull()
  })

  it('shares one in-flight refresh and then starts a new one', async () => {
    const calls = { version: 0, champions: 0, items: 0 }
    const provider: DataDragonProvider = {
      getLatestVersion: async () => {
        calls.version += 1
        return '16.3.1'
      },
      getChampions: async () => {
        calls.champions += 1
        return { values: champions, skipped: [] }
      },
      getItems: async () => {
        calls.items += 1
        return { values: items, skipped: [] }
      },
      getVersions: async () => [],
      getChampionDetail: async () => {
        throw new Error('not used')
      },
    }
    const service = new StaticDataService({ db: migratedDb(), provider, now: () => 1 })

    const first = service.refresh()
    const second = service.refresh()

    expect(second).toBe(first)
    expect(await first).toEqual(await second)
    expect(calls).toEqual({ version: 1, champions: 1, items: 1 })

    const third = await service.refresh()
    expect(third.fromCache).toBe(true)
    expect(calls.version).toBe(2)
  })
})
