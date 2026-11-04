import type { DatabaseSync } from 'node:sqlite'
import type { Item } from '@shared/ddragon'
import { parseTimelineSummary, type TimelineSummary } from '@shared/timeline-summary'
import { buildSwingResult, type TimelineReviewView } from '@shared/swing'
import { RiotApiError, type RiotApiProvider } from '../providers/riot-api'
import {
  getTimelineSummary,
  markTimelineUnavailable,
  matchMeta,
  recentPersonalMatchIds,
  saveTimelineSummary,
  summaryParticipants,
} from '../db/timeline-summary-repo'
import { matchHasPlayer } from '../db/timeline-repo'
import type { StaticDataSource } from './recommendation-service'
import type { TrackedAccount } from './personal-stats-service'

export interface TimelineSummaryDeps {
  db: DatabaseSync
  source: StaticDataSource
  provider: () => RiotApiProvider
  getAccount: () => TrackedAccount | null
  now?: () => number
}

export class TimelineSummaryService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly provider: () => RiotApiProvider
  private readonly getAccount: () => TrackedAccount | null
  private readonly now: () => number
  private running = false

  constructor(deps: TimelineSummaryDeps) {
    this.db = deps.db
    this.source = deps.source
    this.provider = deps.provider
    this.getAccount = deps.getAccount
    this.now = deps.now ?? Date.now
  }

  async ensureRecent(limit = 50): Promise<number> {
    if (this.running) return 0
    const account = this.getAccount()
    if (!account) return 0
    const provider = this.provider()
    const getTimelineRaw = provider.getTimelineRaw
    if (!getTimelineRaw) return 0
    this.running = true
    try {
      return await this.collectRecent(account, limit, provider, getTimelineRaw)
    } finally {
      this.running = false
    }
  }

  private async collectRecent(
    account: TrackedAccount,
    limit: number,
    provider: RiotApiProvider,
    getTimelineRaw: NonNullable<RiotApiProvider['getTimelineRaw']>,
  ): Promise<number> {
    const ids = recentPersonalMatchIds(this.db, account.puuid, Math.max(1, Math.min(50, limit)))
    let saved = 0
    for (const matchId of ids) {
      const existing = getTimelineSummary(this.db, matchId)
      if (existing?.state === 'ready') continue
      const meta = matchMeta(this.db, matchId)
      if (!meta) continue
      let raw: unknown
      try {
        raw = await getTimelineRaw.call(provider, matchId)
      } catch (error) {
        if (error instanceof RiotApiError && error.status === 404) {
          markTimelineUnavailable(this.db, matchId, this.now())
        }
        continue
      }
      try {
        const summary = parseTimelineSummary(raw, {
          matchId,
          durationSec: meta.durationSec,
          participants: summaryParticipants(this.db, matchId),
          completedItemIds: this.completedItems(),
        })
        saveTimelineSummary(this.db, summary, 'ready', this.now())
        saved += 1
      } catch {
        markTimelineUnavailable(this.db, matchId, this.now())
      }
    }
    return saved
  }

  view(matchId: string): TimelineReviewView | null {
    const account = this.getAccount()
    if (!account || !matchHasPlayer(this.db, matchId, account.puuid)) return null
    const row = getTimelineSummary(this.db, matchId)
    if (!row || row.state !== 'ready') return null
    let summary: TimelineSummary
    try {
      summary = JSON.parse(row.payloadJson) as TimelineSummary
    } catch {
      return null
    }
    return { summary, ...buildSwingResult(summary) }
  }

  private completedItems(): ReadonlySet<number> {
    const version = this.source.latestVersion()
    const items: readonly Item[] = version === null ? [] : this.source.items(version)
    return new Set(
      items
        .filter(
          (item) =>
            item.goldTotal >= 1000 &&
            item.into.length === 0 &&
            !item.tags.includes('Trinket'),
        )
        .map((item) => item.id),
    )
  }
}
