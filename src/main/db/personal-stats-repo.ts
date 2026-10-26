import type { DatabaseSync } from 'node:sqlite'
import { PERSONAL_QUEUES, type MyGame } from '@shared/personal'

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

function parseItems(text: unknown): number[] {
  try {
    const value: unknown = JSON.parse(String(text))
    return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : []
  } catch {
    return []
  }
}

/** My games on one champion (by Data Dragon numeric key), newest first, remakes excluded. */
export function listMyGames(
  db: DatabaseSync,
  puuid: string,
  championKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
): MyGame[] {
  const sql = `
    SELECT p.match_id, p.team_id, p.win, p.items, m.patch, m.game_creation
    FROM participants p JOIN matches m ON m.match_id = p.match_id
    WHERE p.puuid = ? AND p.champion_id = ? AND m.remake = 0 AND m.queue_id IN (${placeholders(queues.length)})
    ORDER BY m.game_creation DESC, p.match_id DESC`
  const rows = db.prepare(sql).all(puuid, championKey, ...queues)
  return rows.map((r) => ({
    matchId: String(r['match_id']),
    teamId: Number(r['team_id']),
    win: Number(r['win']) === 1,
    items: parseItems(r['items']),
    patch: String(r['patch']),
    gameCreation: Number(r['game_creation']),
  }))
}

/** Record of my champion against one enemy champion (the enemy was on the other team, any position). */
export function matchupRecord(
  db: DatabaseSync,
  puuid: string,
  myChampionKey: number,
  enemyChampionKey: number,
  queues: readonly number[] = PERSONAL_QUEUES,
): { games: number; wins: number } {
  const sql = `
    SELECT count(*) AS games, coalesce(sum(p.win), 0) AS wins
    FROM participants p
    JOIN participants e ON e.match_id = p.match_id AND e.team_id <> p.team_id
    JOIN matches m ON m.match_id = p.match_id
    WHERE p.puuid = ? AND p.champion_id = ? AND e.champion_id = ? AND m.remake = 0
      AND m.queue_id IN (${placeholders(queues.length)})`
  const row = db.prepare(sql).get(puuid, myChampionKey, enemyChampionKey, ...queues)
  return { games: Number(row?.['games'] ?? 0), wins: Number(row?.['wins'] ?? 0) }
}
