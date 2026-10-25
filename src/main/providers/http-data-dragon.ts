import type { Champion, Item, ParseResult } from '@shared/ddragon'
import { parseChampionList, parseItemList, parseRealmVersion } from '@shared/ddragon'
import type { DataDragonProvider } from './data-dragon'

export interface HttpDataDragonOptions {
  fetchFn?: typeof fetch
  baseUrl?: string
  region?: string
  locale?: string
  userAgent?: string
  timeoutMs?: number
}

export class HttpDataDragonProvider implements DataDragonProvider {
  private readonly fetchFn: typeof fetch
  private readonly baseUrl: string
  private readonly region: string
  private readonly locale: string
  private readonly userAgent: string
  private readonly timeoutMs: number

  constructor(options: HttpDataDragonOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch
    this.baseUrl = options.baseUrl ?? 'https://ddragon.leagueoflegends.com'
    this.region = options.region ?? 'euw'
    this.locale = options.locale ?? 'en_US'
    this.userAgent = options.userAgent ?? 'MetaMunch (personal project)'
    this.timeoutMs = options.timeoutMs ?? 15000
  }

  async getLatestVersion(): Promise<string> {
    const json = await this.getJson(`${this.baseUrl}/realms/${this.region}.json`)
    return parseRealmVersion(json)
  }

  async getChampions(version: string): Promise<ParseResult<Champion>> {
    const url = `${this.baseUrl}/cdn/${version}/data/${this.locale}/champion.json`
    return parseChampionList(await this.getJson(url))
  }

  async getItems(version: string): Promise<ParseResult<Item>> {
    const url = `${this.baseUrl}/cdn/${version}/data/${this.locale}/item.json`
    return parseItemList(await this.getJson(url))
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await this.fetchFn(url, {
      headers: { 'User-Agent': this.userAgent },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`Data Dragon HTTP ${response.status}: ${url}`)
    }
    return response.json()
  }
}
