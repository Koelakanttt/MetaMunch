import type { DatabaseSync } from 'node:sqlite'
import type { StaticDataSource } from './recommendation-service'
import {
  purchaseEventsForChampion,
  purchaseOrderForChampion,
  timelineMatchCount,
} from '../db/timeline-repo'
import type { TrackedAccount } from './personal-stats-service'
import type { PurchaseOrderResponse, PurchasePathEntry } from '@shared/timeline'

const MAX_PATHS = 3
const PATH_LENGTH = 4

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
        paths: [],
        hasTimeline: false,
      }
    }

    const itemNames = new Map(items.map((item) => [item.id, item.name]))
    const rows = purchaseOrderForChampion(this.db, account.puuid, me.key)
    const events = purchaseEventsForChampion(this.db, account.puuid, me.key)
    const sampleMatches = timelineMatchCount(this.db, account.puuid, me.key)

    const matches = new Map<string, { win: boolean; itemIds: number[] }>()
    for (const event of events) {
      const match = matches.get(event.matchId) ?? { win: event.win, itemIds: [] }
      if (match.itemIds.length < PATH_LENGTH && !match.itemIds.includes(event.itemId)) {
        match.itemIds.push(event.itemId)
      }
      matches.set(event.matchId, match)
    }

    const grouped = new Map<string, { itemIds: number[]; games: number; wins: number }>()
    for (const match of matches.values()) {
      if (match.itemIds.length === 0) continue
      const key = match.itemIds.join(',')
      const entry = grouped.get(key) ?? { itemIds: match.itemIds, games: 0, wins: 0 }
      entry.games += 1
      if (match.win) entry.wins += 1
      grouped.set(key, entry)
    }

    const paths: PurchasePathEntry[] = [...grouped.values()]
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, MAX_PATHS)
      .map((entry) => ({
        items: entry.itemIds.map((itemId) => ({
          itemId,
          name: itemNames.get(itemId) ?? `Item ${itemId}`,
        })),
        games: entry.games,
        winRate: entry.games === 0 ? 0 : entry.wins / entry.games,
      }))

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
      paths,
      hasTimeline: sampleMatches > 0,
    }
  }
}
