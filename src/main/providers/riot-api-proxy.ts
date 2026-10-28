import type { Match, RiotAccount } from '@shared/riot'
import type { MatchIdsQuery, RiotApiProvider } from './riot-api'

/** Lets the running services switch to a provider built from a newly saved API key. */
export class RiotApiProxy implements RiotApiProvider {
  private current: RiotApiProvider

  constructor(initial: RiotApiProvider) {
    this.current = initial
  }

  setProvider(provider: RiotApiProvider): void {
    this.current = provider
  }

  getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
    return this.current.getAccountByRiotId(gameName, tagLine)
  }

  getMatchIds(puuid: string, query: MatchIdsQuery): Promise<string[]> {
    return this.current.getMatchIds(puuid, query)
  }

  getMatch(matchId: string): Promise<Match> {
    return this.current.getMatch(matchId)
  }
}
