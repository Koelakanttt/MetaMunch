import type { DatabaseSync } from 'node:sqlite'
import type { TimelineSummary, TimelineSummaryParticipant } from '@shared/timeline-summary'

export interface StoredTimelineSummary {
  matchId: string
  schemaVersion: number
  sourcePatch: string
  payloadJson: string
  state: 'ready' | 'unavailable'
  fetchedAt: number
}

export interface MatchMeta {
  matchId: string
  patch: string
  durationSec: number
  gameCreation: number
}

export function recentPersonalMatchIds(
  db: DatabaseSync,
  puuid: string,
  limit = 50,
): string[] {
  const rows = db
    .prepare(
      `SELECT m.match_id
       FROM matches m
       JOIN participants p ON p.match_id = m.match_id
       WHERE p.puuid = ? AND m.remake = 0
       ORDER BY m.game_creation DESC
       LIMIT ?`,
    )
    .all(puuid, limit)
  return rows.map((row) => String(row['match_id']))
}

export function matchMeta(db: DatabaseSync, matchId: string): MatchMeta | null {
  const row = db
    .prepare(
      `SELECT match_id, patch, duration_s, game_creation
       FROM matches WHERE match_id = ?`,
    )
    .get(matchId)
  if (!row) return null
  return {
    matchId: String(row['match_id']),
    patch: String(row['patch']),
    durationSec: Number(row['duration_s']),
    gameCreation: Number(row['game_creation']),
  }
}

export function summaryParticipants(
  db: DatabaseSync,
  matchId: string,
): TimelineSummaryParticipant[] {
  const rows = db
    .prepare(
      `SELECT participant_id, team_id, champion_id, position, role_source
       FROM participants WHERE match_id = ? ORDER BY slot`,
    )
    .all(matchId)
  return rows.map((row) => ({
    participantId: Number(row['participant_id']),
    teamId: Number(row['team_id']),
    championId: Number(row['champion_id']),
    role: row['position'] === null || row['position'] === '' ? null : String(row['position']),
    roleSource: String(row['role_source']) as TimelineSummaryParticipant['roleSource'],
  }))
}

export function getTimelineSummary(
  db: DatabaseSync,
  matchId: string,
): StoredTimelineSummary | null {
  const row = db
    .prepare('SELECT * FROM match_timeline_summaries WHERE match_id = ?')
    .get(matchId)
  return row ? mapRow(row) : null
}

export function saveTimelineSummary(
  db: DatabaseSync,
  summary: TimelineSummary,
  state: 'ready' | 'unavailable',
  fetchedAt: number,
): void {
  const meta = matchMeta(db, summary.matchId)
  if (!meta) throw new Error(`Match ${summary.matchId} is not stored`)
  db.prepare(
    `INSERT INTO match_timeline_summaries
      (match_id, schema_version, source_patch, payload_json, state, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id) DO UPDATE SET
       schema_version = excluded.schema_version,
       source_patch = excluded.source_patch,
       payload_json = excluded.payload_json,
       state = excluded.state,
       fetched_at = excluded.fetched_at`,
  ).run(
    summary.matchId,
    summary.version,
    meta.patch,
    JSON.stringify(summary),
    state,
    fetchedAt,
  )
}

export function markTimelineUnavailable(
  db: DatabaseSync,
  matchId: string,
  fetchedAt: number,
): void {
  const meta = matchMeta(db, matchId)
  if (!meta) return
  db.prepare(
    `INSERT INTO match_timeline_summaries
      (match_id, schema_version, source_patch, payload_json, state, fetched_at)
     VALUES (?, 1, ?, '{}', 'unavailable', ?)
     ON CONFLICT(match_id) DO UPDATE SET
       state = 'unavailable', fetched_at = excluded.fetched_at`,
  ).run(matchId, meta.patch, fetchedAt)
}

function mapRow(row: Record<string, unknown>): StoredTimelineSummary {
  const state = String(row['state'])
  return {
    matchId: String(row['match_id']),
    schemaVersion: Number(row['schema_version']),
    sourcePatch: String(row['source_patch']),
    payloadJson: String(row['payload_json']),
    state: state === 'ready' ? 'ready' : 'unavailable',
    fetchedAt: Number(row['fetched_at']),
  }
}
