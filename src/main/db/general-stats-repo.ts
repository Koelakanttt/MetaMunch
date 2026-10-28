import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'

export interface SampleRow {
  matchId: string
  patch: string
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

/** All participants of the stored matches, for the own-sample general statistics. */
export function sampleRows(
  db: DatabaseSync,
  filters: { patch?: string; queue?: number } = {},
  queues: readonly number[] = PERSONAL_QUEUES,
): SampleRow[] {
  const clauses = ['m.remake = 0', `m.queue_id IN (${placeholders(queues.length)})`]
  const params: (string | number)[] = [...queues]
  if (filters.patch) {
    clauses.push('m.patch = ?')
    params.push(filters.patch)
  }
  if (filters.queue !== undefined) {
    clauses.push('m.queue_id = ?')
    params.push(filters.queue)
  }

  const sql = `
    SELECT m.match_id, m.patch, p.champion_id, p.position, p.win, p.items
    FROM participants p JOIN matches m ON m.match_id = p.match_id
    WHERE ${clauses.join(' AND ')}`
  const rows = db.prepare(sql).all(...params)
  return rows.map((row) => ({
    matchId: String(row['match_id']),
    patch: String(row['patch']),
    championKey: Number(row['champion_id']),
    position: String(row['position']),
    win: Number(row['win']) === 1,
    items: parseItems(row['items']),
  }))
}

/** Distinct patches of the stored matches, without ordering guarantees. */
export function samplePatches(
  db: DatabaseSync,
  queues: readonly number[] = PERSONAL_QUEUES,
): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT patch FROM matches
       WHERE remake = 0 AND queue_id IN (${placeholders(queues.length)})`,
    )
    .all(...queues)
  return rows.map((row) => String(row['patch']))
}
