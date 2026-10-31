import type { DatabaseSync } from 'node:sqlite'
import type {
  ResearchItemSample,
  ResearchLaneSample,
  ResearchRuneSample,
} from '@shared/research'
import { wilsonLowerBound } from '@shared/research-stats'

export interface ChampionRoleTotals {
  games: number
  wins: number
}

interface SampleRow {
  win: number
  i0: number
  i1: number
  i2: number
  i3: number
  i4: number
  i5: number
  keystone: number | null
  primary_style: number | null
  sub_style: number | null
  primary_rune_ids: string
  secondary_rune_ids: string
  stat_shard_ids: string
}

function rowsFor(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): SampleRow[] {
  return db
    .prepare(
      `SELECT r.win, r.item0 AS i0, r.item1 AS i1, r.item2 AS i2,
              r.item3 AS i3, r.item4 AS i4, r.item5 AS i5,
              r.keystone, r.primary_style, r.sub_style,
              r.primary_rune_ids, r.secondary_rune_ids, r.stat_shard_ids
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?`,
    )
    .all(snapshotId, championKey, role) as unknown as SampleRow[]
}

export function championRoleTotals(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): ChampionRoleTotals {
  const row = db
    .prepare(
      `SELECT count(*) AS games, coalesce(sum(r.win), 0) AS wins
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?`,
    )
    .get(snapshotId, championKey, role)
  return { games: Number(row?.['games'] ?? 0), wins: Number(row?.['wins'] ?? 0) }
}

/** Per final slot, item inclusion and win rate among champion-role games. */
export function itemSlotSamples(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): ResearchItemSample[] {
  const rows = rowsFor(db, snapshotId, championKey, role)
  if (rows.length === 0) return []
  const keys = ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'] as const
  const counts = new Map<string, { itemId: number; slot: number; games: number; wins: number }>()
  for (const row of rows) {
    keys.forEach((key, slot) => {
      const itemId = Number(row[key])
      if (itemId <= 0) return
      const countKey = `${slot}:${itemId}`
      const entry = counts.get(countKey) ?? { itemId, slot, games: 0, wins: 0 }
      entry.games += 1
      if (Number(row.win) === 1) entry.wins += 1
      counts.set(countKey, entry)
    })
  }
  return [...counts.values()]
    .map((entry) => ({
      itemId: entry.itemId,
      slot: entry.slot,
      games: entry.games,
      wins: entry.wins,
      winRate: entry.games === 0 ? 0 : entry.wins / entry.games,
      pickRate: entry.games / rows.length,
    }))
    .sort(
      (a, b) =>
        a.slot - b.slot ||
        b.pickRate - a.pickRate ||
        wilsonLowerBound(b.wins, b.games) - wilsonLowerBound(a.wins, a.games) ||
        a.itemId - b.itemId,
    )
}

/** Item inclusion across all six final slots, deduplicated per game. */
export function itemSamples(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): ResearchItemSample[] {
  const rows = rowsFor(db, snapshotId, championKey, role)
  if (rows.length === 0) return []
  const keys = ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'] as const
  const counts = new Map<number, { itemId: number; games: number; wins: number }>()
  for (const row of rows) {
    const seen = new Set<number>()
    for (const key of keys) {
      const itemId = Number(row[key])
      if (itemId <= 0 || seen.has(itemId)) continue
      seen.add(itemId)
      const entry = counts.get(itemId) ?? { itemId, games: 0, wins: 0 }
      entry.games += 1
      if (Number(row.win) === 1) entry.wins += 1
      counts.set(itemId, entry)
    }
  }
  return [...counts.values()]
    .map((entry) => ({
      itemId: entry.itemId,
      slot: -1,
      games: entry.games,
      wins: entry.wins,
      winRate: entry.games === 0 ? 0 : entry.wins / entry.games,
      pickRate: entry.games / rows.length,
    }))
    .sort(
      (a, b) =>
        b.pickRate - a.pickRate ||
        wilsonLowerBound(b.wins, b.games) - wilsonLowerBound(a.wins, a.games) ||
        a.itemId - b.itemId,
    )
}

function numberArray(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is number => typeof entry === 'number')
  } catch {
    return []
  }
}

export function runeSamples(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): ResearchRuneSample[] {
  const rows = rowsFor(db, snapshotId, championKey, role)
  if (rows.length === 0) return []
  const counts = new Map<
    string,
    {
      keystone: number
      primaryStyle: number
      subStyle: number
      runeIds: number[]
      statShardIds: number[]
      games: number
      wins: number
    }
  >()
  for (const row of rows) {
    const keystone = Number(row.keystone ?? 0)
    const primaryStyle = Number(row.primary_style ?? 0)
    const subStyle = Number(row.sub_style ?? 0)
    if (keystone <= 0 || primaryStyle <= 0 || subStyle <= 0) continue
    const runeIds = [
      ...numberArray(row.primary_rune_ids),
      ...numberArray(row.secondary_rune_ids),
    ]
    const statShardIds = numberArray(row.stat_shard_ids)
    const key = `${keystone}:${primaryStyle}:${subStyle}:${runeIds.join(',')}:${statShardIds.join(',')}`
    const entry = counts.get(key) ?? {
      keystone,
      primaryStyle,
      subStyle,
      runeIds,
      statShardIds,
      games: 0,
      wins: 0,
    }
    entry.games += 1
    if (Number(row.win) === 1) entry.wins += 1
    counts.set(key, entry)
  }
  return [...counts.values()]
    .map((entry) => ({
      ...entry,
      winRate: entry.games === 0 ? 0 : entry.wins / entry.games,
      pickRate: entry.games / rows.length,
    }))
    .sort(
      (a, b) =>
        b.pickRate - a.pickRate ||
        wilsonLowerBound(b.wins, b.games) - wilsonLowerBound(a.wins, a.games) ||
        a.keystone - b.keystone,
    )
}

/** Same-position opponents only. No player identifiers are selected. */
export function laneSamples(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): (Omit<ResearchLaneSample, 'enemyId' | 'enemyName'> & { enemyChampionKey: number })[] {
  return db
    .prepare(
      `SELECT enemy.champion_id AS enemy_key,
              count(*) AS games,
              coalesce(sum(me.win), 0) AS wins
       FROM research_rows me
       JOIN research_matches m ON m.match_id = me.match_id
       JOIN research_rows enemy
         ON enemy.match_id = me.match_id
        AND enemy.team_id <> me.team_id
        AND enemy.team_position = me.team_position
       WHERE m.snapshot_id = ?
         AND me.champion_id = ?
         AND me.team_position = ?
       GROUP BY enemy.champion_id
       ORDER BY games DESC, enemy.champion_id ASC`,
    )
    .all(snapshotId, championKey, role)
    .map((row) => {
      const games = Number(row['games'])
      const wins = Number(row['wins'])
      return {
        enemyChampionKey: Number(row['enemy_key']),
        games,
        wins,
        winRate: games === 0 ? 0 : wins / games,
      }
    })
}
