import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  championRoleTotals,
  itemSamples,
  researchFilterCounts,
} from '../../src/main/db/research-aggregate-repo'
import { createResearchSnapshot, saveResearchMatch } from '../../src/main/db/research-repo'
import { ResearchEvidenceProvider } from '../../src/main/services/research-evidence-provider'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import {
  canCompareWinRates,
  DEFAULT_RESEARCH_FILTERS,
  parseResearchFilters,
  RESEARCH_TIER_BUCKETS,
  tierScopeLabel,
} from '../../src/shared/research'
import { parseMatch, type Match, type MatchParticipant } from '../../src/shared/riot'
import { memoryDb } from '../helpers/db'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

function dragonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const base = parseMatch(fixture('match.json'))
const items = parseItemList(dragonFixture('item.json')).values
const champions = parseChampionList(dragonFixture('champion.json')).values
const CHAMPION_KEY = 86 // the fixture champion this role query targets
const ROLE = 'JUNGLE'

function source(version = '16.21.1'): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => items,
  }
}

/** The target participant, with a chosen role source and items. */
function matchWith(
  id: string,
  roleSource: 'riot' | 'inferred',
  championItems?: number[],
): Match {
  const participants: MatchParticipant[] = base.participants.map((participant) =>
    participant.championId === CHAMPION_KEY
      ? {
          ...participant,
          position: roleSource === 'riot' ? ROLE : '',
          individualPosition: ROLE,
          ...(championItems ? { items: championItems } : {}),
        }
      : participant,
  )
  return { ...base, id, participants }
}

function snapshot(db: ReturnType<typeof memoryDb>): number {
  return createResearchSnapshot(db, {
    patch: '16.21',
    region: 'EUW1',
    queueId: 420,
    rankScope: 'MASTER+ / DIAMOND I-IV',
    createdAt: 1,
    targetMatches: 10,
  })
}

describe('research filters', () => {
  it('excludes inferred roles by default and counts them', () => {
    const db = memoryDb()
    const id = snapshot(db)
    for (let index = 0; index < 3; index += 1) {
      saveResearchMatch(db, id, matchWith(`EUW1_R${index}`, 'riot'), 'DIAMOND')
    }
    for (let index = 0; index < 2; index += 1) {
      saveResearchMatch(db, id, matchWith(`EUW1_I${index}`, 'inferred'), 'DIAMOND')
    }

    expect(championRoleTotals(db, id, CHAMPION_KEY, ROLE).games).toBe(5)
    expect(championRoleTotals(db, id, CHAMPION_KEY, ROLE, DEFAULT_RESEARCH_FILTERS).games).toBe(3)
    expect(
      researchFilterCounts(db, id, DEFAULT_RESEARCH_FILTERS, CHAMPION_KEY, ROLE),
    ).toMatchObject({
      totalGames: 5,
      includedGames: 3,
      excludedInferred: 2,
      excludedUnknownTier: 0,
    })
    expect(
      championRoleTotals(db, id, CHAMPION_KEY, ROLE, {
        ...DEFAULT_RESEARCH_FILTERS,
        includeInferred: true,
      }).games,
    ).toBe(5)
  })

  it('filters by tier and keeps unknown tier behind an opt-in', () => {
    const db = memoryDb()
    const id = snapshot(db)
    const tiers: (string | null)[] = ['DIAMOND', 'DIAMOND', 'MASTER', 'MASTER', 'EMERALD', 'EMERALD', null, null]
    tiers.forEach((tier, index) => {
      saveResearchMatch(db, id, matchWith(`EUW1_T${index}`, 'riot'), tier)
    })

    expect(championRoleTotals(db, id, CHAMPION_KEY, ROLE, DEFAULT_RESEARCH_FILTERS).games).toBe(4)
    expect(
      championRoleTotals(db, id, CHAMPION_KEY, ROLE, {
        ...DEFAULT_RESEARCH_FILTERS,
        tier: 'master',
      }).games,
    ).toBe(2)
    expect(
      championRoleTotals(db, id, CHAMPION_KEY, ROLE, {
        ...DEFAULT_RESEARCH_FILTERS,
        tier: 'emerald',
      }).games,
    ).toBe(6)
    expect(
      championRoleTotals(db, id, CHAMPION_KEY, ROLE, {
        ...DEFAULT_RESEARCH_FILTERS,
        includeUnknownTier: true,
      }).games,
    ).toBe(6)
    expect(
      researchFilterCounts(db, id, DEFAULT_RESEARCH_FILTERS, CHAMPION_KEY, ROLE),
    ).toMatchObject({ totalGames: 8, includedGames: 4, excludedUnknownTier: 2 })
  })

  it('uses the filtered denominator for item samples', () => {
    const db = memoryDb()
    const id = snapshot(db)
    for (let index = 0; index < 4; index += 1) {
      saveResearchMatch(
        db,
        id,
        matchWith(`EUW1_ITEM_R${index}`, 'riot', [3033, 0, 0, 0, 0, 0]),
        'DIAMOND',
      )
    }
    for (let index = 0; index < 2; index += 1) {
      saveResearchMatch(
        db,
        id,
        matchWith(`EUW1_ITEM_I${index}`, 'inferred', [3033, 0, 0, 0, 0, 0]),
        'DIAMOND',
      )
    }

    const filtered = itemSamples(db, id, CHAMPION_KEY, ROLE, items, DEFAULT_RESEARCH_FILTERS)
    expect(filtered.find((entry) => entry.itemId === 3033)).toMatchObject({
      games: 4,
      pickRate: 1,
    })
    const raw = itemSamples(db, id, CHAMPION_KEY, ROLE, items)
    expect(raw.find((entry) => entry.itemId === 3033)?.games).toBe(6)
  })

  it('reports the excluded games in the recommendation evidence scope', () => {
    const db = memoryDb()
    const id = snapshot(db)
    for (let index = 0; index < 3; index += 1) {
      saveResearchMatch(db, id, matchWith(`EUW1_EV_R${index}`, 'riot'), 'DIAMOND')
    }
    saveResearchMatch(db, id, matchWith('EUW1_EV_I', 'inferred'), 'DIAMOND')
    const garen = champions.find((champion) => champion.id === 'Garen')
    if (!garen) throw new Error('missing Garen fixture')

    const evidence = new ResearchEvidenceProvider({ db, source: source() }).forChampion(
      garen,
      ROLE,
      items,
    )

    expect(evidence?.research?.games).toBe(3)
    expect(evidence?.research?.scope.excludedInferred).toBe(1)
    expect(evidence?.research?.scope.tierScope).toContain('Diamond')
  })

  it('gates win-rate comparison at exactly 300 games and validates filters', () => {
    expect(canCompareWinRates(299)).toBe(false)
    expect(canCompareWinRates(300)).toBe(true)
    expect(parseResearchFilters(undefined)).toEqual(DEFAULT_RESEARCH_FILTERS)
    expect(parseResearchFilters({ tier: 'master' })).toEqual({
      ...DEFAULT_RESEARCH_FILTERS,
      tier: 'master',
    })
    expect(() => parseResearchFilters({ tier: 'gold' })).toThrow('Invalid research filters')
    expect(tierScopeLabel(DEFAULT_RESEARCH_FILTERS)).toBe(
      'Diamond+ (Diamond, Master, Grandmaster, Challenger)',
    )
    expect(tierScopeLabel({ ...DEFAULT_RESEARCH_FILTERS, tier: 'master' })).toContain('Master+')
    expect(RESEARCH_TIER_BUCKETS.diamond).not.toContain('EMERALD')
    expect(RESEARCH_TIER_BUCKETS.master).not.toContain('DIAMOND')
    expect(RESEARCH_TIER_BUCKETS.emerald).toContain('EMERALD')
  })
})
