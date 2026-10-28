import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RuneService } from '../../src/main/services/rune-service'
import type { RuneDataProvider } from '../../src/main/providers/rune-data'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList } from '../../src/shared/ddragon'
import type { RuneTree } from '../../src/shared/runes'
import { insertMatch, memoryDb } from '../helpers/db'

const GAREN = 86
const AHRI = 103

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values

function source(version: string | null = '16.3.1'): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => [],
  }
}

const trees: RuneTree[] = [
  {
    id: 8000,
    name: 'Precision',
    icon: 'perk-images/Styles/7201_Precision.png',
    slots: [
      {
        runes: [
          { id: 8005, name: 'Press the Attack', icon: 'perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png' },
          { id: 8021, name: 'Fleet Footwork', icon: 'perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png' },
        ],
      },
    ],
  },
  {
    id: 8400,
    name: 'Resolve',
    icon: 'perk-images/Styles/7203_Resolve.png',
    slots: [
      {
        runes: [
          { id: 8437, name: 'Grasp of the Undying', icon: 'perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png' },
        ],
      },
    ],
  },
]

function provider(): RuneDataProvider {
  return { getRunes: async () => trees }
}

function seed() {
  const db = memoryDb()
  for (let i = 1; i <= 4; i += 1) {
    insertMatch(db, {
      id: `EUW1_${i}`,
      queue: 420,
      creation: i,
      participants: [
        {
          team: 100,
          champion: GAREN,
          win: i <= 3,
          keystone: i <= 3 ? 8005 : 8437,
          primaryStyle: i <= 3 ? 8000 : 8400,
          subStyle: i <= 3 ? 8400 : 8000,
          perks:
            i <= 3
              ? [
                  { style: 8000, selections: [8005, 8021] },
                  { style: 8400, selections: [8437] },
                ]
              : null,
        },
        { team: 200, champion: AHRI, win: i > 3 },
      ],
    })
  }
  return db
}

describe('RuneService', () => {
  it('returns popular rune pages with names and icons', async () => {
    const service = new RuneService({ db: seed(), source: source(), provider: provider() })

    const result = await service.popular('Garen')

    expect(result.championName).toBe('Garen')
    expect(result.pages.length).toBe(2)
    expect(result.pages[0]).toMatchObject({
      games: 3,
      wins: 3,
      winRate: 1,
      keystone: { id: 8005, name: 'Press the Attack' },
      primaryTree: { id: 8000, name: 'Precision' },
      secondaryTree: { id: 8400, name: 'Resolve' },
      fullRunes: true,
    })
    expect(result.pages[0]?.primaryRunes.map((rune) => rune.id)).toEqual([8005, 8021])
    expect(result.pages[0]?.secondaryRunes.map((rune) => rune.id)).toEqual([8437])
  })

  it('falls back to ids when rune metadata is unavailable', async () => {
    const failing: RuneDataProvider = {
      getRunes: async () => {
        throw new Error('offline')
      },
    }
    const service = new RuneService({ db: seed(), source: source(), provider: failing })

    const result = await service.popular('Garen')

    expect(result.note).toContain('unavailable')
    expect(result.pages[0]?.keystone.name).toBe('Rune 8005')
    expect(result.pages[0]?.keystone.icon).toBeNull()
  })

  it('returns no pages without static data', async () => {
    const service = new RuneService({
      db: seed(),
      source: source(null),
      provider: provider(),
    })

    expect(await service.popular('Garen')).toMatchObject({
      championName: null,
      pages: [],
      hasStaticData: false,
    })
  })
})
