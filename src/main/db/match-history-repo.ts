import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'

export interface HistoryRow {
  matchId: string
  queueId: number
  patch: string
  gameCreation: number
  durationSec: number
  championKey: number
  position: string
  win: boolean
  items: number[]
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

/** My matches in the personal queues, newest first, remakes excluded. */
export function historyRows(
  db: DatabaseSync,
  puuid: string,
  options: {
    championKey?: number
    position?: string
    patch?: string
    queue?: number
    limit?: number
  } = {},
  queues: readonly number[] = PERSONAL_QUEUES,
): HistoryRow[] {
  const clauses = ['p.puuid = ?', 'm.remake = 0', `m.queue_id IN (${placeholders(queues.length)})`]
  const params: (string | number)[] = [puuid, ...queues]
  if (options.championKey !== undefined) {
    clauses.push('p.champion_id = ?')
    params.push(options.championKey)
  }
  if (options.position) {
    clauses.push('p.position = ?')
    params.push(options.position)
  }
  if (options.patch) {
    clauses.push('m.patch = ?')
    params.push(options.patch)
  }
  if (options.queue !== undefined) {
    clauses.push('m.queue_id = ?')
    params.push(options.queue)
  }
  params.push(options.limit ?? 50)

  const sql = `
    SELECT m.match_id, m.queue_id, m.patch, m.game_creation, m.duration_s,
           p.champion_id, p.position, p.win, p.items
    FROM participants p JOIN matches m ON m.match_id = p.match_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY m.game_creation DESC, p.match_id DESC
    LIMIT ?`
  const rows = db.prepare(sql).all(...params)
  return rows.map((row) => ({
    matchId: String(row['match_id']),
    queueId: Number(row['queue_id']),
    patch: String(row['patch']),
    gameCreation: Number(row['game_creation']),
    durationSec: Number(row['duration_s']),
    championKey: Number(row['champion_id']),
    position: String(row['position']),
    win: Number(row['win']) === 1,
    items: parseItems(row['items']),
  }))
}

/** Distinct patches of my stored matches, without ordering guarantees. */
export function historyPatches(
  db: DatabaseSync,
  puuid: string,
  queues: readonly number[] = PERSONAL_QUEUES,
): string[] {
  const sql = `
    SELECT DISTINCT m.patch
    FROM participants p JOIN matches m ON m.match_id = p.match_id
    WHERE p.puuid = ? AND m.remake = 0 AND m.queue_id IN (${placeholders(queues.length)})`
  const rows = db.prepare(sql).all(puuid, ...queues)
  return rows.map((row) => String(row['patch']))
}
