import type { DatabaseSync } from 'node:sqlite'
import type {
  MatchTimelinePurchase,
  MatchTimelineResponse,
  MatchTimelineSkill,
} from '@shared/match-timeline'
import { matchHasPlayer, matchTimelineEvents } from '../db/timeline-repo'
import type { StaticDataSource } from './recommendation-service'
import type { TrackedAccount } from './personal-stats-service'

const SLOT_NAMES = ['Q', 'W', 'E', 'R']

function slotName(slot: number | null): string {
  return slot === null ? '?' : (SLOT_NAMES[slot - 1] ?? '?')
}

export interface MatchTimelineDeps {
  db: DatabaseSync
  source: StaticDataSource
  getAccount: () => TrackedAccount | null
}

/** Timeline details for one stored match of the tracked account. */
export class MatchTimelineService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly getAccount: () => TrackedAccount | null

  constructor(deps: MatchTimelineDeps) {
    this.db = deps.db
    this.source = deps.source
    this.getAccount = deps.getAccount
  }

  forMatch(matchId: string): MatchTimelineResponse {
    const account = this.getAccount()
    if (!account) {
      return { matchId, hasTimeline: false, purchases: [], skills: [] }
    }
    if (!matchHasPlayer(this.db, matchId, account.puuid)) {
      throw new Error('Match not found for the tracked account.')
    }

    const version = this.source.latestVersion()
    const itemNames = new Map(
      (version === null ? [] : this.source.items(version)).map((item) => [item.id, item.name]),
    )
    const rows = matchTimelineEvents(this.db, matchId, account.puuid)

    const purchases: MatchTimelinePurchase[] = []
    const skills: MatchTimelineSkill[] = []
    for (const row of rows) {
      if (row.type === 'ITEM_PURCHASED' && row.itemId !== null) {
        const itemId = row.itemId
        purchases.push({
          itemId,
          name: itemNames.get(itemId) ?? `Item ${itemId}`,
          seconds: Math.round(row.timestampMs / 1000),
        })
      } else if (row.type === 'SKILL_LEVEL_UP') {
        skills.push({
          slot: slotName(row.skillSlot),
          level: row.level ?? 0,
          seconds: Math.round(row.timestampMs / 1000),
        })
      }
    }

    return {
      matchId,
      hasTimeline: rows.length > 0,
      purchases,
      skills,
    }
  }
}
