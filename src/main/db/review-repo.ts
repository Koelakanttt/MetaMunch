import type { DatabaseSync } from 'node:sqlite'
import type { MatchReview, ReviewChecklist } from '@shared/review'

interface ReviewRow {
  match_id: string
  fix_text: string
  checklist_json: string
  tags_json: string
  created_at: number
  updated_at: number
}

export interface ReviewMatchRow {
  matchId: string
  championKey: number
  position: string
  win: boolean
  queueId: number
  patch: string
  gameCreation: number
  durationSec: number
  items: number[]
}

export function getReview(db: DatabaseSync, matchId: string): MatchReview | null {
  const row = db.prepare('SELECT * FROM match_reviews WHERE match_id = ?').get(matchId) as
    | ReviewRow
    | undefined
  return row ? mapReview(row) : null
}

export function saveReview(db: DatabaseSync, review: MatchReview): MatchReview {
  db.prepare(
    `INSERT INTO match_reviews
      (match_id, fix_text, checklist_json, tags_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id) DO UPDATE SET
       fix_text = excluded.fix_text,
       checklist_json = excluded.checklist_json,
       tags_json = excluded.tags_json,
       updated_at = excluded.updated_at`,
  ).run(
    review.matchId,
    review.fixText,
    JSON.stringify(review.checklist),
    JSON.stringify(review.tags),
    review.createdAt,
    review.updatedAt,
  )
  return review
}

export function latestUnreviewedMatch(db: DatabaseSync, puuid: string): string | null {
  const row = db
    .prepare(
      `SELECT m.match_id
       FROM matches m
       JOIN participants p ON p.match_id = m.match_id AND p.puuid = ?
       LEFT JOIN match_reviews r ON r.match_id = m.match_id
       WHERE r.match_id IS NULL AND m.remake = 0
       ORDER BY m.game_creation DESC
       LIMIT 1`,
    )
    .get(puuid)
  return row === undefined ? null : String(row['match_id'])
}

export function latestPersonalMatchId(db: DatabaseSync, puuid: string): string | null {
  const row = db
    .prepare(
      `SELECT m.match_id
       FROM matches m
       JOIN participants p ON p.match_id = m.match_id AND p.puuid = ?
       WHERE m.remake = 0
       ORDER BY m.game_creation DESC
       LIMIT 1`,
    )
    .get(puuid)
  return row === undefined ? null : String(row['match_id'])
}

export function reviewMatchRow(
  db: DatabaseSync,
  matchId: string,
  puuid: string,
): ReviewMatchRow | null {
  const row = db
    .prepare(
      `SELECT m.match_id, m.queue_id, m.patch, m.game_creation, m.duration_s,
              p.champion_id, p.position, p.win, p.items
       FROM matches m
       JOIN participants p ON p.match_id = m.match_id AND p.puuid = ?
       WHERE m.match_id = ?`,
    )
    .get(puuid, matchId) as Record<string, unknown> | undefined
  if (!row) return null
  let items: number[] = []
  try {
    const parsed: unknown = JSON.parse(String(row['items'] ?? '[]'))
    if (Array.isArray(parsed)) items = parsed.filter((id): id is number => typeof id === 'number')
  } catch {
    items = []
  }
  return {
    matchId: String(row['match_id']),
    championKey: Number(row['champion_id']),
    position: String(row['position'] ?? ''),
    win: Number(row['win']) === 1,
    queueId: Number(row['queue_id']),
    patch: String(row['patch']),
    gameCreation: Number(row['game_creation']),
    durationSec: Number(row['duration_s']),
    items,
  }
}

function mapReview(row: ReviewRow): MatchReview {
  return {
    matchId: row.match_id,
    fixText: row.fix_text,
    checklist: parseChecklist(row.checklist_json),
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseChecklist(value: string): ReviewChecklist {
  const checklist: ReviewChecklist = {
    died_too_much: false,
    missed_cs: false,
    bad_recall: false,
    lost_vision: false,
    poor_teamfight: false,
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null) {
      for (const key of Object.keys(checklist) as (keyof ReviewChecklist)[]) {
        const entry = (parsed as Record<string, unknown>)[key]
        if (entry === true) checklist[key] = true
      }
    }
  } catch {
    return checklist
  }
  return checklist
}

function parseTags(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : []
  } catch {
    return []
  }
}
