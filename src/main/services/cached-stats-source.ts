import type { GeneralStatsFilters, GeneralStatsResponse } from '@shared/general-stats'
import type { StatsSource } from './stats-coordinator'

/**
 * Caches a source's results per patch and per filter set.
 * Used for external sources, which must not be hit on every screen open.
 */
export class CachedStatsSource implements StatsSource {
  private readonly source: StatsSource
  private readonly getPatch: () => string | null
  private readonly cache = new Map<string, GeneralStatsResponse>()
  private patch: string | null = null

  constructor(deps: { source: StatsSource; getPatch: () => string | null }) {
    this.source = deps.source
    this.getPatch = deps.getPatch
  }

  async run(filters: GeneralStatsFilters = {}): Promise<GeneralStatsResponse> {
    const patch = this.getPatch()
    if (patch !== this.patch) {
      this.cache.clear()
      this.patch = patch
    }

    const key = `${filters.patch ?? ''}|${filters.queue ?? ''}`
    const cached = this.cache.get(key)
    if (cached) return cached

    const result = await this.source.run(filters)
    this.cache.set(key, result)
    return result
  }
}
