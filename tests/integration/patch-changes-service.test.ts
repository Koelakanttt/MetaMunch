import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { savePatch } from '../../src/main/db/static-data-repo'
import type { Champion } from '../../src/shared/ddragon'
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
const baseChampions = parseChampionList(fixture('champion.json')).values
const baseItems = parseItemList(fixture('item.json')).values

function champion(id: string, key: number, hp: number): Champion {
  return {
    key,
    id,
    name: id,
    tags: ['Fighter'],
    info: { attack: 5, defense: 5, magic: 1, difficulty: 1 },
    stats: { hp },
  }
}

function detail(id: string, hp: number, cooldown: number): ChampionDetail {
  return {
    id,
    name: id,
    stats: { hp },
    passiveName: 'Passive',
    spells: [
      {
        id: 'Q',
        name: 'Q',
        cooldown: [cooldown],
        cost: [],
        range: [],
        effects: [],
      },
    ],
  }
}

function createProvider() {
  const beforeChampions = [
    ...baseChampions.filter((entry) => entry.id !== 'Garen'),
    champion('Garen', 86, 690),
    champion('Removed', 9998, 500),
  ]
  const afterChampions = [
    ...baseChampions.filter((entry) => entry.id !== 'Garen'),
    champion('Garen', 86, 700),
    champion('Added', 9999, 500),
  ]
  const beforeItems = baseItems
  const sampleItem = baseItems[0]
  if (!sampleItem) throw new Error('missing item fixture')
  const afterItems = [
    ...baseItems.map((item) => (item.id === 3033 ? { ...item, goldTotal: 3100 } : item)),
    {
      ...sampleItem,
      id: 9900,
      name: 'Added Item',
      into: [],
    },
  ]
  const calls = { detail: 0, active: 0, maxActive: 0 }
  const provider: DataDragonProvider = {
    getLatestVersion: async () => TO,
    getVersions: async () => [TO, FROM],
    getChampions: async (version) => ({
      values: version === TO ? afterChampions : beforeChampions,
      skipped: [],
    }),
    getItems: async (version) => ({
      values: version === TO ? afterItems : beforeItems,
      skipped: [],
    }),
    getChampionDetail: async (version, championId) => {
      calls.detail += 1
      calls.active += 1
      calls.maxActive = Math.max(calls.maxActive, calls.active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      calls.active -= 1
      return detail(championId, version === TO ? 700 : 690, version === TO ? 8 : 9)
    },
  }
  return { provider, calls }
}

function seededDb() {
  const db = memoryDb()
  savePatch(db, TO, baseChampions, baseItems, 1)
  for (let index = 0; index < 3; index += 1) {
    insertMatch(db, {
      id: `EUW1_${100 + index}`,
      queue: 420,
      creation: index + 1,
      participants: [{ team: 100, champion: 86, win: true, puuid: ME }],
    })
  }
  return db
}

async function waitForAbilities(service: PatchChangesService) {
  for (let index = 0; index < 100; index += 1) {
    if (!service.abilityStatus().progress.running) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('ability load did not finish')
}

describe('PatchChangesService (whole patch)', () => {
  it('diffs all champions and shop items, including added/removed entries', async () => {
    const { provider } = createProvider()
    const service = new PatchChangesService({
      db: seededDb(),
      provider,
      getAccount: () => ACCOUNT,
    })

    const result = await service.run()

    expect(result.from).toBe(FROM)
    expect(result.to).toBe(TO)
    expect(result.versions).toContain(TO)
    expect(result.champions.find((entry) => entry.id === 'Garen')?.status).toBe('changed')
    expect(result.champions.find((entry) => entry.id === 'Added')?.status).toBe('added')
    expect(result.champions.find((entry) => entry.id === 'Removed')?.status).toBe('removed')
    expect(result.items.find((entry) => entry.name === 'Mortal Reminder')?.changes).toContainEqual({
      label: 'Total cost',
      before: '3000',
      after: '3100',
    })
    expect(result.summary.championsChanged).toBeGreaterThan(0)
    expect(result.summary.added).toBeGreaterThanOrEqual(2)
    expect(result.pool).toEqual([{ id: 'Garen', name: 'Garen', games: 3 }])
  })

  it('loads ability details lazily with at most three requests and caches them', async () => {
    const { provider, calls } = createProvider()
    const service = new PatchChangesService({
      db: seededDb(),
      provider,
      getAccount: () => ACCOUNT,
    })
    await service.run()

    const started = service.startAbilityLoad()
    expect(started.progress.running).toBe(true)
    await waitForAbilities(service)

    expect(calls.maxActive).toBeLessThanOrEqual(3)
    expect(service.abilityStatus().progress.loaded).toBeGreaterThan(0)
    expect(service.abilityStatus().changes['Garen']).toBeDefined()

    const beforeSecond = calls.detail
    service.startAbilityLoad()
    await waitForAbilities(service)
    expect(calls.detail).toBe(beforeSecond)
  })

  it('can filter champions to the owner pool', async () => {
    const { provider } = createProvider()
    const service = new PatchChangesService({
      db: seededDb(),
      provider,
      getAccount: () => ACCOUNT,
    })

    const result = await service.run({ poolOnly: true })

    expect(result.champions.map((entry) => entry.id)).toEqual(['Garen'])
  })
})
