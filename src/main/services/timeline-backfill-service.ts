import type { DatabaseSync } from 'node:sqlite'
import type { TimelineBackfillResult } from '@shared/timeline'
import {
  matchesWithoutTimelines,
  participantPuuidMap,
  saveTimelineEvents,
} from '../db/timeline-repo'
import type { RiotApiProvider } from '../providers/riot-api'
import { isRiotCircuitOpen } from '../providers/riot-request-manager'
import type { TrackedAccount } from './personal-stats-service'

export interface TimelineBackfillDeps {
  db: DatabaseSync
  provider: RiotApiProvider
  getAccount: () => TrackedAccount | null
}

/** Fetches timelines for recent stored matches that do not have one yet. */
export class TimelineBackfillService {
  private readonly db: DatabaseSync
  private readonly provider: RiotApiProvider
  private readonly getAccount: () => TrackedAccount | null

  constructor(deps: TimelineBackfillDeps) {
    this.db = deps.db
    this.provider = deps.provider
    this.getAccount = deps.getAccount
  }

  async run(limit = 10): Promise<TimelineBackfillResult> {
    const account = this.getAccount()
    if (!account) throw new Error('No account set')
    const getTimeline = this.provider.getTimeline?.bind(this.provider)
    if (!getTimeline) throw new Error('Timeline API is not available')

    const ids = matchesWithoutTimelines(this.db, account.puuid, limit)
    let saved = 0
    let failed = 0

    for (const matchId of ids) {
      try {
        const events = await getTimeline(matchId)
        const participants = participantPuuidMap(this.db, matchId)
        saveTimelineEvents(this.db, matchId, events, participants, new Set([account.puuid]))
        saved += 1
      } catch (error) {
        if (isRiotCircuitOpen(error)) throw error
        failed += 1
      }
    }

    return { requested: ids.length, saved, failed }
  }
}
