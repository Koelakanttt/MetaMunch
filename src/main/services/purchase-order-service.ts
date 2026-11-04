import type { DatabaseSync } from 'node:sqlite'
import type { StaticDataSource } from './recommendation-service'
import {
  purchaseEventsForChampion,
  purchaseOrderForChampion,
  timelineMatchCount,
} from '../db/timeline-repo'
import type { TrackedAccount } from './personal-stats-service'
import type { PurchaseOrderResponse, PurchasePathEntry, StartingItemBundle } from '@shared/timeline'

const MAX_PATHS = 3
const PATH_LENGTH = 4
const STARTING_ITEM_MAX_GOLD = 500
const STARTING_WINDOW_MS = 90_000

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
    const itemsById = new Map(items.map((item) => [item.id, item]))
    const me = champions.find((champion) => champion.id === championId)

    if (!account || !me) {
      return {
        championId,
        championName: me?.name ?? null,
        sampleMatches: 0,
        items: [],
        paths: [],
        startingBundles: [],
        hasTimeline: false,
      }
    }

    const itemNames = new Map(items.map((item) => [item.id, item.name]))
    // Starting items and consumables belong to the recorded opening, not the purchase table.
    const isStartingItem = (itemId: number): boolean => {
      const item = itemsById.get(itemId)
      if (!item) return false
      return (
        (item.goldTotal <= STARTING_ITEM_MAX_GOLD && item.into.length === 0) ||
        item.tags.includes('Consumable') ||
        item.tags.includes('Trinket')
      )
    }
    const rows = purchaseOrderForChampion(this.db, account.puuid, me.key).filter(
      (row) => !isStartingItem(row.itemId),
    )
    const events = purchaseEventsForChampion(this.db, account.puuid, me.key)
    const sampleMatches = timelineMatchCount(this.db, account.puuid, me.key)

    const matches = new Map<string, { win: boolean; itemIds: number[] }>()
    for (const event of events) {
      if (isStartingItem(event.itemId)) continue
      const match = matches.get(event.matchId) ?? { win: event.win, itemIds: [] }
      if (match.itemIds.length < PATH_LENGTH && !match.itemIds.includes(event.itemId)) {
        match.itemIds.push(event.itemId)
      }
      matches.set(event.matchId, match)
    }

    const startingByMatch = new Map<string, { win: boolean; items: number[] }>()
    for (const event of events) {
      if (event.timestampMs > STARTING_WINDOW_MS) continue
      const item = itemsById.get(event.itemId)
      if (!item || item.tags.includes('Trinket')) continue
      const entry = startingByMatch.get(event.matchId) ?? { win: event.win, items: [] }
      if (!entry.items.includes(event.itemId)) entry.items.push(event.itemId)
      startingByMatch.set(event.matchId, entry)
    }
    const startingGroups = new Map<string, { itemIds: number[]; games: number; wins: number }>()
    for (const entry of startingByMatch.values()) {
      if (entry.items.length === 0) continue
      const key = entry.items.join(',')
      const group = startingGroups.get(key) ?? { itemIds: entry.items, games: 0, wins: 0 }
      group.games += 1
      if (entry.win) group.wins += 1
      startingGroups.set(key, group)
    }
    const startingBundles: StartingItemBundle[] = [...startingGroups.values()]
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, 3)
      .map((entry) => ({
        items: entry.itemIds.map((itemId) => ({
          itemId,
          name: itemNames.get(itemId) ?? `Item ${itemId}`,
        })),
        games: entry.games,
        winRate: entry.games === 0 ? 0 : entry.wins / entry.games,
      }))

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
      startingBundles,
      hasTimeline: sampleMatches > 0,
    }
  }
}
