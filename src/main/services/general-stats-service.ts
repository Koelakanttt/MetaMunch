import type { DatabaseSync } from 'node:sqlite'
import type {
  ChampionStat,
  GeneralStatsFilters,
  GeneralStatsResponse,
  ItemStat,
} from '@shared/general-stats'
import { compareVersionsDesc } from '@shared/version'
import { samplePatches, sampleRows } from '../db/general-stats-repo'
import type { StaticDataSource } from './recommendation-service'

/**
 * "General" statistics computed from the user's own synced matches.
 * It counts every participant of those matches, but stores no identifiers.
 * A replaceable external source can be added later behind a flag.
 */
export class GeneralStatsService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource

  constructor(deps: { db: DatabaseSync; source: StaticDataSource }) {
    this.db = deps.db
    this.source = deps.source
  }

  run(filters: GeneralStatsFilters = {}): GeneralStatsResponse {
    const rows = sampleRows(this.db, { patch: filters.patch, queue: filters.queue })
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const items = version === null ? [] : this.source.items(version)
    const championNames = new Map(champions.map((champion) => [champion.key, champion]))
    const itemNames = new Map(items.map((item) => [item.id, item.name]))

    const totalPicks = rows.length
    const championCounts = new Map<number, { picks: number; wins: number }>()
    const itemCounts = new Map<number, { purchases: number; wins: number }>()
    const matchIds = new Set<string>()

    for (const row of rows) {
      matchIds.add(row.matchId)

      const champion = championCounts.get(row.championKey) ?? { picks: 0, wins: 0 }
      champion.picks += 1
      if (row.win) champion.wins += 1
      championCounts.set(row.championKey, champion)

      for (const itemId of row.items) {
        if (itemId <= 0) continue
        const item = itemCounts.get(itemId) ?? { purchases: 0, wins: 0 }
        item.purchases += 1
        if (row.win) item.wins += 1
        itemCounts.set(itemId, item)
      }
    }

    const championStats: ChampionStat[] = [...championCounts.entries()]
      .map(([championKey, counts]) => {
        const champion = championNames.get(championKey)
        return {
          championId: champion?.id ?? String(championKey),
          name: champion?.name ?? `Champion ${championKey}`,
          picks: counts.picks,
          wins: counts.wins,
          pickRate: totalPicks === 0 ? 0 : counts.picks / totalPicks,
          winRate: counts.wins / counts.picks,
        }
      })
      .sort((a, b) => b.picks - a.picks || a.name.localeCompare(b.name))

    const itemStats: ItemStat[] = [...itemCounts.entries()]
      .map(([itemId, counts]) => ({
        itemId,
        name: itemNames.get(itemId) ?? `Item ${itemId}`,
        purchases: counts.purchases,
        wins: counts.wins,
        winRate: counts.wins / counts.purchases,
      }))
      .sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name))

    return {
      sample: { matches: matchIds.size, picks: totalPicks },
      patches: samplePatches(this.db).sort(compareVersionsDesc),
      champions: championStats,
      items: itemStats,
      hasStaticData: version !== null,
      source: 'own',
      note: null,
    }
  }
}
