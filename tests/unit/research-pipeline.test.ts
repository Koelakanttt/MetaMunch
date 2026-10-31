import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
import { RiotCircuitOpenError } from '../../src/main/providers/riot-request-manager'
import { ResearchEvidenceProvider } from '../../src/main/services/research-evidence-provider'
import { ResearchService } from '../../src/main/services/research-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import {
  createResearchSnapshot,
  saveResearchMatch,
  type ResearchCrawlRow,
} from '../../src/main/db/research-repo'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import { wilsonLowerBound } from '../../src/shared/research-stats'
import { parseMatch, type Match } from '../../src/shared/riot'
import { memoryDb } from '../helpers/db'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

function dragonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(dragonFixture('champion.json')).values
const items = parseItemList(dragonFixture('item.json')).values
const base = parseMatch(fixture('match.json'))

function source(version = '16.21.1'): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => items,
  }
}

function matchWith(id: string, patch: string, remake = false): Match {
  return { ...base, id, patch, remake }
}

describe('research sample pipeline', () => {
  it('computes the Wilson lower bound without letting tiny samples win', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0)
    expect(wilsonLowerBound(100, 100)).toBeGreaterThan(0.95)
    expect(wilsonLowerBound(3, 3)).toBeLessThan(0.5)
    expect(wilsonLowerBound(60, 100)).toBeGreaterThan(wilsonLowerBound(3, 3))
  })

  it('falls back to the previous patch and labels it', () => {
    const db = memoryDb()
    const current = createResearchSnapshot(db, {
      patch: '16.21',
      region: 'EUW1',
      queueId: 420,
      rankScope: 'MASTER+ / DIAMOND I-IV',
      createdAt: 1,
      targetMatches: 5000,
    })
    const previous = createResearchSnapshot(db, {
      patch: '16.20',
      region: 'EUW1',
      queueId: 420,
      rankScope: 'MASTER+ / DIAMOND I-IV',
      createdAt: 2,
      targetMatches: 5000,
    })
    for (let index = 0; index < 50; index += 1) {
      saveResearchMatch(db, current, matchWith(`EUW1_C${index}`, '16.21'))
    }
    for (let index = 0; index < 100; index += 1) {
      saveResearchMatch(db, previous, matchWith(`EUW1_P${index}`, '16.20'))
    }

    const ahri = champions.find((champion) => champion.id === 'Ahri')
    if (!ahri) throw new Error('missing Ahri fixture')
    const evidence = new ResearchEvidenceProvider({ db, source: source() }).forChampion(
      ahri,
      'TOP',
      items,
    )

    expect(evidence?.scope.fallback).toBe(true)
    expect(evidence?.scope.samplePatch).toBe('16.20')
    expect(evidence?.scope.championGames).toBe(100)
    expect(evidence?.research?.games).toBe(100)
  })

  it('stores no player identifiers in compact research rows', () => {
    const db = memoryDb()
    const snapshot = createResearchSnapshot(db, {
      patch: '16.21',
      region: 'EUW1',
      queueId: 420,
      rankScope: 'MASTER+ / DIAMOND I-IV',
      createdAt: 1,
      targetMatches: 1,
    })
    saveResearchMatch(db, snapshot, matchWith('EUW1_NO_IDS', '16.21'))
    const columns = db.prepare('PRAGMA table_info(research_rows)').all() as {
      name?: unknown
    }[]
    const names = columns.map((column) => String(column.name).toLowerCase())
    expect(names).not.toContain('puuid')
    expect(names).not.toContain('summonerid')
    expect(names).not.toContain('playername')
  })

  it('discards other-patch matches and remembers them as seen', async () => {
    let leagueCalls = 0
    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => ['EUW1_OTHER_PATCH'],
      getMatch: async () => matchWith('EUW1_OTHER_PATCH', '16.20'),
      getLeagueEntries: async () => {
        leagueCalls += 1
        return leagueCalls === 1
          ? [
              {
                puuid: 'seed',
                summonerId: null,
                tier: 'DIAMOND',
                rank: 'I',
                queueType: 'RANKED_SOLO_5x5',
                leaguePoints: 0,
                wins: 0,
                losses: 0,
              },
            ]
          : []
      },
    }
    const service = new ResearchService({
      db: memoryDb(),
      provider,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
      now: () => 1,
    })

    const result = await service.collect(1)

    expect(result.saved).toBe(0)
    expect(result.skipped).toBe(1)
    expect(service.status().matches).toBe(0)
    expect(service.status().state).toBe('paused')
  })

  it('pauses on the circuit breaker and resumes from the persisted frontier', async () => {
    const db = memoryDb()
    let leagueCalls = 0
    const failing: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => {
        throw new RiotCircuitOpenError()
      },
      getMatch: async () => matchWith('EUW1_RECOVERY', '16.21'),
      getLeagueEntries: async () => {
        leagueCalls += 1
        return leagueCalls === 1
          ? [
              {
                puuid: 'seed',
                summonerId: null,
                tier: 'DIAMOND',
                rank: 'I',
                queueType: 'RANKED_SOLO_5x5',
                leaguePoints: 0,
                wins: 0,
                losses: 0,
              },
            ]
          : []
      },
    }
    const first = new ResearchService({
      db,
      provider: failing,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
      now: () => 1,
    })
    const paused = await first.collect(1)
    expect(paused.saved).toBe(0)
    expect(first.status().state).toBe('paused')
    expect(first.status().lastError).toContain('Riot API unreachable')

    const recovered: RiotApiProvider = {
      ...failing,
      getMatchIds: async () => ['EUW1_RECOVERY'],
      getMatch: async () => matchWith('EUW1_RECOVERY', '16.21'),
    }
    const second = new ResearchService({
      db,
      provider: recovered,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
      now: () => 2,
    })
    const result = await second.collect(1)

    expect(result.saved).toBe(1)
    expect(second.status().state).toBe('complete')
  })

  it('keeps the research row columns compact and integer-based', () => {
    const db = memoryDb()
    const row = getResearchCrawl(db)
    expect(row.targetMatches).toBe(5000)
    const columns = db.prepare('PRAGMA table_info(research_rows)').all() as {
      type?: unknown
      name?: unknown
    }[]
    const types = new Map(columns.map((column) => [String(column.name), String(column.type)]))
    expect(types.get('item0')).toBe('INTEGER')
    expect(types.get('keystone')).toBe('INTEGER')
  })
})

function getResearchCrawl(db: ReturnType<typeof memoryDb>): ResearchCrawlRow {
  const row = db.prepare('SELECT * FROM research_crawl WHERE id = 1').get() as
    | Record<string, unknown>
    | undefined
  return {
    patch: row?.['patch'] === null ? null : String(row?.['patch']),
    state: String(row?.['status']) as ResearchCrawlRow['state'],
    targetMatches: Number(row?.['target_matches']),
    dailyRequestCap: Number(row?.['daily_request_cap']),
    requestsToday: Number(row?.['requests_today']),
    requestDay: String(row?.['request_day']),
    emeraldPlus: Number(row?.['emerald_plus']) === 1,
    startedAt: row?.['started_at'] === null ? null : Number(row?.['started_at']),
    updatedAt: Number(row?.['updated_at']),
    lastError: row?.['last_error'] === null ? null : String(row?.['last_error']),
    seedsExhausted: Number(row?.['seeds_exhausted']) === 1,
  }
}
