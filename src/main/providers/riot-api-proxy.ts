import type { Match, RiotAccount } from '@shared/riot'
import type { TimelineEvent } from '@shared/timeline'
import type {
  ApexTier,
  LeagueEntriesQuery,
  LeagueEntry,
  MatchIdsQuery,
  RiotApiProvider,
} from './riot-api'

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

  getTimeline(matchId: string): Promise<TimelineEvent[]> {
    if (!this.current.getTimeline) {
      return Promise.reject(new Error('Timeline API is not available with this Riot provider.'))
    }
    return this.current.getTimeline(matchId)
  }

  getTimelineRaw(matchId: string): Promise<unknown> {
    if (!this.current.getTimelineRaw) {
      return Promise.reject(new Error('Timeline API is not available with this Riot provider.'))
    }
    return this.current.getTimelineRaw(matchId)
  }

  getLeagueEntries(query: LeagueEntriesQuery): Promise<LeagueEntry[]> {
    if (!this.current.getLeagueEntries) {
      return Promise.reject(new Error('League API is not available with this Riot provider.'))
    }
    return this.current.getLeagueEntries(query)
  }

  getLeagueEntriesByPuuid(puuid: string): Promise<LeagueEntry[]> {
    if (!this.current.getLeagueEntriesByPuuid) {
      return Promise.reject(new Error('League API is not available with this Riot provider.'))
    }
    return this.current.getLeagueEntriesByPuuid(puuid)
  }

  getApexLeagueEntries(tier: ApexTier): Promise<LeagueEntry[]> {
    if (!this.current.getApexLeagueEntries) {
      return Promise.reject(new Error('Apex league API is not available with this Riot provider.'))
    }
    return this.current.getApexLeagueEntries(tier)
  }

  getSummonerPuuid(summonerId: string): Promise<string> {
    if (!this.current.getSummonerPuuid) {
      return Promise.reject(new Error('Summoner API is not available with this Riot provider.'))
    }
    return this.current.getSummonerPuuid(summonerId)
  }
}
