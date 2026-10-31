import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES } from '@shared/personal'

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

export function listPool(
  db: DatabaseSync,
  puuid: string,
  limit = 8,
  minGames = 3,
): { championKey: number; games: number }[] {
  const rows = db
    .prepare(
      `SELECT p.champion_id AS championKey, count(*) AS games
       FROM participants p JOIN matches m ON m.match_id = p.match_id
       WHERE p.puuid = ? AND m.remake = 0 AND m.queue_id IN (${placeholders(PERSONAL_QUEUES.length)})
       GROUP BY p.champion_id HAVING count(*) >= ?
       ORDER BY games DESC, p.champion_id ASC LIMIT ?`,
    )
    .all(puuid, ...PERSONAL_QUEUES, minGames, limit) as {
    championKey?: unknown
    games?: unknown
  }[]

  return rows.map((row) => ({ championKey: Number(row.championKey), games: Number(row.games) }))
}
