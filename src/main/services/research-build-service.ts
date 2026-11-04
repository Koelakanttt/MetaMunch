import type { DatabaseSync } from 'node:sqlite'
import type { ResearchFilters, ResearchRuneSample, ResearchSnapshot } from '@shared/research'
import {
  DEFAULT_RESEARCH_FILTERS,
  roleScopeLabel,
  tierScopeLabel,
} from '@shared/research'
import {
  greedyBuild,
  highestWinBuild,
  laterSlotOptions,
  MIN_MATCHUP_GAMES,
  skillOrders,
  skillPriority,
  spellPairs,
  startingSets,
  type ResearchBuildModel,
  type ResearchTimelineSample,
} from '@shared/research-build'
import { toPatch } from '@shared/riot'
import type { Role } from '@shared/rules'
import { championRoleTotals, itemSamples, runeSamples } from '../db/research-aggregate-repo'
import { researchTimelineSamples } from '../db/research-build-repo'
import {
  previousResearchSnapshot,
  researchSnapshotForPatch,
} from '../db/research-repo'
import type { StaticDataSource } from './recommendation-service'

/** The current patch is only used when it has at least this many champion-role games. */
const MIN_CURRENT_GAMES = 300
/** Rune pages below this many games are not shown as build evidence. */
const MIN_RUNE_GAMES = 30
const CACHE_LIMIT = 500

export interface ResearchBuildDeps {
  db: DatabaseSync
  source: StaticDataSource
}

/**
 * Lolalytics-style build model for one champion-role from the compact research timelines.
 * Pure aggregation lives in `@shared/research-build`; this class only selects the sample.
 */
export class ResearchBuildService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly cache = new Map<string, ResearchBuildModel | null>()

  constructor(deps: ResearchBuildDeps) {
    this.db = deps.db
    this.source = deps.source
  }

  forChampion(
    championId: string,
    role: Role,
    filters: ResearchFilters = DEFAULT_RESEARCH_FILTERS,
    opponentId: string | null = null,
  ): ResearchBuildModel | null {
    const version = this.source.latestVersion()
    if (version === null) return null
    const champions = this.source.champions(version)
    const me = champions.find((champion) => champion.id === championId)
    if (!me) return null
    const opponent = opponentId
      ? (champions.find((champion) => champion.id === opponentId) ?? null)
      : null
    const currentPatch = toPatch(version)
    const selected = this.selectSnapshot(currentPatch, me.key, role, filters)
    if (!selected) return null
    const { snapshot, totals, fallback } = selected
    if (totals.games === 0) return null

    const cacheKey = [
      snapshot.id,
      totals.games,
      me.key,
      role,
      opponent?.key ?? '-',
      JSON.stringify(filters),
    ].join(':')
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) return cached

    const items = this.source.items(version)
    const overall = researchTimelineSamples(this.db, snapshot.id, me.key, role, filters)
    const matchup = opponent
      ? researchTimelineSamples(this.db, snapshot.id, me.key, role, filters, opponent.key)
      : []
    const laneMatchup = matchup.length >= MIN_MATCHUP_GAMES
    const samples: ResearchTimelineSample[] = laneMatchup ? matchup : overall
    const core = greedyBuild(samples, 'pick')
    const highest = highestWinBuild(samples)
    const model: ResearchBuildModel = {
      championId,
      role,
      scope: {
        patch: currentPatch,
        samplePatch: snapshot.patch,
        fallback,
        tierScope: tierScopeLabel(filters),
        roleScope: roleScopeLabel(filters),
        filters,
        games: samples.length,
        laneMatchup,
        opponentId: opponent?.id ?? null,
        matchupGames: matchup.length,
        note: opponent !== null && !laneMatchup ? 'Lane matchup sample too small, showing all matchups.' : null,
      },
      hasTimelines: samples.length > 0,
      note:
        samples.length > 0
          ? null
          : 'Build order needs timeline collection (Research page, setting).',
      starting: startingSets(samples),
      core,
      highestWin: highest.result,
      highestWinNote: highest.note,
      laterSlots: laterSlotOptions(
        samples,
        core.steps.map((step) => step.itemId),
      ),
      skillPriority: skillPriority(samples),
      skillOrders: skillOrders(samples),
      spellPairs: spellPairs(samples),
      finalItems: itemSamples(this.db, snapshot.id, me.key, role, items, filters).slice(0, 10),
      runePages: this.runePages(snapshot, me.key, role, filters),
    }
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear()
    this.cache.set(cacheKey, model)
    return model
  }

  private runePages(
    snapshot: ResearchSnapshot,
    championKey: number,
    role: Role,
    filters: ResearchFilters,
  ): ResearchRuneSample[] {
    return runeSamples(this.db, snapshot.id, championKey, role, filters)
      .filter((sample) => sample.games >= MIN_RUNE_GAMES)
      .slice(0, 3)
  }

  private selectSnapshot(
    currentPatch: string,
    championKey: number,
    role: Role,
    filters: ResearchFilters,
  ): { snapshot: ResearchSnapshot; totals: { games: number; wins: number }; fallback: boolean } | null {
    const current = researchSnapshotForPatch(this.db, currentPatch)
    const previous = previousResearchSnapshot(this.db, currentPatch)
    const currentTotals = current
      ? championRoleTotals(this.db, current.id, championKey, role, filters)
      : { games: 0, wins: 0 }
    if (current && (currentTotals.games >= MIN_CURRENT_GAMES || !previous)) {
      return { snapshot: current, totals: currentTotals, fallback: false }
    }
    if (!current && !previous) return null
    if (previous) {
      const previousTotals = championRoleTotals(this.db, previous.id, championKey, role, filters)
      if (!current || previousTotals.games >= currentTotals.games) {
        return { snapshot: previous, totals: previousTotals, fallback: true }
      }
    }
    if (!current) return null
    return { snapshot: current, totals: currentTotals, fallback: false }
  }
}
