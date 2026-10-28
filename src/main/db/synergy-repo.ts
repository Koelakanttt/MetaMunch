import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'

export interface SynergyRow {
  championKey: number
  games: number
  wins: number
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

/** Teammate records for one champion from every stored participant. */
export function synergyTotals(
  db: DatabaseSync,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
): SynergyRow[] {
  const sql = `
    SELECT ally.champion_id AS ally_key,
           count(*) AS games,
           coalesce(sum(me.win), 0) AS wins
    FROM participants me
    JOIN matches m ON m.match_id = me.match_id
    JOIN participants ally
      ON ally.match_id = me.match_id
     AND ally.team_id = me.team_id
     AND ally.slot <> me.slot
    WHERE me.champion_id = ?
      AND m.remake = 0
      AND m.queue_id IN (${placeholders(queues.length)})
    GROUP BY ally.champion_id
    ORDER BY games DESC, ally.champion_id ASC`
  const rows = db.prepare(sql).all(championKey, ...queues)
  return rows.map((row) => ({
    championKey: Number(row['ally_key']),
    games: Number(row['games']),
    wins: Number(row['wins']),
  }))
}
