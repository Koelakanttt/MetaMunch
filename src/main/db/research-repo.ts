import type { DatabaseSync } from 'node:sqlite'
import type { Match } from '@shared/riot'
import type {
  ResearchCrawlState,
  ResearchSnapshot,
  ResearchStatus,
} from '@shared/research'

export interface ResearchCrawlRow {
  patch: string | null
  state: ResearchCrawlState
  targetMatches: number
  dailyRequestCap: number
  requestsToday: number
  requestDay: string
  emeraldPlus: boolean
  startedAt: number | null
  updatedAt: number
  lastError: string | null
  seedsExhausted: boolean
}

export function getResearchCrawl(db: DatabaseSync): ResearchCrawlRow {
  const row = db
    .prepare(
      `SELECT patch, status, target_matches, daily_request_cap, requests_today,
              request_day, emerald_plus, started_at, updated_at, last_error, seeds_exhausted
       FROM research_crawl WHERE id = 1`,
    )
    .get()
  if (!row) {
    return {
      patch: null,
      state: 'idle',
      targetMatches: 5000,
      dailyRequestCap: 20000,
      requestsToday: 0,
      requestDay: '',
      emeraldPlus: false,
      startedAt: null,
      updatedAt: 0,
      lastError: null,
      seedsExhausted: false,
    }
  }
  return {
    patch: row['patch'] === null || row['patch'] === undefined ? null : String(row['patch']),
    state: String(row['status']) as ResearchCrawlState,
    targetMatches: Number(row['target_matches']),
    dailyRequestCap: Number(row['daily_request_cap']),
    requestsToday: Number(row['requests_today']),
    requestDay: String(row['request_day']),
    emeraldPlus: Number(row['emerald_plus']) === 1,
    startedAt: row['started_at'] === null ? null : Number(row['started_at']),
    updatedAt: Number(row['updated_at']),
    lastError: row['last_error'] === null ? null : String(row['last_error']),
    seedsExhausted: Number(row['seeds_exhausted']) === 1,
  }
}

export function saveResearchCrawl(
  db: DatabaseSync,
  value: Partial<ResearchCrawlRow> & { updatedAt: number },
): void {
  const current = getResearchCrawl(db)
  db.prepare(
    `UPDATE research_crawl SET
       patch = ?, status = ?, target_matches = ?, daily_request_cap = ?,
       requests_today = ?, request_day = ?, emerald_plus = ?, started_at = ?,
       updated_at = ?, last_error = ?, seeds_exhausted = ?
     WHERE id = 1`,
  ).run(
    value.patch === undefined ? current.patch : value.patch,
    value.state ?? current.state,
    value.targetMatches ?? current.targetMatches,
    value.dailyRequestCap ?? current.dailyRequestCap,
    value.requestsToday ?? current.requestsToday,
    value.requestDay ?? current.requestDay,
    (value.emeraldPlus ?? current.emeraldPlus) ? 1 : 0,
    value.startedAt === undefined ? current.startedAt : value.startedAt,
    value.updatedAt,
    value.lastError === undefined ? current.lastError : value.lastError,
    (value.seedsExhausted ?? current.seedsExhausted) ? 1 : 0,
  )
}

export function patchFirstSeen(db: DatabaseSync, patch: string): number | null {
  const row = db
    .prepare('SELECT first_seen_at FROM research_patch_seen WHERE patch = ?')
    .get(patch)
  return row?.first_seen_at === undefined ? null : Number(row.first_seen_at)
}

export function recordPatchFirstSeen(db: DatabaseSync, patch: string, at: number): number {
  const existing = patchFirstSeen(db, patch)
  if (existing !== null) return existing
  db.prepare(
    'INSERT OR IGNORE INTO research_patch_seen (patch, first_seen_at) VALUES (?, ?)',
  ).run(patch, at)
  return at
}

export function createResearchSnapshot(
  db: DatabaseSync,
  input: {
    patch: string
    region: string
    queueId: number
    rankScope: string
    createdAt: number
    targetMatches: number
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO research_snapshots
        (patch, region, queue_id, rank_scope, created_at, target_matches)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.patch,
      input.region,
      input.queueId,
      input.rankScope,
      input.createdAt,
      input.targetMatches,
    )
  return Number(result.lastInsertRowid)
}

function mapSnapshot(row: Record<string, unknown>): ResearchSnapshot {
  return {
    id: Number(row['id']),
    patch: String(row['patch']),
    region: String(row['region']),
    queueId: Number(row['queue_id']),
    rankScope: String(row['rank_scope']),
    createdAt: Number(row['created_at']),
    targetMatches: Number(row['target_matches']),
  }
}

export function latestResearchSnapshot(db: DatabaseSync): ResearchSnapshot | null {
  const row = db
    .prepare(
      `SELECT id, patch, region, queue_id, rank_scope, created_at, target_matches
       FROM research_snapshots ORDER BY id DESC LIMIT 1`,
    )
    .get()
  return row ? mapSnapshot(row) : null
}

export function researchSnapshotForPatch(
  db: DatabaseSync,
  patch: string,
): ResearchSnapshot | null {
  const row = db
    .prepare(
      `SELECT id, patch, region, queue_id, rank_scope, created_at, target_matches
       FROM research_snapshots WHERE patch = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(patch)
  return row ? mapSnapshot(row) : null
}

export function updateResearchSnapshotTarget(
  db: DatabaseSync,
  snapshotId: number,
  targetMatches: number,
): void {
  db.prepare('UPDATE research_snapshots SET target_matches = ? WHERE id = ?').run(
    targetMatches,
    snapshotId,
  )
}

export function updateResearchSnapshotScope(
  db: DatabaseSync,
  snapshotId: number,
  rankScope: string,
): void {
  db.prepare('UPDATE research_snapshots SET rank_scope = ? WHERE id = ?').run(
    rankScope,
    snapshotId,
  )
}

export function previousResearchSnapshot(
  db: DatabaseSync,
  currentPatch: string,
): ResearchSnapshot | null {
  const row = db
    .prepare(
      `SELECT id, patch, region, queue_id, rank_scope, created_at, target_matches
       FROM research_snapshots WHERE patch <> ? ORDER BY id DESC LIMIT 1`,
    )
    .get(currentPatch)
  return row ? mapSnapshot(row) : null
}

export function pruneResearchSnapshots(db: DatabaseSync): void {
  const rows = db
    .prepare('SELECT id FROM research_snapshots ORDER BY id DESC')
    .all() as { id?: unknown }[]
  const keep = new Set(rows.slice(0, 2).map((row) => Number(row.id)))
  for (const row of rows.slice(2)) {
    if (!keep.has(Number(row.id))) {
      db.prepare('DELETE FROM research_snapshots WHERE id = ?').run(Number(row.id))
    }
  }
  db.prepare(
    `DELETE FROM research_seen_matches
     WHERE patch NOT IN (SELECT patch FROM research_snapshots)`,
  ).run()
}

export function researchCounts(
  db: DatabaseSync,
  snapshotId: number,
): { matches: number; participants: number; bans: number } {
  const one = (sql: string): number => Number(db.prepare(sql).get(snapshotId)?.['c'] ?? 0)
  return {
    matches: one('SELECT count(*) AS c FROM research_matches WHERE snapshot_id = ?'),
    participants: Number(
      db
        .prepare(
          `SELECT count(*) AS c FROM research_rows r
           JOIN research_matches m ON m.match_id = r.match_id
           WHERE m.snapshot_id = ?`,
        )
        .get(snapshotId)?.['c'] ?? 0,
    ),
    bans: one(
      `SELECT count(*) AS c FROM research_bans b
       JOIN research_matches m ON m.match_id = b.match_id
       WHERE m.snapshot_id = ?`,
    ),
  }
}

/** Saves a match and compact integer rows. Returns false when the match is already stored. */
export function saveResearchMatch(
  db: DatabaseSync,
  snapshotId: number,
  match: Match,
  tierBucket: string | null = null,
): boolean {
  db.exec('BEGIN')
  try {
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO research_matches
          (match_id, snapshot_id, platform, patch, queue_id, game_version,
           game_creation, duration_s, remake)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        match.id,
        snapshotId,
        match.platform,
        match.patch,
        match.queueId,
        match.gameVersion,
        match.gameCreation,
        match.durationSec,
        match.remake ? 1 : 0,
      )
    if (Number(inserted.changes) === 0) {
      db.exec('COMMIT')
      return false
    }

    const insertRow = db.prepare(
      `INSERT OR IGNORE INTO research_rows
        (match_id, team_id, tier_bucket, champion_id, team_position, win,
         item0, item1, item2, item3, item4, item5,
         keystone, primary_style, sub_style, primary_rune_ids, secondary_rune_ids,
         stat_shard_ids, patch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const participant of match.participants) {
      const items = participant.items
      const primary = participant.perks?.find((style) => style.style === participant.primaryStyle)
      const secondary = participant.perks?.find((style) => style.style === participant.subStyle)
      const statShardIds = participant.statPerks
        ? [participant.statPerks.offense, participant.statPerks.flex, participant.statPerks.defense]
        : []
      insertRow.run(
        match.id,
        participant.teamId,
        tierBucket,
        participant.championId,
        participant.position,
        participant.win ? 1 : 0,
        items[0] ?? 0,
        items[1] ?? 0,
        items[2] ?? 0,
        items[3] ?? 0,
        items[4] ?? 0,
        items[5] ?? 0,
        participant.keystone,
        participant.primaryStyle,
        participant.subStyle,
        JSON.stringify(primary?.selections ?? []),
        JSON.stringify(secondary?.selections ?? []),
        JSON.stringify(statShardIds),
        match.patch,
      )
    }

    const insertBan = db.prepare(
      'INSERT OR IGNORE INTO research_bans (match_id, team_id, champion_id) VALUES (?, ?, ?)',
    )
    for (const ban of match.bans) insertBan.run(match.id, ban.teamId, ban.championId)

    db.exec('COMMIT')
    return true
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function isResearchMatchSeen(db: DatabaseSync, matchId: string): boolean {
  return db.prepare('SELECT 1 FROM research_seen_matches WHERE match_id = ?').get(matchId) !== undefined
}

export function markResearchMatchSeen(
  db: DatabaseSync,
  matchId: string,
  patch: string,
  now: number,
  discarded: string | null,
): void {
  db.prepare(
    'INSERT OR IGNORE INTO research_seen_matches (match_id, patch, seen_at, discarded) VALUES (?, ?, ?, ?)',
  ).run(matchId, patch, now, discarded)
}

export function addFrontierPlayer(
  db: DatabaseSync,
  puuid: string,
  tierBucket: string,
  now: number,
): boolean {
  const result = db
    .prepare('INSERT OR IGNORE INTO research_frontier (puuid, tier_bucket, state, added_at) VALUES (?, ?, ?, ?)')
    .run(puuid, tierBucket, 'pending', now)
  return Number(result.changes) > 0
}

export function nextFrontierPlayer(
  db: DatabaseSync,
): { puuid: string; tierBucket: string } | null {
  const row = db
    .prepare(
      `SELECT puuid, tier_bucket FROM research_frontier
       WHERE state = 'pending' ORDER BY added_at, rowid LIMIT 1`,
    )
    .get()
  if (!row) return null
  db.prepare('UPDATE research_frontier SET state = ? WHERE puuid = ?').run(
    'processing',
    String(row['puuid']),
  )
  return { puuid: String(row['puuid']), tierBucket: String(row['tier_bucket']) }
}

export function removeFrontierPlayer(db: DatabaseSync, puuid: string): void {
  db.prepare('DELETE FROM research_frontier WHERE puuid = ?').run(puuid)
}

export function resetProcessingFrontier(db: DatabaseSync): void {
  db.prepare("UPDATE research_frontier SET state = 'pending' WHERE state = 'processing'").run()
}

export function clearFrontier(db: DatabaseSync): void {
  db.prepare('DELETE FROM research_frontier').run()
}

export function frontierSize(db: DatabaseSync): number {
  const row = db.prepare('SELECT count(*) AS c FROM research_frontier').get()
  return Number(row?.['c'] ?? 0)
}

export function researchChampionRows(
  db: DatabaseSync,
  snapshotId: number,
  limit = 15,
): { championKey: number; games: number; wins: number; bans: number }[] {
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
       WHERE m.snapshot_id = ?
       GROUP BY r.champion_id
       ORDER BY games DESC, r.champion_id ASC
       LIMIT ?`,
    )
    .all(snapshotId, snapshotId, limit)
  return rows.map((row) => ({
    championKey: Number(row['champion_key']),
    games: Number(row['games']),
    wins: Number(row['wins']),
    bans: Number(row['bans']),
  }))
}

export function researchItemRows(
  db: DatabaseSync,
  snapshotId: number,
  limit = 15,
): { itemId: number; purchases: number; wins: number }[] {
  const rows = db
    .prepare(
      `SELECT r.item0 AS i0, r.item1 AS i1, r.item2 AS i2,
              r.item3 AS i3, r.item4 AS i4, r.item5 AS i5, r.win
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ?`,
    )
    .all(snapshotId)
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

export function researchCoverageRows(
  db: DatabaseSync,
  snapshotId: number,
  limit = 10000,
): { championKey: number; role: string; games: number; wins: number }[] {
  return db
    .prepare(
      `SELECT r.champion_id AS champion_key, r.team_position AS role,
              count(*) AS games, coalesce(sum(r.win), 0) AS wins
       FROM research_rows r
       JOIN research_matches m ON m.match_id = r.match_id
       WHERE m.snapshot_id = ? AND r.team_position <> ''
       GROUP BY r.champion_id, r.team_position
       ORDER BY games DESC, r.champion_id ASC
       LIMIT ?`,
    )
    .all(snapshotId, limit)
    .map((row) => ({
      championKey: Number(row['champion_key']),
      role: String(row['role']),
      games: Number(row['games']),
      wins: Number(row['wins']),
    }))
}

export function researchStatus(db: DatabaseSync): ResearchStatus {
  const snapshot = latestResearchSnapshot(db)
  const crawl = getResearchCrawl(db)
  if (!snapshot) {
    return {
      snapshot: null,
      matches: 0,
      participants: 0,
      bans: 0,
      timelineEvents: 0,
      state: crawl.state,
      patch: null,
      targetMatches: crawl.targetMatches,
      dailyRequestCap: crawl.dailyRequestCap,
      requestsToday: crawl.requestsToday,
      requestsPerMinute: 0,
      etaSeconds: null,
      startedAt: crawl.startedAt,
      updatedAt: crawl.updatedAt,
      lastError: crawl.lastError,
      emeraldPlus: crawl.emeraldPlus,
      seedsExhausted: crawl.seedsExhausted,
      coverage: [],
    }
  }
  const counts = researchCounts(db, snapshot.id)
  return {
    snapshot,
    ...counts,
    timelineEvents: 0,
    state: crawl.state,
    patch: snapshot.patch,
    targetMatches: crawl.targetMatches,
    dailyRequestCap: crawl.dailyRequestCap,
    requestsToday: crawl.requestsToday,
    requestsPerMinute: 0,
    etaSeconds: null,
    startedAt: crawl.startedAt,
    updatedAt: crawl.updatedAt,
    lastError: crawl.lastError,
    emeraldPlus: crawl.emeraldPlus,
    seedsExhausted: crawl.seedsExhausted,
    coverage: [],
  }
}
