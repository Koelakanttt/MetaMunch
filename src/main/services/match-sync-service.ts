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
import { saveTimelineForMatch } from '../db/timeline-repo'
import type { RiotApiProvider } from '../providers/riot-api'
import { RiotApiError } from '../providers/riot-api'
import { isRiotCircuitOpen } from '../providers/riot-request-manager'

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

const MAX_NEW_MATCHES = 500
const MAX_CANDIDATE_IDS = 1000
const ARAM_QUEUES = new Set([450, 2400])

function numericSuffix(matchId: string): number {
  return Number(matchId.slice(matchId.lastIndexOf('_') + 1))
}

/** Summoner's Rift only; ARAM/Arena/TFT have different maps and would skew stats. */
function supportedMatch(match: { mapId: number; queueId: number; remake: boolean }): boolean {
  const isRift = match.mapId === 11 || match.queueId === 1441
  return isRift && !ARAM_QUEUES.has(match.queueId) && !match.remake
}

export class MatchSyncService {
  private readonly db: DatabaseSync
  private readonly provider: RiotApiProvider
  private readonly platform: string
  private readonly getPlatform: () => string
  private readonly now: () => number

  constructor(deps: {
    db: DatabaseSync
    provider: RiotApiProvider
    platform?: string
    getPlatform?: () => string
    now?: () => number
  }) {
    this.db = deps.db
    this.provider = deps.provider
    this.platform = deps.platform ?? 'EUW1'
    this.getPlatform = deps.getPlatform ?? (() => this.platform)
    this.now = deps.now ?? Date.now
  }

  async setAccount(riotId: string): Promise<RiotAccount> {
    const parsed = parseRiotId(riotId)
    const account = await this.provider.getAccountByRiotId(parsed.gameName, parsed.tagLine)
    upsertAccount(this.db, account, this.getPlatform(), this.now())
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

    const queues = options.queues
    const maxNewMatches = Math.max(1, options.maxNewMatches ?? MAX_NEW_MATCHES)
    const maxCandidateIds = Math.min(
      MAX_CANDIDATE_IDS,
      Math.max(200, maxNewMatches * 2),
    )

    const collected = new Set<string>()
    const collectPage = async (queue?: number): Promise<void> => {
      let start = 0
      while (collected.size < maxCandidateIds) {
        const ids = await this.provider.getMatchIds(account.puuid, {
          ...(queue === undefined ? {} : { queue }),
          start,
          count: 100,
        })
        const before = collected.size
        for (const id of ids) collected.add(id)
        if (ids.length < 100 || collected.size === before) break
        start += 100
      }
    }

    if (queues && queues.length > 0) {
      for (const queue of queues) {
        if (collected.size >= maxCandidateIds) break
        await collectPage(queue)
      }
    } else {
      // No queue filter: Swiftplay/Quickplay and new Rift queues (e.g. 1441)
      // must not be skipped. The match details are filtered by map below.
      await collectPage()
    }

    const ids = [...new Set(collected)].sort((a, b) => numericSuffix(b) - numericSuffix(a))
    const known = knownMatchIds(this.db, ids)
    const skippedExisting = known.size
    const newIds = ids.filter((id) => !known.has(id)).slice(0, maxNewMatches)

    let saved = 0
    let failed = 0
    let lastError: unknown = null
    for (const matchId of newIds) {
      try {
        const match = await this.provider.getMatch(matchId)
        if (!supportedMatch(match)) {
          continue
        }
        saveMatch(this.db, match, [account.puuid])
        try {
          const timeline = await this.provider.getTimeline?.(matchId)
          if (timeline) saveTimelineForMatch(this.db, match, timeline, [account.puuid])
        } catch (error) {
          if (isRiotCircuitOpen(error)) throw error
          // The match is still useful without optional timeline data.
        }
        saved += 1
      } catch (error) {
        if (isRiotCircuitOpen(error)) throw error
        if (error instanceof RiotApiError && (error.status === 401 || error.status === 403)) {
          throw error
        }
        lastError = error
        failed += 1
      }
    }

    if (saved === 0 && failed > 0 && lastError) throw lastError

    return { requested: newIds.length, saved, skippedExisting, failed }
  }
}
