import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'

export interface MatchupRow {
  championKey: number
  games: number
  wins: number
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

/**
 * Lane matchups for one champion from every stored participant (same position, opposite team).
 * Only games with a known position are counted.
 */
export function matchupTotals(
  db: DatabaseSync,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
): MatchupRow[] {
  const sql = `
    SELECT opp.champion_id AS enemy_key,
           count(*) AS games,
           coalesce(sum(me.win), 0) AS wins
    FROM participants me
    JOIN matches m ON m.match_id = me.match_id
    JOIN participants opp
      ON opp.match_id = me.match_id
     AND opp.team_id <> me.team_id
     AND opp.position = me.position
    WHERE me.champion_id = ?
      AND me.position <> ''
      AND m.remake = 0
      AND m.queue_id IN (${placeholders(queues.length)})
    GROUP BY opp.champion_id
    ORDER BY games DESC, opp.champion_id ASC`
  const rows = db.prepare(sql).all(championKey, ...queues)
  return rows.map((row) => ({
    championKey: Number(row['enemy_key']),
    games: Number(row['games']),
    wins: Number(row['wins']),
  }))
}
