import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { savePatch } from '../../src/main/db/static-data-repo'
import type { DataDragonProvider } from '../../src/main/providers/data-dragon'
import { PatchChangesService } from '../../src/main/services/patch-changes-service'
import type { TrackedAccount } from '../../src/main/services/personal-stats-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import type { ChampionDetail } from '../../src/shared/ddragon-detail'
import { insertMatch, memoryDb } from '../helpers/db'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const TO = '16.21.1'
const FROM = '16.20.1'
const ME = 'puuid-me'
const ACCOUNT: TrackedAccount = { puuid: ME, gameName: 'Me', tagLine: 'EUW' }

const champions = parseChampionList(fixture('champion.json')).values
const items = parseItemList(fixture('item.json')).values

function detail(hp: number): ChampionDetail {
  return { id: 'Garen', name: 'Garen', stats: { hp }, passiveName: 'Perseverance', spells: [] }
}

function createProvider(
  calls: { detail: number },
  options: { failBefore?: boolean } = {},
): DataDragonProvider {
  const fromItems = items.map((item) => (item.id === 3033 ? { ...item, goldTotal: 3100 } : item))
  return {
    getLatestVersion: async () => TO,
    getVersions: async () => [TO, FROM],
    getChampions: async () => ({ values: champions, skipped: [] }),
    getItems: async () => ({ values: fromItems, skipped: [] }),
    getChampionDetail: async (version, championId) => {
      calls.detail += 1
      if (championId !== 'Garen') throw new Error(`no detail for ${championId}`)
      if (options.failBefore && version === FROM) throw new Error('missing detail')
      return detail(version === FROM ? 690 : 700)
    },
  }
}

function seededDb() {
  const db = memoryDb()
  savePatch(db, TO, champions, items, 1)
  for (let index = 0; index < 3; index += 1) {
    insertMatch(db, {
      id: `EUW1_${100 + index}`,
      queue: 420,
      creation: index + 1,
      participants: [
        { team: 100, champion: 86, win: index !== 1, puuid: ME, items: [3033, 0, 0, 0, 0, 0] },
      ],
    })
  }
  return db
}

function createService(
  db: ReturnType<typeof memoryDb>,
  provider: DataDragonProvider,
  account: TrackedAccount | null,
): PatchChangesService {
  return new PatchChangesService({ db, provider, getAccount: () => account })
}

describe('PatchChangesService', () => {
  it('notes a missing account', async () => {
    const db = memoryDb()
    savePatch(db, TO, champions, items, 1)
    const service = createService(db, createProvider({ detail: 0 }), null)

    const result = await service.run()

    expect(result).toEqual({
      from: null,
      to: TO,
      pool: [],
      champions: [],
      items: [],
      notes: ['No account set.'],
    })
  })

  it('notes missing static data', async () => {
    const service = createService(memoryDb(), createProvider({ detail: 0 }), ACCOUNT)

    const result = await service.run()

    expect(result.to).toBeNull()
    expect(result.notes).toEqual(['No static data yet. Press "Update data" first.'])
  })

  it('produces champion and item changes', async () => {
    const calls = { detail: 0 }
    const service = createService(seededDb(), createProvider(calls), ACCOUNT)

    const result = await service.run()

    expect(result.from).toBe(FROM)
    expect(result.to).toBe(TO)
    expect(result.pool).toEqual([{ id: 'Garen', name: 'Garen', games: 3 }])
    expect(result.champions).toEqual([
      { id: 'Garen', name: 'Garen', changes: [{ label: 'hp', before: '690', after: '700' }] },
    ])
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe('3033')
    expect(result.items[0]?.name).toBe('Mortal Reminder')
    expect(result.items[0]?.changes).toContainEqual({
      label: 'Total cost',
      before: '3100',
      after: '3000',
    })
    expect(result.notes).toEqual([])
    expect(calls.detail).toBe(2)
  })

  it('serves champion details from the cache on the second run', async () => {
    const calls = { detail: 0 }
    const service = createService(seededDb(), createProvider(calls), ACCOUNT)

    const first = await service.run()
    const second = await service.run()

    expect(calls.detail).toBe(2)
    expect(second.champions).toEqual(first.champions)
  })

  it('notes a champion without details', async () => {
    const service = createService(
      seededDb(),
      createProvider({ detail: 0 }, { failBefore: true }),
      ACCOUNT,
    )

    const result = await service.run()

    expect(result.champions).toEqual([{ id: 'Garen', name: 'Garen', changes: [] }])
    expect(result.notes).toContain('No details for Garen in 16.20.1')
  })
})
