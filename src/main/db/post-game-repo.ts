import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'

export interface LatestMatchRow {
  matchId: string
  queueId: number
  patch: string
  gameCreation: number
  durationSec: number
  championKey: number
  position: string
  teamId: number
  win: boolean
  items: number[]
}

export interface MatchParticipantRow {
  championKey: number
  teamId: number
  position: string
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

function parseItems(text: unknown): number[] {
  try {
    const value: unknown = JSON.parse(String(text))
    return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
  } catch {
    return []
  }
}

/** The most recent stored match of the tracked account. */
export function latestMatchForPlayer(
  db: DatabaseSync,
  puuid: string,
  queues: readonly number[] = PERSONAL_QUEUES,
): LatestMatchRow | null {
  const row = db
    .prepare(
      `SELECT m.match_id, m.queue_id, m.patch, m.game_creation, m.duration_s,
              p.champion_id, p.position, p.team_id, p.win, p.items
       FROM participants p JOIN matches m ON m.match_id = p.match_id
       WHERE p.puuid = ? AND m.remake = 0 AND m.queue_id IN (${placeholders(queues.length)})
       ORDER BY m.game_creation DESC, m.match_id DESC
       LIMIT 1`,
    )
    .get(puuid, ...queues)
  if (!row) return null
  return {
    matchId: String(row['match_id']),
    queueId: Number(row['queue_id']),
    patch: String(row['patch']),
    gameCreation: Number(row['game_creation']),
    durationSec: Number(row['duration_s']),
    championKey: Number(row['champion_id']),
    position: String(row['position']),
    teamId: Number(row['team_id']),
    win: Number(row['win']) === 1,
    items: parseItems(row['items']),
  }
}

export function matchParticipants(db: DatabaseSync, matchId: string): MatchParticipantRow[] {
  const rows = db
    .prepare('SELECT champion_id, team_id, position FROM participants WHERE match_id = ?')
    .all(matchId)
  return rows.map((row) => ({
    championKey: Number(row['champion_id']),
    teamId: Number(row['team_id']),
    position: String(row['position']),
  }))
}
