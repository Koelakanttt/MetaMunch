import { z } from 'zod'
import { wilsonInterval } from './research-stats'

export type ResearchCrawlState = 'idle' | 'running' | 'paused' | 'stopped' | 'complete'

export interface ResearchSnapshot {
  id: number
  patch: string
  region: string
  queueId: number
  rankScope: string
  createdAt: number
  targetMatches: number
}

export interface ResearchCoverageRow {
  championId: string
  name: string
  role: string
  games: number
  wins: number
  pickRate: number
  roleGames: number
}

export interface ResearchStatus {
  snapshot: ResearchSnapshot | null
  matches: number
  participants: number
  bans: number
  timelineEvents: number
  state: ResearchCrawlState
  patch: string | null
  targetMatches: number
  dailyRequestCap: number
  requestsToday: number
  requestsPerMinute: number
  etaSeconds: number | null
  startedAt: number | null
  updatedAt: number
  lastError: string | null
  emeraldPlus: boolean
  seedsExhausted: boolean
  focusChampionId: string | null
  focusRole: string | null
  focusGames: number
  focusTarget: number
  coverage: ResearchCoverageRow[]
  /** Filters the figures above were computed with. */
  filters?: ResearchFilters
  /** Games that pass the role and tier filters (denominator of the figures). */
  includedGames?: number
  excludedInferred?: number
  excludedUnknownTier?: number
  timelineMode?: ResearchTimelineMode
}

export interface ResearchCollectResult {
  snapshotId: number
  requested: number
  saved: number
  skipped: number
  failed: number
  seedPlayers: number
  state: ResearchCrawlState
}

export interface ResearchChampionStat {
  championId: string
  name: string
  games: number
  wins: number
  winRate: number
  pickRate: number
  banRate: number
}

export interface ResearchItemStat {
  itemId: number
  name: string
  purchases: number
  wins: number
  winRate: number
  inclusionRate: number
}

export interface ResearchSummary {
  status: ResearchStatus
  champions: ResearchChampionStat[]
  items: ResearchItemStat[]
}

export interface ResearchAudit {
  championId: string
  role: string
  patch: string | null
  /** Raw rows, before any filter; the tier and role-source shares below describe them. */
  games: number
  matches: number
  tiers: { tier: string; games: number }[]
  roleSources: { source: string; games: number }[]
  filters: ResearchFilters
  tierScope: string
  roleScope: string
  /** Games of this champion-role that pass the active filters. */
  includedGames: number
  excludedInferred: number
  excludedUnknownTier: number
}

export type ResearchTierFilter = 'diamond' | 'master' | 'emerald'

export const RESEARCH_TIER_FILTERS: readonly ResearchTierFilter[] = [
  'diamond',
  'master',
  'emerald',
]

/**
 * Tier buckets each filter covers. Tier buckets are stored uppercase; rows without one
 * count as `unknown` and are only included on request.
 */
export const RESEARCH_TIER_BUCKETS: Record<ResearchTierFilter, readonly string[]> = {
  diamond: ['DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'],
  master: ['MASTER', 'GRANDMASTER', 'CHALLENGER'],
  emerald: ['EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'],
}

export const ResearchFiltersSchema = z.object({
  tier: z.enum(['diamond', 'master', 'emerald']),
  includeInferred: z.boolean(),
  includeUnknownTier: z.boolean(),
})

export type ResearchFilters = z.infer<typeof ResearchFiltersSchema>

export const DEFAULT_RESEARCH_FILTERS: ResearchFilters = {
  tier: 'diamond',
  includeInferred: false,
  includeUnknownTier: false,
}

/** Validates an untrusted filters payload; omitted values fall back to the defaults. */
export function parseResearchFilters(value: unknown): ResearchFilters {
  if (value === undefined || value === null) return { ...DEFAULT_RESEARCH_FILTERS }
  const parsed = ResearchFiltersSchema.partial().safeParse(value)
  if (!parsed.success) {
    throw new Error('Invalid research filters: expected a tier and two booleans.')
  }
  return { ...DEFAULT_RESEARCH_FILTERS, ...parsed.data }
}

export interface ResearchFilterCounts {
  /** Champion-role rows stored, before any filter. */
  totalGames: number
  /** Rows that pass the tier and role filters. */
  includedGames: number
  excludedInferred: number
  excludedUnknownTier: number
}

/** Full tier scope of the sample, e.g. "Diamond+ (Diamond, Master, Grandmaster, Challenger)". */
export function tierScopeLabel(filters: ResearchFilters): string {
  const base =
    filters.tier === 'master'
      ? 'Master+ (Master, Grandmaster, Challenger)'
      : filters.tier === 'emerald'
        ? 'Diamond+ and Emerald (Emerald, Diamond, Master, Grandmaster, Challenger)'
        : 'Diamond+ (Diamond, Master, Grandmaster, Challenger)'
  return filters.includeUnknownTier ? `${base} + unknown tier` : base
}

/** Short tier scope for headers, e.g. "Diamond+". */
export function shortTierScopeLabel(filters: ResearchFilters): string {
  const base =
    filters.tier === 'master'
      ? 'Master+'
      : filters.tier === 'emerald'
        ? 'Diamond+ & Emerald'
        : 'Diamond+'
  return filters.includeUnknownTier ? `${base} + unknown tier` : base
}

export function roleScopeLabel(filters: ResearchFilters): string {
  return filters.includeInferred ? 'Riot and inferred roles' : 'Riot-assigned roles only'
}

/** One-line scope for any filtered figure. */
export function researchScopeLine(
  filters: ResearchFilters,
  patch: string | null,
  games?: number,
): string {
  const parts = [
    shortTierScopeLabel(filters),
    roleScopeLabel(filters),
    `patch ${patch ?? 'unknown'}`,
  ]
  if (games !== undefined) parts.push(`${games} games`)
  return parts.join(' · ')
}

/** Lowest sample size at which win rates of two options may be compared at all. */
export const HIGHEST_WIN_MIN_GAMES = 300

export const NOT_ENOUGH_GAMES_FOR_WIN_RATES =
  'Not enough games to compare win rates (needs 300)'

export function canCompareWinRates(games: number): boolean {
  return games >= HIGHEST_WIN_MIN_GAMES
}

/** Half-width of the 95% Wilson interval, as a fraction; the UI prints it as ±x%. */
export function wilsonHalfWidth(wins: number, games: number): number {
  const interval = wilsonInterval(wins, games)
  return (interval.high - interval.low) / 2
}

export type ResearchTimelineMode = 'off' | 'quarter' | 'full'

export const DEFAULT_RESEARCH_TIMELINE_MODE: ResearchTimelineMode = 'quarter'

export const RESEARCH_TIMELINE_MODES: readonly ResearchTimelineMode[] = ['off', 'quarter', 'full']

export const RESEARCH_TIMELINE_MODE_LABELS: Record<ResearchTimelineMode, string> = {
  off: 'Off',
  quarter: '25% of kept matches',
  full: '100% of kept matches',
}

export function isResearchTimelineMode(value: unknown): value is ResearchTimelineMode {
  return value === 'off' || value === 'quarter' || value === 'full'
}

function matchIdHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Stable per-match sampling so a resumed crawl keeps the same selection. */
export function shouldCollectTimeline(
  mode: ResearchTimelineMode,
  matchId: string,
): boolean {
  if (mode === 'off') return false
  if (mode === 'full') return true
  return matchIdHash(matchId) % 4 === 0
}

/** A slot-wise final-item sample from the research crawl. */
export interface ResearchItemSample {
  itemId: number
  slot: number
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface ResearchRuneSample {
  keystone: number
  primaryStyle: number
  subStyle: number
  runeIds: number[]
  statShardIds: number[]
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface ResearchLaneSample {
  enemyId: string
  enemyName: string
  games: number
  wins: number
  winRate: number
}

export interface ResearchSampleScope {
  patch: string
  /** Patch actually used; differs when the current patch has fewer than 300 games. */
  samplePatch: string
  region: string
  /** Crawl rank scope stored on the snapshot. */
  rankScope: string
  /** Active tier filter this sample was computed with. */
  tierScope: string
  /** Active role-source filter this sample was computed with. */
  roleScope: string
  filters: ResearchFilters
  excludedInferred: number
  excludedUnknownTier: number
  championGames: number
  fallback: boolean
}

export interface ResearchBuildSample {
  scope: ResearchSampleScope
  games: number
  wins: number
  items: ResearchItemSample[]
  boots: ResearchItemSample | null
  rune: ResearchRuneSample | null
  lanes: ResearchLaneSample[]
}
