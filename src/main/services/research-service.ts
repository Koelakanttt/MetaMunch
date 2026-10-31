import type { DatabaseSync } from 'node:sqlite'
import type { Match } from '@shared/riot'
import { toPatch } from '@shared/riot'
import type {
  ResearchChampionStat,
  ResearchCollectResult,
  ResearchCoverageRow,
  ResearchItemStat,
  ResearchStatus,
  ResearchSummary,
} from '@shared/research'
import {
  addFrontierPlayer,
  clearFrontier,
  createResearchSnapshot,
  getResearchCrawl,
  isResearchMatchSeen,
  latestResearchSnapshot,
  markResearchMatchSeen,
  nextFrontierPlayer,
  patchFirstSeen,
  pruneResearchSnapshots,
  recordPatchFirstSeen,
  removeFrontierPlayer,
  researchChampionRows,
  researchCounts,
  researchCoverageRows,
  researchItemRows,
  researchSnapshotForPatch,
  researchStatus,
  resetProcessingFrontier,
  saveResearchCrawl,
  saveResearchMatch,
  updateResearchSnapshotScope,
  updateResearchSnapshotTarget,
} from '../db/research-repo'
import type { ApexTier, LeagueEntry, RiotApiProvider } from '../providers/riot-api'
import { RiotApiError } from '../providers/riot-api'
import { isRiotCircuitOpen } from '../providers/riot-request-manager'
import type { StaticDataSource } from './recommendation-service'

const QUEUE = 420
const DEFAULT_TARGET = 5000
const DEFAULT_DAILY_CAP = 20000
const MAX_SEEDS = 2500
const SEED_PAGE_LIMIT = 4
const APEX_TIERS: readonly ApexTier[] = ['CHALLENGER', 'GRANDMASTER', 'MASTER']
const DIAMOND_DIVISIONS = ['I', 'II', 'III', 'IV'] as const
const DAY_MS = 24 * 60 * 60 * 1000
const REQUEST_WINDOW_MS = 60 * 1000

export interface ResearchStartOptions {
  targetMatches?: number
  dailyRequestCap?: number
  emeraldPlus?: boolean
}

export interface ResearchDeps {
  db: DatabaseSync
  provider: RiotApiProvider
  source: StaticDataSource
  getPatch: () => string | null
  getRegion: () => string
  now?: () => number
}

class ResearchHalt extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResearchHalt'
  }
}

interface RunCounters {
  saved: number
  skipped: number
  failed: number
  seedPlayers: number
}

function clampTarget(value: number | undefined, fallback: number): number {
  const target = value === undefined ? fallback : Math.floor(value)
  return Math.max(1, Math.min(100000, Number.isFinite(target) ? target : fallback))
}

function clampCap(value: number | undefined, fallback: number): number {
  const cap = value === undefined ? fallback : Math.floor(value)
  return Math.max(100, Math.min(1000000, Number.isFinite(cap) ? cap : fallback))
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function rankScope(emeraldPlus: boolean): string {
  return emeraldPlus
    ? 'MASTER+ / DIAMOND I-IV / EMERALD I'
    : 'MASTER+ / DIAMOND I-IV'
}

/** Background, resumable ladder crawler. One Riot request at a time through the shared manager. */
export class ResearchService {
  private readonly db: DatabaseSync
  private readonly provider: RiotApiProvider
  private readonly source: StaticDataSource
  private readonly getPatch: () => string | null
  private readonly getRegion: () => string
  private readonly now: () => number
  private readonly summonerCache = new Map<string, string>()
  private requestTimes: number[] = []
  private loopPromise: Promise<void> | null = null
  private counters: RunCounters = { saved: 0, skipped: 0, failed: 0, seedPlayers: 0 }

  constructor(deps: ResearchDeps) {
    this.db = deps.db
    this.provider = deps.provider
    this.source = deps.source
    this.getPatch = deps.getPatch
    this.getRegion = deps.getRegion
    this.now = deps.now ?? Date.now
    resetProcessingFrontier(this.db)
    const crawl = getResearchCrawl(this.db)
    if (crawl.state === 'running') {
      saveResearchCrawl(this.db, {
        state: 'paused',
        lastError: 'App restarted; press Resume to continue.',
        updatedAt: this.now(),
      })
    }
  }

  status(): ResearchStatus {
    const status = researchStatus(this.db)
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const byKey = new Map(champions.map((champion) => [champion.key, champion]))
    const snapshot = status.snapshot
    const rows = snapshot ? researchCoverageRows(this.db, snapshot.id) : []
    const roleGames = new Map<string, number>()
    for (const row of rows) roleGames.set(row.role, (roleGames.get(row.role) ?? 0) + row.games)
    const coverage: ResearchCoverageRow[] = rows.map((row) => ({
      championId: byKey.get(row.championKey)?.id ?? String(row.championKey),
      name: byKey.get(row.championKey)?.name ?? `Champion ${row.championKey}`,
      role: row.role,
      games: row.games,
      wins: row.wins,
      pickRate: (roleGames.get(row.role) ?? 0) === 0 ? 0 : row.games / (roleGames.get(row.role) ?? 1),
      roleGames: roleGames.get(row.role) ?? 0,
    }))
    this.requestTimes = this.requestTimes.filter((at) => at > this.now() - REQUEST_WINDOW_MS)
    const startedAt = status.startedAt
    const elapsed = startedAt === null ? 0 : Math.max(1, this.now() - startedAt)
    const remaining = Math.max(0, status.targetMatches - status.matches)
    const rate = elapsed > 0 ? status.matches / elapsed : 0
    return {
      ...status,
      patch: this.currentPatch() ?? status.patch,
      requestsPerMinute: this.requestTimes.length,
      etaSeconds:
        status.state === 'running' && rate > 0
          ? Math.round((remaining / rate) * 1000)
          : null,
      coverage,
    }
  }

  summary(): ResearchSummary {
    const status = this.status()
    const snapshot = status.snapshot
    if (!snapshot) return { status, champions: [], items: [] }

    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const items = version === null ? [] : this.source.items(version)
    const byKey = new Map(champions.map((champion) => [champion.key, champion]))
    const byId = new Map(items.map((item) => [item.id, item]))
    const totalGames = status.participants
    const totalMatches = status.matches

    const championStats: ResearchChampionStat[] = researchChampionRows(
      this.db,
      snapshot.id,
    ).map((row) => {
      const champion = byKey.get(row.championKey)
      return {
        championId: champion?.id ?? String(row.championKey),
        name: champion?.name ?? `Champion ${row.championKey}`,
        games: row.games,
        wins: row.wins,
        winRate: row.games === 0 ? 0 : row.wins / row.games,
        pickRate: totalGames === 0 ? 0 : row.games / totalGames,
        banRate: totalMatches === 0 ? 0 : row.bans / totalMatches,
      }
    })

    const itemStats: ResearchItemStat[] = researchItemRows(this.db, snapshot.id).map((row) => ({
      itemId: row.itemId,
      name: byId.get(row.itemId)?.name ?? `Item ${row.itemId}`,
      purchases: row.purchases,
      wins: row.wins,
      winRate: row.purchases === 0 ? 0 : row.wins / row.purchases,
      inclusionRate: totalGames === 0 ? 0 : row.purchases / totalGames,
    }))

    return { status, champions: championStats, items: itemStats }
  }

  setOptions(options: ResearchStartOptions): ResearchStatus {
    const crawl = getResearchCrawl(this.db)
    const target = clampTarget(options.targetMatches, crawl.targetMatches)
    const cap = clampCap(options.dailyRequestCap, crawl.dailyRequestCap)
    saveResearchCrawl(this.db, {
      targetMatches: target,
      dailyRequestCap: cap,
      emeraldPlus: options.emeraldPlus ?? crawl.emeraldPlus,
      updatedAt: this.now(),
    })
    const snapshot = latestResearchSnapshot(this.db)
    if (snapshot) {
      updateResearchSnapshotTarget(this.db, snapshot.id, target)
      updateResearchSnapshotScope(this.db, snapshot.id, rankScope(options.emeraldPlus ?? crawl.emeraldPlus))
    }
    return this.status()
  }

  async start(options: ResearchStartOptions = {}): Promise<ResearchStatus> {
    const patch = this.currentPatch()
    if (!patch) throw new Error('Static data is missing. Update Data Dragon first.')
    const crawl = getResearchCrawl(this.db)
    const target = clampTarget(options.targetMatches, crawl.targetMatches)
    const cap = clampCap(options.dailyRequestCap, crawl.dailyRequestCap)
    const emeraldPlus = options.emeraldPlus ?? crawl.emeraldPlus
    const changedPatch = crawl.patch !== patch
    if (changedPatch) clearFrontier(this.db)
    resetProcessingFrontier(this.db)

    let snapshot = researchSnapshotForPatch(this.db, patch)
    if (!snapshot) {
      const snapshotId = createResearchSnapshot(this.db, {
        patch,
        region: this.getRegion(),
        queueId: QUEUE,
        rankScope: rankScope(emeraldPlus),
        createdAt: this.now(),
        targetMatches: target,
      })
      snapshot = researchSnapshotForPatch(this.db, patch)
      if (!snapshot) throw new Error(`Could not create research snapshot ${snapshotId}.`)
    } else {
      updateResearchSnapshotTarget(this.db, snapshot.id, target)
      updateResearchSnapshotScope(this.db, snapshot.id, rankScope(emeraldPlus))
    }
    recordPatchFirstSeen(this.db, patch, this.now())
    pruneResearchSnapshots(this.db)
    saveResearchCrawl(this.db, {
      patch,
      state: 'running',
      targetMatches: target,
      dailyRequestCap: cap,
      emeraldPlus,
      startedAt: crawl.startedAt ?? this.now(),
      lastError: null,
      seedsExhausted: changedPatch
        ? false
        : target > crawl.targetMatches
          ? false
          : crawl.seedsExhausted,
      updatedAt: this.now(),
    })
    this.counters = { saved: 0, skipped: 0, failed: 0, seedPlayers: 0 }
    this.launch()
    return this.status()
  }

  pause(): ResearchStatus {
    saveResearchCrawl(this.db, { state: 'paused', updatedAt: this.now() })
    return this.status()
  }

  resume(): ResearchStatus {
    const patch = this.currentPatch()
    if (!patch) throw new Error('Static data is missing. Update Data Dragon first.')
    const crawl = getResearchCrawl(this.db)
    resetProcessingFrontier(this.db)
    saveResearchCrawl(this.db, {
      patch,
      state: 'running',
      lastError: null,
      seedsExhausted: crawl.patch === patch ? crawl.seedsExhausted : false,
      updatedAt: this.now(),
    })
    this.launch()
    return this.status()
  }

  stop(): ResearchStatus {
    saveResearchCrawl(this.db, { state: 'stopped', updatedAt: this.now() })
    return this.status()
  }

  async collect(targetMatches = 50): Promise<ResearchCollectResult> {
    const target = clampTarget(targetMatches, DEFAULT_TARGET)
    await this.start({ targetMatches: target })
    const promise = this.loopPromise
    if (promise) await promise
    const status = this.status()
    return {
      snapshotId: status.snapshot?.id ?? 0,
      requested: target,
      saved: this.counters.saved,
      skipped: this.counters.skipped,
      failed: this.counters.failed,
      seedPlayers: this.counters.seedPlayers,
      state: status.state,
    }
  }

  private launch(): void {
    if (this.loopPromise) return
    const promise = this.executeLoop()
    this.loopPromise = promise
    void promise.finally(() => {
      if (this.loopPromise === promise) this.loopPromise = null
      if (getResearchCrawl(this.db).state === 'running') this.launch()
    })
  }

  private async executeLoop(): Promise<void> {
    try {
      while (getResearchCrawl(this.db).state === 'running') {
        const crawl = getResearchCrawl(this.db)
        const snapshot = latestResearchSnapshot(this.db)
        if (!snapshot) break
        const counts = researchCounts(this.db, snapshot.id)
        if (counts.matches >= crawl.targetMatches) {
          saveResearchCrawl(this.db, {
            state: 'complete',
            lastError: null,
            updatedAt: this.now(),
          })
          break
        }
        if (!this.hasDailyBudget()) {
          this.pauseFor('Daily request cap reached. Resume tomorrow or raise the cap.')
          break
        }
        const progressed = await this.processOne(snapshot.id, crawl.targetMatches)
        if (!progressed) break
      }
    } catch (error) {
      if (error instanceof ResearchHalt) {
        this.pauseFor(error.message)
      } else if (isRiotCircuitOpen(error)) {
        this.pauseFor('paused: Riot API unreachable')
      } else {
        this.pauseFor(error instanceof Error ? error.message : String(error))
      }
    }
    if (getResearchCrawl(this.db).state === 'running') {
      saveResearchCrawl(this.db, { state: 'complete', updatedAt: this.now() })
    }
  }

  private pauseFor(message: string): void {
    saveResearchCrawl(this.db, {
      state: 'paused',
      lastError: message,
      updatedAt: this.now(),
    })
  }

  private hasDailyBudget(): boolean {
    const crawl = getResearchCrawl(this.db)
    return crawl.requestsToday < crawl.dailyRequestCap || crawl.requestDay !== dayKey(this.now())
  }

  private async processOne(snapshotId: number, target: number): Promise<boolean> {
    let player = nextFrontierPlayer(this.db)
    if (!player) {
      if (getResearchCrawl(this.db).seedsExhausted) {
        this.pauseFor('Seed players exhausted before the target; raise the daily cap or retry later.')
        return false
      }
      const added = await this.seedFrontier(target)
      if (added === 0) {
        saveResearchCrawl(this.db, {
          state: 'paused',
          seedsExhausted: true,
          lastError: 'No seed players were returned by the Riot API.',
          updatedAt: this.now(),
        })
        return false
      }
      player = nextFrontierPlayer(this.db)
      if (!player) return true
    }

    const firstSeen = patchFirstSeen(this.db, getResearchCrawl(this.db).patch ?? '') ?? this.now()
    const startTime = Math.max(0, firstSeen - DAY_MS)
    let matchIds: string[]
    try {
      matchIds = await this.riot(() =>
        this.provider.getMatchIds(player.puuid, {
          queue: QUEUE,
          start: 0,
          count: 20,
          startTime,
        }),
      )
    } catch (error) {
      if (isRiotCircuitOpen(error) || error instanceof ResearchHalt) throw error
      if (error instanceof RiotApiError && [401, 403, 429].includes(error.status)) throw error
      this.counters.failed += 1
      removeFrontierPlayer(this.db, player.puuid)
      return true
    }

    const patch = getResearchCrawl(this.db).patch
    if (!patch) throw new ResearchHalt('Research patch is not set.')
    for (const matchId of matchIds) {
      if (isResearchMatchSeen(this.db, matchId)) {
        this.counters.skipped += 1
        continue
      }
      if (!this.hasDailyBudget()) throw new ResearchHalt('Daily request cap reached.')
      let match: Match
      try {
        match = await this.riot(() => this.provider.getMatch(matchId))
      } catch (error) {
        if (isRiotCircuitOpen(error) || error instanceof ResearchHalt) throw error
        if (error instanceof RiotApiError && [401, 403, 429].includes(error.status)) throw error
        this.counters.failed += 1
        markResearchMatchSeen(this.db, matchId, patch, this.now(), 'fetch-failed')
        continue
      }
      if (match.patch !== patch || match.queueId !== QUEUE || match.remake) {
        this.counters.skipped += 1
        markResearchMatchSeen(
          this.db,
          matchId,
          patch,
          this.now(),
          match.patch !== patch ? 'patch' : match.queueId !== QUEUE ? 'queue' : 'remake',
        )
        continue
      }
      if (saveResearchMatch(this.db, snapshotId, match, player.tierBucket)) {
        this.counters.saved += 1
        markResearchMatchSeen(this.db, matchId, patch, this.now(), null)
      } else {
        this.counters.skipped += 1
        markResearchMatchSeen(this.db, matchId, patch, this.now(), 'duplicate')
      }
      const counts = researchCounts(this.db, snapshotId)
      if (counts.matches >= target) break
    }
    removeFrontierPlayer(this.db, player.puuid)
    return true
  }

  private async seedFrontier(target: number): Promise<number> {
    const crawl = getResearchCrawl(this.db)
    const counts = latestResearchSnapshot(this.db)
      ? researchCounts(this.db, latestResearchSnapshot(this.db)?.id ?? 0)
      : { matches: 0, participants: 0, bans: 0 }
    const wanted = Math.min(
      MAX_SEEDS,
      Math.max(50, Math.ceil(Math.max(1, target - counts.matches) / 20) * 2),
    )
    let added = 0
    const add = async (entry: LeagueEntry, fallbackTier: string): Promise<void> => {
      if (added >= wanted) return
      let puuid = entry.puuid ?? null
      const summonerId = entry.summonerId ?? null
      if (!puuid && summonerId) {
        const cached = this.summonerCache.get(summonerId)
        if (cached) puuid = cached
        else if (this.provider.getSummonerPuuid) {
          puuid = await this.riot(() => this.provider.getSummonerPuuid?.(summonerId) ?? Promise.resolve(''))
          if (puuid) this.summonerCache.set(summonerId, puuid)
        }
      }
      if (!puuid) return
      const tier = entry.tier.length > 0 ? entry.tier : fallbackTier
      if (addFrontierPlayer(this.db, puuid, tier, this.now())) {
        added += 1
        this.counters.seedPlayers += 1
      }
    }

    const apex = this.provider.getApexLeagueEntries?.bind(this.provider)
    if (apex) {
      const perTier = Math.max(20, Math.floor(wanted / 6))
      for (const tier of APEX_TIERS) {
        if (added >= wanted) break
        try {
          const entries = await this.riot(() => apex(tier))
          let tierAdded = 0
          for (const entry of entries) {
            if (tierAdded >= perTier || added >= wanted) break
            const before = added
            await add(entry, tier)
            if (added > before) tierAdded += 1
          }
        } catch (error) {
          if (isRiotCircuitOpen(error) || error instanceof ResearchHalt) throw error
          if (error instanceof RiotApiError && [401, 403, 429].includes(error.status)) {
            throw error
          }
        }
      }
    }

    const league = this.provider.getLeagueEntries?.bind(this.provider)
    if (league) {
      const tiers: { tier: 'DIAMOND' | 'EMERALD'; divisions: readonly ('I' | 'II' | 'III' | 'IV')[] }[] = [
        ...(crawl.emeraldPlus ? [{ tier: 'EMERALD' as const, divisions: ['I'] as const }] : []),
        { tier: 'DIAMOND', divisions: DIAMOND_DIVISIONS },
      ]
      for (const spec of tiers) {
        for (const division of spec.divisions) {
          for (let page = 1; page <= SEED_PAGE_LIMIT; page += 1) {
            if (added >= wanted) break
            try {
              const entries = await this.riot(() =>
                league({ queue: 'RANKED_SOLO_5x5', tier: spec.tier, division, page }),
              )
              if (entries.length === 0) break
              for (const entry of entries) await add(entry, spec.tier)
            } catch (error) {
              if (isRiotCircuitOpen(error) || error instanceof ResearchHalt) throw error
              if (error instanceof RiotApiError && [401, 403, 429].includes(error.status)) {
                throw error
              }
              break
            }
          }
        }
      }
    }
    return added
  }

  private async riot<T>(call: () => Promise<T>): Promise<T> {
    const crawl = getResearchCrawl(this.db)
    const day = dayKey(this.now())
    const today = crawl.requestDay === day ? crawl.requestsToday : 0
    if (today >= crawl.dailyRequestCap) {
      throw new ResearchHalt('Daily request cap reached. Resume tomorrow or raise the cap.')
    }
    this.requestTimes.push(this.now())
    saveResearchCrawl(this.db, {
      requestsToday: today + 1,
      requestDay: day,
      updatedAt: this.now(),
    })
    return call()
  }

  private currentPatch(): string | null {
    const version = this.getPatch()
    if (!version) return null
    try {
      return toPatch(version)
    } catch {
      return null
    }
  }
}

export { DEFAULT_DAILY_CAP, DEFAULT_TARGET, QUEUE }
