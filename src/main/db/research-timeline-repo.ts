import type { DatabaseSync } from 'node:sqlite'
import { inferRole } from '@shared/role-inference'
import type { Match } from '@shared/riot'
import type { CompactedTimeline } from '@shared/research-timeline'

/**
 * Stores one compact timeline row per participant. No player identifiers are written;
 * participant_id is the match-local slot used only to join events to a champion row.
 */
export function saveResearchTimelines(
  db: DatabaseSync,
  match: Match,
  tierBucket: string | null,
  compacted: ReadonlyMap<number, CompactedTimeline>,
): number {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO research_timelines
      (match_id, participant_id, team_id, champion_id, team_position, role_source,
       tier_bucket, win, patch, purchase_order, starting_items, skill_order,
       summoner_spells, stat_shards)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  let saved = 0
  db.exec('BEGIN')
  try {
    for (const participant of match.participants) {
      const timeline = compacted.get(participant.participantId)
      if (!timeline) continue
      const role = inferRole({
        teamPosition: participant.position,
        individualPosition: participant.individualPosition ?? '',
        summoner1: participant.summoner1,
        summoner2: participant.summoner2,
      })
      const statShards = participant.statPerks
        ? [participant.statPerks.offense, participant.statPerks.flex, participant.statPerks.defense]
        : []
      insert.run(
        match.id,
        participant.participantId,
        participant.teamId,
        participant.championId,
        role.role ?? '',
        role.source,
        tierBucket,
        participant.win ? 1 : 0,
        match.patch,
        JSON.stringify(timeline.purchaseOrder),
        JSON.stringify(timeline.startingItems),
        timeline.skillOrder,
        JSON.stringify([participant.summoner1, participant.summoner2]),
        JSON.stringify(statShards),
      )
      saved += 1
    }
    db.exec('COMMIT')
    return saved
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function researchTimelineCount(db: DatabaseSync, snapshotId: number): number {
  const row = db
    .prepare(
      `SELECT count(*) AS c
       FROM research_timelines t
       JOIN research_matches m ON m.match_id = t.match_id
       WHERE m.snapshot_id = ?`,
    )
    .get(snapshotId)
  return Number(row?.['c'] ?? 0)
}
