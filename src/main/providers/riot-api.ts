import type { Match, RiotAccount } from '@shared/riot'

export interface MatchIdsQuery {
  queue: number // e.g. 420 ranked solo, 440 ranked flex, 400 normal draft
  start: number
  count: number // 1..100
}

export interface RiotApiProvider {
  /** Throws RiotApiError with status 404 when the Riot ID does not exist. */
  getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount>
  /** Newest first. */
  getMatchIds(puuid: string, query: MatchIdsQuery): Promise<string[]>
  getMatch(matchId: string): Promise<Match>
}

export class RiotApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'RiotApiError'
    this.status = status
  }
}
