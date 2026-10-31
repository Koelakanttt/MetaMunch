import type { DatabaseSync } from 'node:sqlite'
import type { RunePageRow } from './rune-repo'

function numberArray(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is number => typeof entry === 'number')
  } catch {
    return []
  }
}

/** Rune pages from the research sample, grouped by full rune + stat-shard signature. */
export function researchRunePageTotals(
  db: DatabaseSync,
  snapshotId: number,
  championKey: number,
  role: string,
  limit = 6,
): RunePageRow[] {
  const rows = db
    .prepare(
      `SELECT r.keystone, r.primary_style, r.sub_style,
              r.primary_rune_ids, r.secondary_rune_ids, r.stat_shard_ids, r.win
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.champion_id = ? AND r.team_position = ?`,
    )
    .all(snapshotId, championKey, role)

  const grouped = new Map<
    string,
    {
      keystone: number
      primaryStyle: number
      subStyle: number
      perks: string
      statPerks: string | null
      games: number
      wins: number
    }
  >()
  for (const row of rows) {
    const keystone = Number(row['keystone'] ?? 0)
    const primaryStyle = Number(row['primary_style'] ?? 0)
    const subStyle = Number(row['sub_style'] ?? 0)
    if (keystone <= 0 || primaryStyle <= 0 || subStyle <= 0) continue
    const primary = numberArray(String(row['primary_rune_ids']))
    const secondary = numberArray(String(row['secondary_rune_ids']))
    const stat = numberArray(String(row['stat_shard_ids']))
    const [offense, flex, defense] = stat
    const perks = JSON.stringify([
      { style: primaryStyle, selections: primary },
      { style: subStyle, selections: secondary },
    ])
    const statPerks =
      offense !== undefined && flex !== undefined && defense !== undefined
        ? JSON.stringify({ offense, flex, defense })
        : null
    const key = `${perks}|${statPerks ?? ''}`
    const entry = grouped.get(key) ?? {
      keystone,
      primaryStyle,
      subStyle,
      perks,
      statPerks,
      games: 0,
      wins: 0,
    }
    entry.games += 1
    if (Number(row['win']) === 1) entry.wins += 1
    grouped.set(key, entry)
  }

  return [...grouped.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.keystone - b.keystone)
    .slice(0, limit)
    .map((entry) => ({
      keystone: entry.keystone,
      primaryStyle: entry.primaryStyle,
      subStyle: entry.subStyle,
      perks: entry.perks,
      statPerks: entry.statPerks,
      games: entry.games,
      wins: entry.wins,
    }))
}
