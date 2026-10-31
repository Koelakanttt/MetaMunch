import type { DatabaseSync } from 'node:sqlite'

export interface ChampionRoleSample {
  games: number
  wins: number
}

export interface ItemSample {
  itemId: number
  games: number
  wins: number
}

export function championRoleSample(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): ChampionRoleSample {
  const row = db
    .prepare(
      `SELECT count(*) AS games, coalesce(sum(p.win), 0) AS wins
       FROM research_participants p
       JOIN research_matches m ON m.match_id = p.match_id
       WHERE m.snapshot_id = ? AND p.champion_id = ? AND p.team_position = ?`,
    )
    .get(snapshotId, championKey, role)
  return {
    games: Number(row?.['games'] ?? 0),
    wins: Number(row?.['wins'] ?? 0),
  }
}

export function itemSamplesForChampionRole(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
  allowedItemIds: ReadonlySet<number>,
): ItemSample[] {  const rows = db
    .prepare(
      `SELECT p.items, p.win
       FROM research_participants p
       JOIN research_matches m ON m.match_id = p.match_id
       WHERE m.snapshot_id = ? AND p.champion_id = ? AND p.team_position = ?`,
    )
    .all(snapshotId, championKey, role)

  const counts = new Map<number, { games: number; wins: number }>()
  for (const row of rows) {
    let items: unknown
    try {
      items = JSON.parse(String(row['items']))
    } catch {
      continue
    }
    if (!Array.isArray(items)) continue
    const win = Number(row['win']) === 1
    const seen = new Set<number>()
    for (const value of items) {
      if (typeof value !== 'number' || value <= 0) continue
      if (!allowedItemIds.has(value) || seen.has(value)) continue
      seen.add(value)
      const entry = counts.get(value) ?? { games: 0, wins: 0 }
      entry.games += 1
      if (win) entry.wins += 1
      counts.set(value, entry)
    }
  }

  return [...counts.entries()].map(([itemId, entry]) => ({ itemId, ...entry }))
}

export function championMatchupSample(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  enemyKey: number,
  role: string,
): ChampionRoleSample {
  const row = db
    .prepare(
      `SELECT count(*) AS games, coalesce(sum(me.win), 0) AS wins
       FROM research_participants me
       JOIN research_matches m ON m.match_id = me.match_id
       JOIN research_participants enemy
         ON enemy.match_id = me.match_id
        AND enemy.team_id <> me.team_id
        AND enemy.team_position = me.team_position
       WHERE m.snapshot_id = ?
         AND me.champion_id = ?
         AND enemy.champion_id = ?
         AND me.team_position = ?`,
    )
    .get(snapshotId, championKey, enemyKey, role)
  return {
    games: Number(row?.['games'] ?? 0),
    wins: Number(row?.['wins'] ?? 0),
  }
}
