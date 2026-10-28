import type { Match, RiotAccount } from '@shared/riot'
import { parseAccount, parseMatch, parseMatchIds } from '@shared/riot'
import { parseRateLimitHeader, parseRetryAfterMs, RateLimiter } from './rate-limiter'
import type { MatchIdsQuery, RiotApiProvider } from './riot-api'
import { RiotApiError } from './riot-api'

export interface HttpRiotApiOptions {
  apiKey: string
  fetchFn?: typeof fetch
  region?: string
  baseUrl?: string
  limiter?: RateLimiter
  userAgent?: string
  timeoutMs?: number
  maxRetries429?: number
}

const INVALID_KEY_MESSAGE =
  'Riot API key is invalid or expired (development keys expire every 24 hours). ' +
  'Update it in Settings and try again.'

export class HttpRiotApiProvider implements RiotApiProvider {
  private readonly apiKey: string
  private readonly fetchFn: typeof fetch
  private readonly baseUrl: string
  private readonly limiter: RateLimiter
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly maxRetries429: number

  constructor(options: HttpRiotApiOptions) {
    const region = options.region ?? 'europe'
    this.apiKey = options.apiKey
    this.fetchFn = options.fetchFn ?? fetch
    this.baseUrl = options.baseUrl ?? `https://${region}.api.riotgames.com`
    this.limiter = options.limiter ?? new RateLimiter()
    this.userAgent = options.userAgent ?? 'MetaMunch (personal project)'
    this.timeoutMs = options.timeoutMs ?? 15000
    this.maxRetries429 = options.maxRetries429 ?? 3
  }

  async getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
    const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    return parseAccount(await this.request(path))
  }

  async getMatchIds(puuid: string, query: MatchIdsQuery): Promise<string[]> {
    const path = `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${query.queue}&start=${query.start}&count=${query.count}`
    return parseMatchIds(await this.request(path))
  }

  async getMatch(matchId: string): Promise<Match> {
    return parseMatch(await this.request(`/lol/match/v5/matches/${matchId}`))
  }

  private async request(path: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      await this.limiter.acquire()

      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        headers: {
          'X-Riot-Token': this.apiKey,
          'User-Agent': this.userAgent,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      const limits = parseRateLimitHeader(response.headers.get('X-App-Rate-Limit'))
      if (limits.length > 0) this.limiter.setLimits(limits)

      if (response.ok) return response.json()

      if (response.status === 429) {
        const wait =
          parseRetryAfterMs(response.headers.get('Retry-After')) ?? 1000 * (attempt + 1)
        this.limiter.penalize(wait)
        if (attempt < this.maxRetries429) continue
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
}
