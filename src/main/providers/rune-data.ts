import type { RuneTree } from '@shared/runes'
import { parseRuneTrees } from '@shared/runes'

export interface HttpRuneDataOptions {
  fetchFn?: typeof fetch
  baseUrl?: string
  locale?: string
  userAgent?: string
  timeoutMs?: number
}

export interface RuneDataProvider {
  getRunes(version: string): Promise<RuneTree[]>
}

/** Fetches runesReforged.json (names and icon paths for keystones and trees). */
export class HttpRuneDataProvider implements RuneDataProvider {
  private readonly fetchFn: typeof fetch
  private readonly baseUrl: string
  private readonly locale: string
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly cache = new Map<string, RuneTree[]>()

  constructor(options: HttpRuneDataOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch
    this.baseUrl = options.baseUrl ?? 'https://ddragon.leagueoflegends.com'
    this.locale = options.locale ?? 'en_US'
    this.userAgent = options.userAgent ?? 'MetaMunch (personal project)'
    this.timeoutMs = options.timeoutMs ?? 10000
  }

  async getRunes(version: string): Promise<RuneTree[]> {
    const cached = this.cache.get(version)
    if (cached) return cached

    const url = `${this.baseUrl}/cdn/${version}/data/${this.locale}/runesReforged.json`
    const response = await this.fetchFn(url, {
      headers: { 'User-Agent': this.userAgent },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`Data Dragon HTTP ${response.status}: ${url}`)
    const trees = parseRuneTrees(await response.json())
    this.cache.set(version, trees)
    return trees
  }
}
