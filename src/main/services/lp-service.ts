import type { DatabaseSync } from 'node:sqlite'
import type { LeagueEntry, RiotApiProvider } from '../providers/riot-api'
import { insertLpSnapshot, latestLpSnapshot, lpHistory, type LpSnapshot } from '../db/lp-repo'
import type { TrackedAccount } from './personal-stats-service'

const HOUR_MS = 60 * 60 * 1000

export interface LpServiceDeps {
  db: DatabaseSync
  provider: () => RiotApiProvider
  getAccount: () => TrackedAccount | null
  now?: () => number
}

/** Best-effort personal ranked LP snapshots, at most once per hour. */
export class LpService {
  private readonly db: DatabaseSync
  private readonly provider: () => RiotApiProvider
  private readonly getAccount: () => TrackedAccount | null
  private readonly now: () => number

  constructor(deps: LpServiceDeps) {
    this.db = deps.db
    this.provider = deps.provider
    this.getAccount = deps.getAccount
    this.now = deps.now ?? Date.now
  }

  history(): LpSnapshot[] {
    return lpHistory(this.db)
  }

  async snapshot(): Promise<LpSnapshot | null> {
    const account = this.getAccount()
    if (!account) return null
    const last = latestLpSnapshot(this.db)
    const now = this.now()
    if (last && now - last.capturedAt < HOUR_MS) return last
    const provider = this.provider()
    const getEntries = provider.getLeagueEntriesByPuuid
    if (!getEntries) return null

    let entries: LeagueEntry[]
    try {
      entries = await getEntries.call(provider, account.puuid)
    } catch {
      return null
    }
    const solo = entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5')
    if (!solo) return null
    return insertLpSnapshot(this.db, {
      queueType: solo.queueType,
      tier: solo.tier,
      division: solo.rank,
      leaguePoints: solo.leaguePoints,
      wins: solo.wins,
      losses: solo.losses,
      capturedAt: now,
    })
  }
}
