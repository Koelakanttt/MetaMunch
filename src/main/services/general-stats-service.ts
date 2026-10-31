import type { DatabaseSync } from 'node:sqlite'
import type {
  ChampionStat,
  GeneralStatsFilters,
  GeneralStatsResponse,
  ItemStat,
} from '@shared/general-stats'
import { PERSONAL_QUEUES } from '@shared/personal'
import { compareVersionsDesc } from '@shared/version'
import { samplePatches, sampleRows } from '../db/general-stats-repo'
import type { StaticDataSource } from './recommendation-service'

/**
 * Statistics for the tracked account. With `getAccount`, only that account's
 * participant rows are counted; the optional provider is omitted by legacy tests.
 */
export class GeneralStatsService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly getAccount: (() => { puuid: string } | null) | undefined

  constructor(deps: {
    db: DatabaseSync
    source: StaticDataSource
    getAccount?: () => { puuid: string } | null
  }) {
    this.db = deps.db
    this.source = deps.source
    this.getAccount = deps.getAccount
  }

  run(filters: GeneralStatsFilters = {}): GeneralStatsResponse {
    // With a tracked account, stats are the owner's games only. An empty puuid
    // deliberately matches nothing when the account is not set.
    const puuid = this.getAccount === undefined ? null : (this.getAccount()?.puuid ?? '')
    const rows = sampleRows(
      this.db,
      { patch: filters.patch, queue: filters.queue },
      PERSONAL_QUEUES,
      puuid,
    )
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
      patches: samplePatches(this.db, PERSONAL_QUEUES, puuid).sort(compareVersionsDesc),
      champions: championStats,
      items: itemStats,
      hasStaticData: version !== null,
      source: 'own',
      note: null,
    }
  }
}
