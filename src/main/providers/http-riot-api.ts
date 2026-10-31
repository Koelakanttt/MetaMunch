import type { Match, RiotAccount } from '@shared/riot'
import { parseAccount, parseMatch, parseMatchIds } from '@shared/riot'
import type { TimelineEvent } from '@shared/timeline'
import { parseTimeline } from '@shared/timeline'
import { z } from 'zod'
import { RateLimiter } from './rate-limiter'
import type {
  ApexTier,
  LeagueEntriesQuery,
  LeagueEntry,
  MatchIdsQuery,
  RiotApiProvider,
} from './riot-api'
import { RiotApiError } from './riot-api'
import { RiotRequestManager } from './riot-request-manager'

export interface HttpRiotApiOptions {
  apiKey: string
  fetchFn?: typeof fetch
  region?: string
  platform?: string
  baseUrl?: string
  limiter?: RateLimiter
  manager?: RiotRequestManager
  userAgent?: string
  timeoutMs?: number
  maxRetries429?: number
  maxRetriesNetwork?: number
}

const LeagueEntrySchema = z.object({
  puuid: z.string().optional(),
  summonerId: z.string().optional(),
  tier: z.string().default(''),
  rank: z.string().default(''),
  queueType: z.string().default(''),
  leaguePoints: z.number().default(0),
  wins: z.number().default(0),
  losses: z.number().default(0),
})

const LeagueEntriesSchema = z.array(LeagueEntrySchema)
const ApexLeagueSchema = z.object({
  entries: z.array(LeagueEntrySchema).default([]),
})
const SummonerSchema = z.object({ puuid: z.string().min(1) })

function leagueEntry(entry: z.infer<typeof LeagueEntrySchema>): LeagueEntry {
  return {
    puuid: entry.puuid ?? null,
    summonerId: entry.summonerId ?? null,
    tier: entry.tier,
    rank: entry.rank,
    queueType: entry.queueType,
    leaguePoints: entry.leaguePoints,
    wins: entry.wins,
    losses: entry.losses,
  }
}

const INVALID_KEY_MESSAGE =
  'Riot API key is invalid or expired (development keys expire every 24 hours). ' +
  'Update it in Settings and try again.'

export class HttpRiotApiProvider implements RiotApiProvider {
  private readonly apiKey: string
  private readonly manager: RiotRequestManager
  private readonly baseUrl: string
  private readonly platformBaseUrl: string | null
  private readonly userAgent: string

  constructor(options: HttpRiotApiOptions) {
    const region = options.region ?? 'europe'
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? `https://${region}.api.riotgames.com`
    this.platformBaseUrl = options.platform
      ? `https://${options.platform.toLowerCase()}.api.riotgames.com`
      : null
    this.manager =
      options.manager ??
      new RiotRequestManager({
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
        ...(options.limiter ? { limiter: options.limiter } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        ...(options.maxRetries429 !== undefined
          ? { maxRateLimitRetries: options.maxRetries429 }
          : {}),
        ...(options.maxRetriesNetwork !== undefined
          ? { maxNetworkRetries: options.maxRetriesNetwork }
          : {}),
      })
    this.userAgent =
      options.userAgent ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MetaMunch/0.1.0-alpha Chrome/131.0.0.0 Safari/537.36'
  }

  async getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
    const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    return parseAccount(await this.request(path))
  }

  async getMatchIds(puuid: string, query: MatchIdsQuery): Promise<string[]> {
    const params = new URLSearchParams()
    if (query.queue !== undefined) params.set('queue', String(query.queue))
    if (query.startTime !== undefined) {
      params.set('startTime', String(Math.floor(query.startTime / 1000)))
    }
    params.set('start', String(query.start))
    params.set('count', String(query.count))
    const path = `/lol/match/v5/matches/by-puuid/${puuid}/ids?${params.toString()}`
    return parseMatchIds(await this.request(path))
  }

  async getMatch(matchId: string): Promise<Match> {
    return parseMatch(await this.request(`/lol/match/v5/matches/${matchId}`))
  }

  async getTimeline(matchId: string): Promise<TimelineEvent[]> {
    return parseTimeline(await this.request(`/lol/match/v5/matches/${matchId}/timeline`))
  }

  async getLeagueEntries(query: LeagueEntriesQuery): Promise<LeagueEntry[]> {
    if (!this.platformBaseUrl) throw new Error('A platform is required for league entries')
    const path = `/lol/league-exp/v4/entries/${query.queue}/${query.tier}/${query.division}?page=${query.page}`
    const entries = LeagueEntriesSchema.parse(await this.request(path, this.platformBaseUrl))
    return entries.map(leagueEntry)
  }

  async getApexLeagueEntries(tier: ApexTier): Promise<LeagueEntry[]> {
    if (!this.platformBaseUrl) throw new Error('A platform is required for league entries')
    const league = `${tier.toLowerCase()}leagues`
    const path = `/lol/league/v4/${league}/by-queue/RANKED_SOLO_5x5`
    const body = ApexLeagueSchema.parse(await this.request(path, this.platformBaseUrl))
    return body.entries.map((entry) => leagueEntry({ ...entry, tier: entry.tier || tier }))
  }

  async getSummonerPuuid(summonerId: string): Promise<string> {
    if (!this.platformBaseUrl) throw new Error('A platform is required for summoners')
    const path = `/lol/summoner/v4/summoners/${encodeURIComponent(summonerId)}`
    const body = SummonerSchema.parse(await this.request(path, this.platformBaseUrl))
    return body.puuid
  }

  private async request(path: string, baseUrl = this.baseUrl): Promise<unknown> {
    const url = `${baseUrl}${path}`
    const { response } = await this.manager.request(url, {
      headers: {
        'X-Riot-Token': this.apiKey,
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
    })

    if (response.ok) return response.json()
    if (response.status === 429) {
      throw new RiotApiError(429, 'Riot API rate limit exceeded')
    }
    if (response.status === 401 || response.status === 403) {
      throw new RiotApiError(response.status, INVALID_KEY_MESSAGE)
    }
    if (response.status === 404) {
      throw new RiotApiError(404, 'Not found')
    }
    throw new RiotApiError(response.status, `Riot API HTTP ${response.status}`)
  }
}
