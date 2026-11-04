import type { DatabaseSync } from 'node:sqlite'
import type { Champion, Item } from '@shared/ddragon'
import {
  REVIEW_CHECKLIST_KEYS,
  type MatchReview,
  type MatchReviewHeader,
  type MatchReviewInput,
  type MatchReviewView,
  type ReviewChecklist,
} from '@shared/review'
import { getReview, latestUnreviewedMatch, reviewMatchRow, saveReview } from '../db/review-repo'
import type { StaticDataSource } from './recommendation-service'
import type { TimelineSummaryService } from './timeline-summary-service'
import type { TrackedAccount } from './personal-stats-service'

export interface MatchReviewDeps {
  db: DatabaseSync
  source: StaticDataSource
  timelineSummary: TimelineSummaryService
  getAccount: () => TrackedAccount | null
  now?: () => number
}

export class MatchReviewService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly timelineSummary: TimelineSummaryService
  private readonly getAccount: () => TrackedAccount | null
  private readonly now: () => number

  constructor(deps: MatchReviewDeps) {
    this.db = deps.db
    this.source = deps.source
    this.timelineSummary = deps.timelineSummary
    this.getAccount = deps.getAccount
    this.now = deps.now ?? Date.now
  }

  get(matchId: string): MatchReviewView | null {
    const account = this.getAccount()
    if (!account) return null
    const row = reviewMatchRow(this.db, matchId, account.puuid)
    if (!row) return null
    const version = this.source.latestVersion()
    const champions: readonly Champion[] = version === null ? [] : this.source.champions(version)
    const items: readonly Item[] = version === null ? [] : this.source.items(version)
    const champion = champions.find((entry) => entry.key === row.championKey)
    const itemNames = new Map(items.map((item) => [item.id, item.name]))
    const header: MatchReviewHeader = {
      matchId: row.matchId,
      championId: champion?.id ?? null,
      championName: champion?.name ?? null,
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
    return {
      match: header,
      timeline: this.timelineSummary.view(matchId),
      review: getReview(this.db, matchId),
    }
  }

  save(matchId: string, input: MatchReviewInput): MatchReview | null {
    const account = this.getAccount()
    if (!account) return null
    const row = reviewMatchRow(this.db, matchId, account.puuid)
    if (!row) return null
    const fixText = input.fixText.trim().slice(0, 500)
    const checklist: ReviewChecklist = {
      died_too_much: false,
      missed_cs: false,
      bad_recall: false,
      lost_vision: false,
      poor_teamfight: false,
    }
    for (const key of REVIEW_CHECKLIST_KEYS) {
      checklist[key] = input.checklist[key] === true
    }
    const tags = [
      ...new Set(
        input.tags
          .map((tag) => tag.trim().slice(0, 24))
          .filter((tag) => tag.length > 0),
      ),
    ].slice(0, 8)
    const existing = getReview(this.db, matchId)
    const now = this.now()
    return saveReview(this.db, {
      matchId,
      fixText,
      checklist,
      tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  pending(): MatchReviewView | null {
    const account = this.getAccount()
    if (!account) return null
    const matchId = latestUnreviewedMatch(this.db, account.puuid)
    return matchId ? this.get(matchId) : null
  }
}
