import type { DatabaseSync } from 'node:sqlite'
import type { MatchHistoryEntry, MatchHistoryFilters, MatchHistoryResponse } from '@shared/history'
import { compareVersionsDesc } from '@shared/version'
import { historyPatches, historyRows } from '../db/match-history-repo'
import type { TrackedAccount } from './personal-stats-service'
import type { StaticDataSource } from './recommendation-service'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
}

export class MatchHistoryService {
  private readonly db: DatabaseSync
  private readonly getAccount: () => TrackedAccount | null
  private readonly source: StaticDataSource

  constructor(deps: {
    db: DatabaseSync
    getAccount: () => TrackedAccount | null
    source: StaticDataSource
  }) {
    this.db = deps.db
    this.getAccount = deps.getAccount
    this.source = deps.source
  }

  list(filters: MatchHistoryFilters = {}): MatchHistoryResponse {
    const account = this.getAccount()
    if (!account) {
      return { account: null, entries: [], patches: [], hasStaticData: false }
    }

    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const items = version === null ? [] : this.source.items(version)
    const byId = new Map(champions.map((champion) => [champion.id, champion]))
    const byKey = new Map(champions.map((champion) => [champion.key, champion]))
    const itemNames = new Map(items.map((item) => [item.id, item.name]))

    let championKey: number | undefined
    if (filters.championId) {
      const champion = byId.get(filters.championId)
      if (!champion) {
        const patches = historyPatches(this.db, account.puuid).sort(compareVersionsDesc)
        return { account: accountSummary(account), entries: [], patches, hasStaticData: version !== null }
      }
      championKey = champion.key
    }

    const rows = historyRows(this.db, account.puuid, {
      championKey,
      position: filters.position,
      patch: filters.patch,
      queue: filters.queue,
      limit: clampLimit(filters.limit),
    })

    const entries: MatchHistoryEntry[] = rows.map((row) => {
      const champion = byKey.get(row.championKey)
      return {
        matchId: row.matchId,
        championId: champion?.id ?? String(row.championKey),
        championName: champion?.name ?? `Champion ${row.championKey}`,
        position: row.position,
        win: row.win,
        queueId: row.queueId,
        patch: row.patch,
        gameCreation: row.gameCreation,
        durationSec: row.durationSec,
        items: row.items
          .filter((id) => id > 0)
          .map((id) => ({ id, name: itemNames.get(id) ?? `Item ${id}` })),
      }
    })

    const patches = historyPatches(this.db, account.puuid).sort(compareVersionsDesc)
    return {
      account: accountSummary(account),
      entries,
      patches,
      hasStaticData: version !== null,
    }
  }
}

function accountSummary(account: TrackedAccount): { gameName: string; tagLine: string } {
  return { gameName: account.gameName, tagLine: account.tagLine }
}
