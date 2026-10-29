import type { DatabaseSync } from 'node:sqlite'
import type { StaticDataSource } from './recommendation-service'
import { purchaseOrderForChampion, timelineMatchCount } from '../db/timeline-repo'
import type { TrackedAccount } from './personal-stats-service'
import type { PurchaseOrderResponse } from '@shared/timeline'

export interface PurchaseOrderDeps {
  db: DatabaseSync
  source: StaticDataSource
  getAccount: () => TrackedAccount | null
}

/** Average first-purchase timing from the user's own stored match timelines. */
export class PurchaseOrderService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly getAccount: () => TrackedAccount | null

  constructor(deps: PurchaseOrderDeps) {
    this.db = deps.db
    this.source = deps.source
    this.getAccount = deps.getAccount
  }

  forChampion(championId: string): PurchaseOrderResponse {
    const account = this.getAccount()
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const items = version === null ? [] : this.source.items(version)
    const me = champions.find((champion) => champion.id === championId)

    if (!account || !me) {
      return {
        championId,
        championName: me?.name ?? null,
        sampleMatches: 0,
        items: [],
        hasTimeline: false,
      }
    }

    const itemNames = new Map(items.map((item) => [item.id, item.name]))
    const rows = purchaseOrderForChampion(this.db, account.puuid, me.key)
    const sampleMatches = timelineMatchCount(this.db, account.puuid, me.key)

    return {
      championId,
      championName: me.name,
      sampleMatches,
      items: rows.map((row) => ({
        itemId: row.itemId,
        name: itemNames.get(row.itemId) ?? `Item ${row.itemId}`,
        games: row.games,
        averageSeconds: Math.round(row.averageMs / 1000),
      })),
      hasTimeline: sampleMatches > 0,
    }
  }
}
