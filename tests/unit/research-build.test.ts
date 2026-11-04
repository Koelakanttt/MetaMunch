import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { saveResearchMatch } from '../../src/main/db/research-repo'
import { createResearchSnapshot } from '../../src/main/db/research-repo'
import { saveResearchTimelines } from '../../src/main/db/research-timeline-repo'
import { ResearchBuildService } from '../../src/main/services/research-build-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList } from '../../src/shared/ddragon'
import type { Item } from '../../src/shared/ddragon'
import {
  greedyBuild,
  highestWinBuild,
  laterSlotOptions,
  orderBuildOptions,
  skillOrders,
  skillPriority,
  spellPairs,
  startingSets,
  type ResearchTimelineSample,
} from '../../src/shared/research-build'
import { parseMatch } from '../../src/shared/riot'
import { memoryDb } from '../helpers/db'
import { mkItem } from '../helpers/items'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

function dragonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const base = parseMatch(fixture('match.json'))
const champions = parseChampionList(dragonFixture('champion.json')).values
// The fixture match uses item ids 3089-3098; keep them in the item pool for the service test.
const items: Item[] = [3033, 3006, 3031, ...Array.from({ length: 10 }, (_, index) => 3089 + index)].map(
  (id) => mkItem(id, `Item ${id}`),
)

function sample(
  id: string,
  over: Partial<ResearchTimelineSample> = {},
): ResearchTimelineSample {
  return {
    matchId: id,
    win: true,
    purchaseOrder: [],
    startingItems: [],
    skillOrder: '',
    spells: [],
    ...over,
  }
}

/** `count` samples that all follow the same purchase order. */
function repeated(count: number, order: number[]): ResearchTimelineSample[] {
  return Array.from({ length: count }, (_, index) =>
    sample(`EUW1_${index}`, { purchaseOrder: order, win: index % 2 === 0 }),
  )
}

describe('greedyBuild', () => {
  it('conditions each step on the previous one and stops below 60 games', () => {
    const samples = [
      ...repeated(55, [1, 2, 3]),
      ...repeated(5, [1, 7, 8]),
      ...Array.from({ length: 40 }, (_, index) =>
        sample(`EUW1_B${index}`, { purchaseOrder: [9, 8, 7] }),
      ),
    ]

    const result = greedyBuild(samples, 'pick')

    expect(result.steps.map((step) => step.itemId)).toEqual([1, 2])
    expect(result.steps[0]?.pickRate).toBe(0.6)
    expect(result.steps[1]?.conditionedGames).toBe(60)
    expect(result.reliableUpTo).toBe(2)
    expect(result.note).toContain('reliable up to item 2')
  })

  it('needs exactly 60 games for a build order', () => {
    expect(greedyBuild(repeated(59, [1]), 'pick').steps).toHaveLength(0)
    expect(greedyBuild(repeated(59, [1]), 'pick').note).toContain('59 games')
    expect(greedyBuild(repeated(60, [1, 2, 3]), 'pick').steps).toHaveLength(3)
  })

  it('returns no highest-win build below 300 conditioned games', () => {
    const below = highestWinBuild(repeated(299, [1, 2, 3]))
    expect(below.result).toBeNull()
    expect(below.note).toContain('300')

    const enough = highestWinBuild(repeated(300, [1, 2, 3]))
    expect(enough.result?.steps).toHaveLength(3)
  })
})

describe('laterSlotOptions', () => {
  it('lists later items only among games containing the whole core', () => {
    const samples = [
      ...repeated(40, [1, 2, 3, 5]),
      ...repeated(20, [1, 2, 4, 6]),
      ...Array.from({ length: 40 }, (_, index) =>
        sample(`EUW1_X${index}`, { purchaseOrder: [9, 3] }),
      ),
    ]

    const slots = laterSlotOptions(samples, [1, 2])

    expect(slots).toHaveLength(1)
    expect(slots[0]?.slot).toBe(3)
    expect(slots[0]?.options.map((option) => option.itemId)).toEqual([5, 6])
    expect(slots[0]?.options[0]?.pickRate).toBeCloseTo(40 / 60)
  })

  it('orders options by the Wilson lower bound for the highest-win view', () => {
    const options = [
      { itemId: 1, games: 100, wins: 60, winRate: 0.6, pickRate: 0.6, winRateLow: 0.5 },
      { itemId: 2, games: 10, wins: 9, winRate: 0.9, pickRate: 0.1, winRateLow: 0.6 },
    ]

    expect(orderBuildOptions(options, 'pick').map((option) => option.itemId)).toEqual([1, 2])
    expect(orderBuildOptions(options, 'win').map((option) => option.itemId)).toEqual([2, 1])
  })
})

describe('build details', () => {
  it('groups starting sets, skill priority, orders and spell pairs', () => {
    const samples = [
      sample('a', { startingItems: [2003, 1001], skillOrder: 'QWEWQRQWEWQRQWE', spells: [4, 14] }),
      sample('b', {
        startingItems: [2003, 1001],
        skillOrder: 'QWEQQRQWQEQWERQ',
        spells: [14, 4],
        win: false,
      }),
      sample('c', { startingItems: [1055], skillOrder: 'WQWEWRWQWEWRWQW', spells: [4, 12] }),
    ]

    const sets = startingSets(samples)
    expect(sets[0]).toMatchObject({ itemIds: [2003, 1001], games: 2, wins: 1 })
    expect(sets[0]?.pickRate).toBeCloseTo(2 / 3)

    const priority = skillPriority(samples)
    expect(priority[0]?.ability).toBe('Q')
    expect(priority[0]?.games).toBe(2)

    expect(skillOrders(samples)[0]?.slots).toHaveLength(15)
    expect(spellPairs(samples)[0]).toMatchObject({ spells: [4, 14], games: 2 })
  })
})

describe('ResearchBuildService', () => {
  function source(version = '16.21.1'): StaticDataSource {
    return {
      latestVersion: () => version,
      champions: () => champions,
      items: () => items,
    }
  }

  function seeded(count: number) {
    const db = memoryDb()
    const snapshotId = createResearchSnapshot(db, {
      patch: '16.21',
      region: 'EUW1',
      queueId: 420,
      rankScope: 'MASTER+ / DIAMOND I-IV',
      createdAt: 1,
      targetMatches: count,
    })
    for (let index = 0; index < count; index += 1) {
      const match = { ...base, id: `EUW1_TL_${index}` }
      saveResearchMatch(db, snapshotId, match, 'DIAMOND')
      saveResearchTimelines(
        db,
        match,
        'DIAMOND',
        new Map([
          [
            2,
            {
              purchaseOrder: [3033, 3006, 3031],
              startingItems: [2003],
              skillOrder: 'QWEWQRQWEWQRQWE',
            },
          ],
        ]),
      )
    }
    return { db, snapshotId }
  }

  it('builds a core from stored timelines', () => {
    const { db } = seeded(60)
    const service = new ResearchBuildService({ db, source: source() })

    const model = service.forChampion('Garen', 'JUNGLE')

    expect(model).not.toBeNull()
    expect(model?.hasTimelines).toBe(true)
    expect(model?.scope.games).toBe(60)
    expect(model?.core.steps.map((step) => step.itemId)).toEqual([3033, 3006, 3031])
    expect(model?.starting[0]?.itemIds).toEqual([2003])
    expect(model?.highestWin).toBeNull()
  })

  it('falls back to the champion-role build when the matchup sample is small', () => {
    const { db } = seeded(60)
    const service = new ResearchBuildService({ db, source: source() })

    const model = service.forChampion('Garen', 'JUNGLE', undefined, 'Ahri')

    expect(model?.scope.laneMatchup).toBe(false)
    expect(model?.scope.note).toBe('Lane matchup sample too small, showing all matchups.')
    expect(model?.core.steps).toHaveLength(3)
  })

  it('asks for timeline collection when the champion-role has only match rows', () => {
    const { db } = seeded(60)
    const service = new ResearchBuildService({ db, source: source() })

    const model = service.forChampion('Ahri', 'TOP')

    expect(model?.hasTimelines).toBe(false)
    expect(model?.note).toBe('Build order needs timeline collection (Research page, setting).')
    expect(model?.finalItems.length).toBeGreaterThan(0)
  })
})
