import type { DatabaseSync } from 'node:sqlite'
import type { SkillOrderEntry, SkillOrderResponse } from '@shared/timeline'
import { skillEventsForChampion } from '../db/timeline-repo'
import type { StaticDataSource } from './recommendation-service'
import type { TrackedAccount } from './personal-stats-service'

const MAX_ORDERS = 5
const SLOT_NAMES = ['Q', 'W', 'E', 'R']

function slotName(slot: number): string {
  return SLOT_NAMES[slot - 1] ?? '?'
}

export interface SkillOrderDeps {
  db: DatabaseSync
  source: StaticDataSource
  getAccount: () => TrackedAccount | null
}

/** Most common skill level-up orders from the user's own match timelines. */
export class SkillOrderService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly getAccount: () => TrackedAccount | null

  constructor(deps: SkillOrderDeps) {
    this.db = deps.db
    this.source = deps.source
    this.getAccount = deps.getAccount
  }

  forChampion(championId: string): SkillOrderResponse {
    const account = this.getAccount()
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const me = champions.find((champion) => champion.id === championId)

    if (!account || !me) {
      return {
        championId,
        championName: me?.name ?? null,
        sampleMatches: 0,
        orders: [],
        hasTimeline: false,
      }
    }

    const rows = skillEventsForChampion(this.db, account.puuid, me.key)
    const matches = new Map<string, { win: boolean; slots: number[] }>()
    for (const row of rows) {
      const match = matches.get(row.matchId) ?? { win: row.win, slots: [] }
      match.slots.push(row.skillSlot)
      matches.set(row.matchId, match)
    }

    const grouped = new Map<string, { slots: number[]; games: number; wins: number }>()
    for (const match of matches.values()) {
      const slots = match.slots.slice(0, 9)
      if (slots.length === 0) continue
      const key = slots.join(',')
      const entry = grouped.get(key) ?? { slots, games: 0, wins: 0 }
      entry.games += 1
      if (match.win) entry.wins += 1
      grouped.set(key, entry)
    }

    const orders: SkillOrderEntry[] = [...grouped.values()]
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, MAX_ORDERS)
      .map((entry) => ({
        slots: entry.slots.map(slotName),
        games: entry.games,
        wins: entry.wins,
        winRate: entry.games === 0 ? 0 : entry.wins / entry.games,
      }))

    return {
      championId,
      championName: me.name,
      sampleMatches: matches.size,
      orders,
      hasTimeline: matches.size > 0,
    }
  }
}
