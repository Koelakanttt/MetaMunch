import type { DatabaseSync } from 'node:sqlite'
import type { ResearchFilters } from '@shared/research'
import { RESEARCH_TIER_BUCKETS } from '@shared/research'
import type { ResearchTimelineSample } from '@shared/research-build'

export interface ResearchTimelineRecord extends ResearchTimelineSample {
  statShards: number[]
}

function filterClause(filters: ResearchFilters): { sql: string; params: string[] } {
  const tiers = [...RESEARCH_TIER_BUCKETS[filters.tier]]
  if (filters.includeUnknownTier) tiers.push('unknown')
  const conditions = [`coalesce(t.tier_bucket, 'unknown') IN (${tiers.map(() => '?').join(', ')})`]
  const params = [...tiers]
  if (!filters.includeInferred) {
    conditions.push('t.role_source = ?')
    params.push('riot')
  }
  return { sql: ` AND ${conditions.join(' AND ')}`, params }
}

function numberArray(value: unknown): number[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? '[]'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is number => typeof entry === 'number')
  } catch {
    return []
  }
}

/** Compact timeline rows of one champion-role, optionally only matches against one opponent. */
export function researchTimelineSamples(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
  filters: ResearchFilters,
  opponentKey?: number | null,
): ResearchTimelineRecord[] {
  const filter = filterClause(filters)
  const opponentClause =
    opponentKey === undefined || opponentKey === null
      ? ''
      : ` AND EXISTS (
            SELECT 1 FROM research_rows enemy
            WHERE enemy.match_id = t.match_id
              AND enemy.team_id <> t.team_id
              AND enemy.team_position = t.team_position
              AND enemy.champion_id = ?
          )`
  const rows = db
    .prepare(
      `SELECT t.match_id, t.win, t.purchase_order, t.starting_items,
              t.skill_order, t.summoner_spells, t.stat_shards
       FROM research_timelines t
       JOIN research_matches m ON m.match_id = t.match_id
       WHERE m.snapshot_id = ? AND t.champion_id = ? AND t.team_position = ?${filter.sql}${opponentClause}`,
    )
    .all(
      snapshotId,
      championKey,
      role,
      ...filter.params,
      ...(opponentKey === undefined || opponentKey === null ? [] : [opponentKey]),
    )
  return rows.map((row) => ({
    matchId: String(row['match_id']),
    win: Number(row['win']) === 1,
    purchaseOrder: numberArray(row['purchase_order']),
    startingItems: numberArray(row['starting_items']),
    skillOrder: String(row['skill_order'] ?? ''),
    spells: numberArray(row['summoner_spells']),
    statShards: numberArray(row['stat_shards']),
  }))
}
