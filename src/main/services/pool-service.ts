import type { DatabaseSync } from 'node:sqlite'
import { isLowSample, smoothWinRate } from '@shared/personal'
import type { PoolEntry, PoolResponse } from '@shared/pool'
import { accountRecord, championTotals } from '../db/personal-stats-repo'
import type { TrackedAccount } from './personal-stats-service'
import type { StaticDataSource } from './recommendation-service'

/** Own champion pool aggregated from the synced matches. */
export class PoolService {
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

  list(): PoolResponse {
    const account = this.getAccount()
    if (!account) {
      return { account: null, overall: null, entries: [], hasStaticData: false }
    }

    const overallRecord = accountRecord(this.db, account.puuid)
    const prior = overallRecord.games > 0 ? overallRecord.wins / overallRecord.games : 0.5
    const overall = {
      games: overallRecord.games,
      wins: overallRecord.wins,
      lowSample: isLowSample(overallRecord.games),
      adjustedWinRate: smoothWinRate(overallRecord.games, overallRecord.wins, prior),
    }

    const version = this.source.latestVersion()
    if (version === null) {
      return {
        account: { gameName: account.gameName, tagLine: account.tagLine },
        overall,
        entries: [],
        hasStaticData: false,
      }
    }

    const byKey = new Map(this.source.champions(version).map((champion) => [champion.key, champion]))
    const entries: PoolEntry[] = []
    for (const total of championTotals(this.db, account.puuid)) {
      const champion = byKey.get(total.championKey)
      if (!champion) continue
      entries.push({
        championId: champion.id,
        name: champion.name,
        games: total.games,
        wins: total.wins,
        lowSample: isLowSample(total.games),
        adjustedWinRate: smoothWinRate(total.games, total.wins, prior),
        lastGameCreation: total.lastGameCreation,
      })
    }

    return {
      account: { gameName: account.gameName, tagLine: account.tagLine },
      overall,
      entries,
      hasStaticData: true,
    }
  }
}
