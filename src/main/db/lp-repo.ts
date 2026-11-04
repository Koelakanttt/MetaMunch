import type { DatabaseSync } from 'node:sqlite'

export interface LpSnapshot {
  id: number
  queueType: string
  tier: string
  division: string
  leaguePoints: number
  wins: number
  losses: number
  capturedAt: number
}

export function insertLpSnapshot(
  db: DatabaseSync,
  snapshot: Omit<LpSnapshot, 'id'>,
): LpSnapshot {
  const result = db
    .prepare(
      `INSERT INTO lp_history
        (queue_type, tier, division, league_points, wins, losses, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      snapshot.queueType,
      snapshot.tier,
      snapshot.division,
      snapshot.leaguePoints,
      snapshot.wins,
      snapshot.losses,
      snapshot.capturedAt,
    )
  return { id: Number(result.lastInsertRowid), ...snapshot }
}

export function latestLpSnapshot(db: DatabaseSync): LpSnapshot | null {
  const row = db
    .prepare('SELECT * FROM lp_history ORDER BY captured_at DESC, id DESC LIMIT 1')
    .get()
  return row === undefined ? null : mapRow(row)
}

export function lpHistory(db: DatabaseSync, limit = 500): LpSnapshot[] {
  return db
    .prepare('SELECT * FROM lp_history ORDER BY captured_at DESC, id DESC LIMIT ?')
    .all(limit)
    .map(mapRow)
}

function mapRow(row: Record<string, unknown>): LpSnapshot {
  return {
    id: Number(row['id']),
    queueType: String(row['queue_type']),
    tier: String(row['tier']),
    division: String(row['division']),
    leaguePoints: Number(row['league_points']),
    wins: Number(row['wins']),
    losses: Number(row['losses']),
    capturedAt: Number(row['captured_at']),
  }
}
