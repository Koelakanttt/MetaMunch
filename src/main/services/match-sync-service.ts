import type { DatabaseSync } from 'node:sqlite'
import { parseRiotId } from '@shared/riot'
import type { RiotAccount } from '@shared/riot'
import {
  countMatches,
  getAccount,
  knownMatchIds,
  lastGameCreation,
  saveMatch,
  upsertAccount,
} from '../db/matches-repo'
import type { RiotApiProvider } from '../providers/riot-api'
import { RiotApiError } from '../providers/riot-api'

export interface SyncOptions {
  queues?: number[]
  maxNewMatches?: number
}

export interface SyncResult {
  requested: number
  saved: number
  skippedExisting: number
  failed: number
}

export interface MatchStatus {
  account: { gameName: string; tagLine: string } | null
  matches: number
  lastGameCreation: number | null
}

const DEFAULT_QUEUES = [420, 440, 400]
const DEFAULT_MAX_NEW_MATCHES = 60

function numericSuffix(matchId: string): number {
  return Number(matchId.slice(matchId.lastIndexOf('_') + 1))
}

export class MatchSyncService {
  private readonly db: DatabaseSync
  private readonly provider: RiotApiProvider
  private readonly platform: string
  private readonly now: () => number

  constructor(deps: {
    db: DatabaseSync
    provider: RiotApiProvider
    platform?: string
    now?: () => number
  }) {
    this.db = deps.db
    this.provider = deps.provider
    this.platform = deps.platform ?? 'EUW1'
    this.now = deps.now ?? Date.now
  }

  async setAccount(riotId: string): Promise<RiotAccount> {
    const parsed = parseRiotId(riotId)
    const account = await this.provider.getAccountByRiotId(parsed.gameName, parsed.tagLine)
    upsertAccount(this.db, account, this.platform, this.now())
    return account
  }

  status(): MatchStatus {
    const account = getAccount(this.db)
    if (!account) {
      return { account: null, matches: 0, lastGameCreation: null }
    }
    return {
      account: { gameName: account.gameName, tagLine: account.tagLine },
      matches: countMatches(this.db, account.puuid),
      lastGameCreation: lastGameCreation(this.db, account.puuid),
    }
  }

  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const account = getAccount(this.db)
    if (!account) throw new Error('No account set')

    const queues = options.queues ?? DEFAULT_QUEUES
    const maxNewMatches = options.maxNewMatches ?? DEFAULT_MAX_NEW_MATCHES

    const collected: string[] = []
    for (const queue of queues) {
      const ids = await this.provider.getMatchIds(account.puuid, {
        queue,
        start: 0,
        count: 100,
      })
      collected.push(...ids)
    }

    const ids = [...new Set(collected)].sort((a, b) => numericSuffix(b) - numericSuffix(a))
    const known = knownMatchIds(this.db, ids)
    const skippedExisting = known.size
    const newIds = ids.filter((id) => !known.has(id)).slice(0, maxNewMatches)

    let saved = 0
    let failed = 0
    for (const matchId of newIds) {
      try {
        const match = await this.provider.getMatch(matchId)
        saveMatch(this.db, match, [account.puuid])
        saved += 1
      } catch (error) {
        if (error instanceof RiotApiError && (error.status === 401 || error.status === 403)) {
          throw error
        }
        failed += 1
      }
    }

    return { requested: newIds.length, saved, skippedExisting, failed }
  }
}
