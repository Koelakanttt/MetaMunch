import type { Match, RiotAccount } from '@shared/riot'
import type { TimelineEvent } from '@shared/timeline'

export interface MatchIdsQuery {
  queue?: number // omit to fetch every queue
  start: number
  count: number // 1..100
  /** Epoch milliseconds; converted to Riot's seconds-based startTime. */
  startTime?: number
}

export type ApexTier = 'CHALLENGER' | 'GRANDMASTER' | 'MASTER'

export const LEAGUE_TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
] as const
export type LeagueTier = (typeof LEAGUE_TIERS)[number]

export interface LeagueEntriesQuery {
  queue: 'RANKED_SOLO_5x5'
  tier: LeagueTier
  division: 'I' | 'II' | 'III' | 'IV'
  page: number
}

export interface LeagueEntry {
  puuid?: string | null
  summonerId?: string | null
  tier: string
  rank: string
  queueType: string
  leaguePoints: number
  wins: number
  losses: number
}

export interface RiotApiProvider {
  /** Throws RiotApiError with status 404 when the Riot ID does not exist. */
  getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount>
  /** Newest first. */
  getMatchIds(puuid: string, query: MatchIdsQuery): Promise<string[]>
  getMatch(matchId: string): Promise<Match>
  /** Optional so test providers and static-only providers can omit it. */
  getTimeline?(matchId: string): Promise<TimelineEvent[]>
  /** Platform-routed ladder entries, used only by the research collector. */
  getLeagueEntries?(query: LeagueEntriesQuery): Promise<LeagueEntry[]>
  /** Apex league endpoints (challenger/grandmaster/master), used only by the research collector. */
  getApexLeagueEntries?(tier: ApexTier): Promise<LeagueEntry[]>
  /** Resolves a summonerId when a league entry has no puuid. */
  getSummonerPuuid?(summonerId: string): Promise<string>
}

export interface RiotApiAttempt {
  transport: 'node' | 'chromium'
  ms: number
  status: number | null
  error: string | null
}

export class RiotApiError extends Error {
  readonly status: number
  /** Transport attempts for network failures; empty for HTTP errors. */
  attempts: RiotApiAttempt[] = []
  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RiotApiError'
    this.status = status
  }
}
