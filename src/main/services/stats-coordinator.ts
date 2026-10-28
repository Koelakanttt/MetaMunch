import type { GeneralStatsFilters, GeneralStatsResponse } from '@shared/general-stats'

/** Replaceable source of general statistics (own sample now, external later). */
export interface StatsSource {
  run(filters: GeneralStatsFilters): GeneralStatsResponse | Promise<GeneralStatsResponse>
}

export interface StatsCoordinatorDeps {
  own: StatsSource
  external?: StatsSource
  isExternalEnabled: () => boolean
}

/**
 * Chooses the statistics source. When the external flag is on but no source is configured
 * (or it fails), it falls back to the own sample and explains that in `note`.
 */
export class StatsCoordinator {
  private readonly own: StatsSource
  private readonly external: StatsSource | undefined
  private readonly isExternalEnabled: () => boolean

  constructor(deps: StatsCoordinatorDeps) {
    this.own = deps.own
    this.external = deps.external
    this.isExternalEnabled = deps.isExternalEnabled
  }

  async run(filters: GeneralStatsFilters = {}): Promise<GeneralStatsResponse> {
    const externalEnabled = this.isExternalEnabled()

    if (externalEnabled && this.external) {
      try {
        const result = await this.external.run(filters)
        return { ...result, source: 'external', note: null }
      } catch {
        const own = await this.own.run(filters)
        return {
          ...own,
          source: 'own',
          note: 'External statistics are unavailable; showing your own sample.',
        }
      }
    }

    const own = await this.own.run(filters)
    if (externalEnabled) {
      return {
        ...own,
        source: 'own',
        note: 'External statistics are not configured; showing your own sample.',
      }
    }
    return own
  }
}
