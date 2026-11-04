import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'

export interface RunePageRow {
  keystone: number
  primaryStyle: number
  subStyle: number
  perks: string | null
  statPerks?: string | null
  games: number
  wins: number
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

/** Most common keystone/tree combinations for one champion from stored participants. */
export function runePageTotals(
  db: DatabaseSync,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
  limit = 6,
  role?: string,
  opponentKey?: number | null,
): RunePageRow[] {
  const roleClause = role ? 'AND p.position = ?' : ''
  const opponentClause =
    opponentKey === undefined || opponentKey === null
      ? ''
      : `AND EXISTS (
           SELECT 1 FROM participants enemy
           WHERE enemy.match_id = p.match_id
             AND enemy.team_id <> p.team_id
             AND enemy.position = p.position
             AND enemy.champion_id = ?
         )`
  const sql = `
    SELECT p.keystone, p.primary_style, p.sub_style, p.perks,
           count(*) AS games,
           coalesce(sum(p.win), 0) AS wins
    FROM participants p JOIN matches m ON m.match_id = p.match_id
    WHERE p.champion_id = ?
      AND p.keystone IS NOT NULL
      AND p.primary_style IS NOT NULL
      AND p.sub_style IS NOT NULL
      AND m.remake = 0
      AND m.queue_id IN (${placeholders(queues.length)})
      ${roleClause}
      ${opponentClause}
    GROUP BY p.perks, p.keystone, p.primary_style, p.sub_style
    ORDER BY games DESC, p.keystone ASC
    LIMIT ?`
  const params: (string | number)[] = [championKey, ...queues]
  if (role) params.push(role)
  if (opponentKey !== undefined && opponentKey !== null) params.push(opponentKey)
  params.push(limit)
  const rows = db.prepare(sql).all(...params)
  return rows.map((row) => ({
    keystone: Number(row['keystone']),
    primaryStyle: Number(row['primary_style']),
    subStyle: Number(row['sub_style']),
    perks: row['perks'] === null || row['perks'] === undefined ? null : String(row['perks']),
    statPerks: null,
    games: Number(row['games']),
    wins: Number(row['wins']),
  }))
}
