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

/** My overall record in the personal queues (all champions), remakes excluded. */
export function accountRecord(
  db: DatabaseSync,
  puuid: string,
  queues: readonly number[] = PERSONAL_QUEUES,
): { games: number; wins: number } {
  const sql = `
    SELECT count(*) AS games, coalesce(sum(p.win), 0) AS wins
    FROM participants p JOIN matches m ON m.match_id = p.match_id
    WHERE p.puuid = ? AND m.remake = 0 AND m.queue_id IN (${placeholders(queues.length)})`
  const row = db.prepare(sql).get(puuid, ...queues)
  return { games: Number(row?.['games'] ?? 0), wins: Number(row?.['wins'] ?? 0) }
}

/** Per-champion totals in the personal queues, most played first. */
export function championTotals(
  db: DatabaseSync,
  puuid: string,
  queues: readonly number[] = PERSONAL_QUEUES,
): { championKey: number; games: number; wins: number; lastGameCreation: number }[] {
  const sql = `
    SELECT p.champion_id AS champion_key,
           count(*) AS games,
           coalesce(sum(p.win), 0) AS wins,
           max(m.game_creation) AS last_game
    FROM participants p JOIN matches m ON m.match_id = p.match_id
    WHERE p.puuid = ? AND m.remake = 0 AND m.queue_id IN (${placeholders(queues.length)})
    GROUP BY p.champion_id
    ORDER BY games DESC, p.champion_id ASC`
  const rows = db.prepare(sql).all(puuid, ...queues)
  return rows.map((row) => ({
    championKey: Number(row['champion_key']),
    games: Number(row['games']),
    wins: Number(row['wins']),
    lastGameCreation: Number(row['last_game']),
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
