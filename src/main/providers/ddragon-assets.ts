export interface Asset {
  data: Buffer
  contentType: string
}

/** Fetches Data Dragon champion/item images for the local asset protocol, with an in-memory cache. */
export class DdragonAssetProvider {
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly cache = new Map<string, Asset>()

  constructor(options: { baseUrl?: string; userAgent?: string } = {}) {
    this.baseUrl = options.baseUrl ?? 'https://ddragon.leagueoflegends.com'
    this.userAgent = options.userAgent ?? 'MetaMunch (personal project)'
  }

  async get(
    kind: 'champion' | 'item',
    version: string,
    id: string,
  ): Promise<Asset | null> {
    const url = `${this.baseUrl}/cdn/${version}/img/${kind}/${encodeURIComponent(id)}.png`
    return this.load(url)
  }

  /** Rune icons live under /cdn/img and do not depend on the patch version. */
  async getRune(iconPath: string): Promise<Asset | null> {
    if (!iconPath.startsWith('perk-images/') || iconPath.includes('..')) return null
    return this.load(`${this.baseUrl}/cdn/img/${iconPath}`)
  }

  private async load(url: string): Promise<Asset | null> {
    const cached = this.cache.get(url)
    if (cached) return cached

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return null
      const data = Buffer.from(await response.arrayBuffer())
      const asset = {
        data,
        contentType: response.headers.get('content-type') ?? 'image/png',
      }
      this.cache.set(url, asset)
      return asset
    } catch {
      return null
    }
  }
}
