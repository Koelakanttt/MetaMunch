import type { DatabaseSync } from 'node:sqlite'
import type { Item } from '@shared/ddragon'
import { buildItemPool } from '@shared/item-traits'
import type {
  ResearchFilterCounts,
  ResearchFilters,
  ResearchItemSample,
  ResearchLaneSample,
  ResearchRuneSample,
} from '@shared/research'
import { RESEARCH_TIER_BUCKETS } from '@shared/research'
import { wilsonLowerBound } from '@shared/research-stats'

export interface ChampionRoleTotals {
  games: number
  wins: number
}

interface FilterClause {
  sql: string
  params: string[]
}

/**
 * Role and tier conditions of the active research filters.
 * Tier buckets are stored uppercase; a missing bucket counts as `unknown`.
 */
function filterClause(filters: ResearchFilters | undefined, alias = 'r'): FilterClause {
  if (!filters) return { sql: '', params: [] }
  const tiers = [...RESEARCH_TIER_BUCKETS[filters.tier]]
  if (filters.includeUnknownTier) tiers.push('unknown')
  const conditions = [
    `coalesce(${alias}.tier_bucket, 'unknown') IN (${tiers.map(() => '?').join(', ')})`,
  ]
  const params = [...tiers]
  if (!filters.includeInferred) {
    conditions.push(`${alias}.role_source = ?`)
    params.push('riot')
  }
  return { sql: ` AND ${conditions.join(' AND ')}`, params }
}

function scopeClause(
  championKey?: number,
  role?: string,
): { sql: string; params: (string | number)[] } {
  if (championKey === undefined || role === undefined) return { sql: '', params: [] }
  return { sql: ' AND r.champion_id = ? AND r.team_position = ?', params: [championKey, role] }
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
  filters?: ResearchFilters,
): SampleRow[] {
  const filter = filterClause(filters)
  return db
    .prepare(
      `SELECT r.win, r.item0 AS i0, r.item1 AS i1, r.item2 AS i2,
              r.item3 AS i3, r.item4 AS i4, r.item5 AS i5,
              r.keystone, r.primary_style, r.sub_style,
              r.primary_rune_ids, r.secondary_rune_ids, r.stat_shard_ids
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?${filter.sql}`,
    )
    .all(snapshotId, championKey, role, ...filter.params) as unknown as SampleRow[]
}

export function championRoleTotals(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
  filters?: ResearchFilters,
): ChampionRoleTotals {
  const filter = filterClause(filters)
  const row = db
    .prepare(
      `SELECT count(*) AS games, coalesce(sum(r.win), 0) AS wins
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?${filter.sql}`,
    )
    .get(snapshotId, championKey, role, ...filter.params)
  return { games: Number(row?.['games'] ?? 0), wins: Number(row?.['wins'] ?? 0) }
}

export function researchAuditRows(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
): {
  games: number
  matches: number
  tiers: { tier: string; games: number }[]
  roleSources: { source: string; games: number }[]
} {
  const rows = db
    .prepare(
      `SELECT coalesce(r.tier_bucket, 'unknown') AS tier,
              coalesce(r.role_source, 'unknown') AS role_source,
              count(*) AS games,
              count(DISTINCT r.match_id) AS matches
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?
       GROUP BY tier, role_source`,
    )
    .all(snapshotId, championKey, role)
  let games = 0
  let matches = 0
  const byTier = new Map<string, number>()
  const bySource = new Map<string, number>()
  for (const row of rows) {
    const rowGames = Number(row['games'])
    games += rowGames
    matches = Math.max(matches, Number(row['matches']))
    const tier = String(row['tier'])
    const source = String(row['role_source'])
    byTier.set(tier, (byTier.get(tier) ?? 0) + rowGames)
    bySource.set(source, (bySource.get(source) ?? 0) + rowGames)
  }
  const matchRow = db
    .prepare(
      `SELECT count(DISTINCT r.match_id) AS matches
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?`,
    )
    .get(snapshotId, championKey, role)
  matches = Number(matchRow?.['matches'] ?? matches)
  return {
    games,
    matches,
    tiers: [...byTier].map(([tier, count]) => ({ tier, games: count })).sort((a, b) => b.games - a.games),
    roleSources: [...bySource]
      .map(([source, count]) => ({ source, games: count }))
      .sort((a, b) => b.games - a.games),
  }
}

/** Per final slot, item inclusion and win rate among champion-role games. */
/** Maps every accepted item id to the lowest-id variant with the same name. */
function canonicalItems(
  items: readonly Item[],
  includeBoots: boolean,
): Map<number, number> {
  const pool = buildItemPool(items)
  const byName = new Map<string, number>()
  const boots = includeBoots
    ? items.filter((item) => item.tags.includes('Boots'))
    : []
  const source = includeBoots ? [...pool.items, ...boots] : pool.items
  for (const item of [...source].sort((a, b) => a.id - b.id)) {
    if (!byName.has(item.name)) byName.set(item.name, item.id)
  }
  const canonical = new Map<number, number>()
  for (const item of source) {
    const id = byName.get(item.name)
    if (id !== undefined) canonical.set(item.id, id)
  }
  return canonical
}

export function itemSlotSamples(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
  items?: readonly Item[],
  filters?: ResearchFilters,
): ResearchItemSample[] {
  const rows = rowsFor(db, snapshotId, championKey, role, filters)
  if (rows.length === 0) return []
  const canonical = items ? canonicalItems(items, false) : null
  const keys = ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'] as const
  const counts = new Map<string, { itemId: number; slot: number; games: number; wins: number }>()
  for (const row of rows) {
    keys.forEach((key, slot) => {
      const rawId = Number(row[key])
      if (rawId <= 0) return
      const itemId = canonical ? canonical.get(rawId) : rawId
      if (canonical && itemId === undefined) return
      if (itemId === undefined) return
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
  items?: readonly Item[],
  filters?: ResearchFilters,
): ResearchItemSample[] {
  const rows = rowsFor(db, snapshotId, championKey, role, filters)
  if (rows.length === 0) return []
  const canonical = items ? canonicalItems(items, true) : null
  const keys = ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'] as const
  const counts = new Map<number, { itemId: number; games: number; wins: number }>()
  for (const row of rows) {
    const seen = new Set<number>()
    for (const key of keys) {
      const rawId = Number(row[key])
      if (rawId <= 0) continue
      const itemId = canonical ? canonical.get(rawId) : rawId
      if (itemId === undefined || seen.has(itemId)) continue
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
  filters?: ResearchFilters,
): ResearchRuneSample[] {
  const rows = rowsFor(db, snapshotId, championKey, role, filters)
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
  filters?: ResearchFilters,
): (Omit<ResearchLaneSample, 'enemyId' | 'enemyName'> & { enemyChampionKey: number })[] {
  const filter = filterClause(filters, 'me')
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
         AND me.team_position = ?${filter.sql}
       GROUP BY enemy.champion_id
       ORDER BY games DESC, enemy.champion_id ASC`,
    )
    .all(snapshotId, championKey, role, ...filter.params)
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

/** Games admitted and excluded by the active filters, for the "N excluded" labels. */
export function researchFilterCounts(
  db: DatabaseSync,
  snapshotId: number,
  filters: ResearchFilters,
  championKey?: number,
  role?: string,
): ResearchFilterCounts {
  const scope = scopeClause(championKey, role)
  const base = `FROM research_rows r
    JOIN research_matches m ON m.match_id = r.match_id
    WHERE m.snapshot_id = ?${scope.sql}`
  const total = db
    .prepare(
      `SELECT count(*) AS games,
              coalesce(sum(CASE WHEN r.role_source IN ('inferred', 'unknown') THEN 1 ELSE 0 END), 0) AS inferred,
              coalesce(sum(CASE WHEN coalesce(r.tier_bucket, 'unknown') = 'unknown' THEN 1 ELSE 0 END), 0) AS unknown_tier
       ${base}`,
    )
    .get(snapshotId, ...scope.params)
  const filter = filterClause(filters)
  const included = db
    .prepare(`SELECT count(*) AS games ${base}${filter.sql}`)
    .get(snapshotId, ...scope.params, ...filter.params)
  return {
    totalGames: Number(total?.['games'] ?? 0),
    includedGames: Number(included?.['games'] ?? 0),
    excludedInferred: Number(total?.['inferred'] ?? 0),
    excludedUnknownTier: Number(total?.['unknown_tier'] ?? 0),
  }
}

/** Champion coverage per role over the filtered sample. */
export function researchCoverageRowsFiltered(
  db: DatabaseSync,
  snapshotId: number,
  filters: ResearchFilters,
  limit = 10000,
): { championKey: number; role: string; games: number; wins: number }[] {
  const filter = filterClause(filters)
  return db
    .prepare(
      `SELECT r.champion_id AS champion_key, r.team_position AS role,
              count(*) AS games, coalesce(sum(r.win), 0) AS wins
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.team_position <> ''${filter.sql}
       GROUP BY r.champion_id, r.team_position
       ORDER BY games DESC, r.champion_id ASC
       LIMIT ?`,
    )
    .all(snapshotId, ...filter.params, limit)
    .map((row) => ({
      championKey: Number(row['champion_key']),
      role: String(row['role']),
      games: Number(row['games']),
      wins: Number(row['wins']),
    }))
}

/** Most-played champions over the filtered sample. */
export function researchChampionRowsFiltered(
  db: DatabaseSync,
  snapshotId: number,
  filters: ResearchFilters,
  limit = 15,
): { championKey: number; games: number; wins: number; bans: number }[] {
  const filter = filterClause(filters)
  const rows = db
    .prepare(
      `SELECT r.champion_id AS champion_key,
              count(*) AS games,
              coalesce(sum(r.win), 0) AS wins,
              coalesce((
                SELECT count(*)
                FROM research_bans b
                JOIN research_matches bm ON bm.match_id = b.match_id
                WHERE bm.snapshot_id = ? AND b.champion_id = r.champion_id
              ), 0) AS bans
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ?${filter.sql}
       GROUP BY r.champion_id
       ORDER BY games DESC, r.champion_id ASC
       LIMIT ?`,
    )
    .all(snapshotId, snapshotId, ...filter.params, limit)
  return rows.map((row) => ({
    championKey: Number(row['champion_key']),
    games: Number(row['games']),
    wins: Number(row['wins']),
    bans: Number(row['bans']),
  }))
}

/** Final items over the filtered sample, deduplicated per game. */
export function researchItemRowsFiltered(
  db: DatabaseSync,
  snapshotId: number,
  filters: ResearchFilters,
  limit = 15,
): { itemId: number; purchases: number; wins: number }[] {
  const filter = filterClause(filters)
  const rows = db
    .prepare(
      `SELECT r.item0 AS i0, r.item1 AS i1, r.item2 AS i2,
              r.item3 AS i3, r.item4 AS i4, r.item5 AS i5, r.win
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ?${filter.sql}`,
    )
    .all(snapshotId, ...filter.params)
  const counts = new Map<number, { purchases: number; wins: number }>()
  for (const row of rows) {
    const win = Number(row['win']) === 1
    const seen = new Set<number>()
    for (const key of ['i0', 'i1', 'i2', 'i3', 'i4', 'i5']) {
      const itemId = Number(row[key] ?? 0)
      if (itemId <= 0 || seen.has(itemId)) continue
      seen.add(itemId)
      const entry = counts.get(itemId) ?? { purchases: 0, wins: 0 }
      entry.purchases += 1
      if (win) entry.wins += 1
      counts.set(itemId, entry)
    }
  }
  return [...counts.entries()]
    .map(([itemId, entry]) => ({ itemId, ...entry }))
    .sort((a, b) => b.purchases - a.purchases || a.itemId - b.itemId)
    .slice(0, limit)
}

export interface ResearchRuneRow {
  keystone: number
  primaryStyle: number
  subStyle: number
  primaryRuneIds: number[]
  secondaryRuneIds: number[]
  statShardIds: number[]
  win: number
}

/** Raw rune rows of one champion-role for the filtered sample, optionally vs one opponent. */
export function researchRuneRows(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
  filters?: ResearchFilters,
  opponentKey?: number | null,
): ResearchRuneRow[] {
  const filter = filterClause(filters)
  const opponentClause =
    opponentKey === undefined || opponentKey === null
      ? ''
      : ` AND EXISTS (
            SELECT 1 FROM research_rows enemy
            WHERE enemy.match_id = r.match_id
              AND enemy.team_id <> r.team_id
              AND enemy.team_position = r.team_position
              AND enemy.champion_id = ?
          )`
  const rows = db
    .prepare(
      `SELECT r.keystone, r.primary_style, r.sub_style,
              r.primary_rune_ids, r.secondary_rune_ids, r.stat_shard_ids, r.win
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?${filter.sql}${opponentClause}`,
    )
    .all(
      snapshotId,
      championKey,
      role,
      ...filter.params,
      ...(opponentKey === undefined || opponentKey === null ? [] : [opponentKey]),
    )
  return rows.map((row) => ({
    keystone: Number(row['keystone'] ?? 0),
    primaryStyle: Number(row['primary_style'] ?? 0),
    subStyle: Number(row['sub_style'] ?? 0),
    primaryRuneIds: numberArray(String(row['primary_rune_ids'] ?? '[]')),
    secondaryRuneIds: numberArray(String(row['secondary_rune_ids'] ?? '[]')),
    statShardIds: numberArray(String(row['stat_shard_ids'] ?? '[]')),
    win: Number(row['win'] ?? 0),
  }))
}
