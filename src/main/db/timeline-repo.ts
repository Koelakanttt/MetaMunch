import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'
import type { Match } from '@shared/riot'
import type { TimelineEvent } from '@shared/timeline'

const STORED_TYPES = new Set(['ITEM_PURCHASED', 'SKILL_LEVEL_UP'])

export interface PurchaseOrderRow {
  itemId: number
  games: number
  averageMs: number
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

/** Replaces the stored timeline events for one match. Only tracked players are stored. */
export function saveTimelineEvents(
  db: DatabaseSync,
  matchId: string,
  events: readonly TimelineEvent[],
  participantPuuids: ReadonlyMap<number, string>,
  trackedPuuids: ReadonlySet<string>,
): void {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM timeline_events WHERE match_id = ?').run(matchId)
    const insert = db.prepare(
      `INSERT INTO timeline_events
        (match_id, puuid, type, timestamp_ms, item_id, skill_slot, level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const event of events) {
      if (!STORED_TYPES.has(event.type)) continue
      const puuid = participantPuuids.get(event.participantId)
      if (!puuid || !trackedPuuids.has(puuid)) continue
      insert.run(
        matchId,
        puuid,
        event.type,
        event.timestamp,
        event.itemId,
        event.skillSlot,
        event.level,
      )
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function saveTimelineForMatch(
  db: DatabaseSync,
  match: Match,
  events: readonly TimelineEvent[],
  trackedPuuids: readonly string[],
): void {
  const participants = new Map(
    match.participants.map((participant) => [participant.participantId, participant.puuid]),
  )
  saveTimelineEvents(db, match.id, events, participants, new Set(trackedPuuids))
}

export function participantPuuidMap(db: DatabaseSync, matchId: string): Map<number, string> {
  const rows = db
    .prepare(
      `SELECT CASE
                WHEN participant_id IS NULL OR participant_id = 0 THEN slot + 1
                ELSE participant_id
              END AS participant_id,
              puuid
       FROM participants
       WHERE match_id = ? AND puuid IS NOT NULL`,
    )
    .all(matchId)
  const map = new Map<number, string>()
  for (const row of rows) {
    map.set(Number(row['participant_id']), String(row['puuid']))
  }
  return map
}

export function matchesWithoutTimelines(
  db: DatabaseSync,
  puuid: string,
  limit: number,
): string[] {
  const rows = db
    .prepare(
      `SELECT m.match_id
       FROM matches m JOIN participants p ON p.match_id = m.match_id
       WHERE p.puuid = ?
         AND m.remake = 0
         AND NOT EXISTS (
           SELECT 1 FROM timeline_events t WHERE t.match_id = m.match_id AND t.puuid = p.puuid
         )
       ORDER BY m.game_creation DESC
       LIMIT ?`,
    )
    .all(puuid, limit)
  return rows.map((row) => String(row['match_id']))
}

export function purchaseOrderForChampion(
  db: DatabaseSync,
  puuid: string,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
  limit = 8,
): PurchaseOrderRow[] {
  const rows = db
    .prepare(
      `SELECT item_id, count(*) AS games, avg(first_ms) AS average_ms
       FROM (
         SELECT t.match_id, t.item_id, min(t.timestamp_ms) AS first_ms
         FROM timeline_events t
         JOIN matches m ON m.match_id = t.match_id
         JOIN participants p ON p.match_id = t.match_id AND p.puuid = t.puuid
         WHERE t.puuid = ?
           AND t.type = 'ITEM_PURCHASED'
           AND p.champion_id = ?
           AND m.remake = 0
           AND m.queue_id IN (${placeholders(queues.length)})
         GROUP BY t.match_id, t.item_id
       )
       GROUP BY item_id
       ORDER BY games DESC, item_id ASC
       LIMIT ?`,
    )
    .all(puuid, championKey, ...queues, limit)
  return rows.map((row) => ({
    itemId: Number(row['item_id']),
    games: Number(row['games']),
    averageMs: Number(row['average_ms']),
  }))
}

export function timelineMatchCount(
  db: DatabaseSync,
  puuid: string,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
): number {
  const row = db
    .prepare(
      `SELECT count(DISTINCT t.match_id) AS matches
       FROM timeline_events t
       JOIN matches m ON m.match_id = t.match_id
       JOIN participants p ON p.match_id = t.match_id AND p.puuid = t.puuid
       WHERE t.puuid = ?
         AND p.champion_id = ?
         AND m.remake = 0
         AND m.queue_id IN (${placeholders(queues.length)})`,
    )
    .get(puuid, championKey, ...queues)
  return Number(row?.['matches'] ?? 0)
}

export interface PurchaseEventRow {
  matchId: string
  win: boolean
  itemId: number
  timestampMs: number
}

/** Purchase events for one champion, ordered for sequence reconstruction. */
export function purchaseEventsForChampion(
  db: DatabaseSync,
  puuid: string,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
): PurchaseEventRow[] {
  const rows = db
    .prepare(
      `SELECT t.match_id, t.item_id, t.timestamp_ms, p.win
       FROM timeline_events t
       JOIN matches m ON m.match_id = t.match_id
       JOIN participants p ON p.match_id = t.match_id AND p.puuid = t.puuid
       WHERE t.puuid = ?
         AND t.type = 'ITEM_PURCHASED'
         AND t.item_id IS NOT NULL
         AND p.champion_id = ?
         AND m.remake = 0
         AND m.queue_id IN (${placeholders(queues.length)})
       ORDER BY t.match_id, t.timestamp_ms`,
    )
    .all(puuid, championKey, ...queues)
  return rows.map((row) => ({
    matchId: String(row['match_id']),
    win: Number(row['win']) === 1,
    itemId: Number(row['item_id']),
    timestampMs: Number(row['timestamp_ms']),
  }))
}

export interface SkillEventRow {
  matchId: string
  win: boolean
  skillSlot: number
  timestampMs: number
}

export interface MatchTimelineRow {
  type: string
  timestampMs: number
  itemId: number | null
  skillSlot: number | null
  level: number | null
}

export function matchHasPlayer(db: DatabaseSync, matchId: string, puuid: string): boolean {
  const row = db
    .prepare('SELECT 1 AS present FROM participants WHERE match_id = ? AND puuid = ? LIMIT 1')
    .get(matchId, puuid)
  return row !== undefined
}

export function matchTimelineEvents(
  db: DatabaseSync,
  matchId: string,
  puuid: string,
): MatchTimelineRow[] {
  const rows = db
    .prepare(
      `SELECT type, timestamp_ms, item_id, skill_slot, level
       FROM timeline_events
       WHERE match_id = ? AND puuid = ?
       ORDER BY timestamp_ms`,
    )
    .all(matchId, puuid)
  return rows.map((row) => ({
    type: String(row['type']),
    timestampMs: Number(row['timestamp_ms']),
    itemId: row['item_id'] === null ? null : Number(row['item_id']),
    skillSlot: row['skill_slot'] === null ? null : Number(row['skill_slot']),
    level: row['level'] === null ? null : Number(row['level']),
  }))
}

/** Skill level-up events for one champion, ordered for sequence reconstruction. */
export function skillEventsForChampion(
  db: DatabaseSync,
  puuid: string,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
): SkillEventRow[] {
  const rows = db
    .prepare(
      `SELECT t.match_id, t.skill_slot, t.timestamp_ms, p.win
       FROM timeline_events t
       JOIN matches m ON m.match_id = t.match_id
       JOIN participants p ON p.match_id = t.match_id AND p.puuid = t.puuid
       WHERE t.puuid = ?
         AND t.type = 'SKILL_LEVEL_UP'
         AND t.skill_slot IS NOT NULL
         AND p.champion_id = ?
         AND m.remake = 0
         AND m.queue_id IN (${placeholders(queues.length)})
       ORDER BY t.match_id, t.timestamp_ms`,
    )
    .all(puuid, championKey, ...queues)
  return rows.map((row) => ({
    matchId: String(row['match_id']),
    win: Number(row['win']) === 1,
    skillSlot: Number(row['skill_slot']),
    timestampMs: Number(row['timestamp_ms']),
  }))
}
