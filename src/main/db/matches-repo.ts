import type { DatabaseSync } from 'node:sqlite'
import type { Match, RiotAccount } from '@shared/riot'

export interface StoredAccount {
  puuid: string
  gameName: string
  tagLine: string
  platform: string
  addedAt: number
}

export function upsertAccount(
  db: DatabaseSync,
  account: RiotAccount,
  platform: string,
  addedAt: number,
): void {
  db.prepare(
    `INSERT INTO accounts (puuid, game_name, tag_line, platform, added_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(puuid) DO UPDATE SET
       game_name = excluded.game_name,
       tag_line = excluded.tag_line,
       platform = excluded.platform`,
  ).run(account.puuid, account.gameName, account.tagLine, platform, addedAt)
}

export function getAccount(db: DatabaseSync): StoredAccount | null {
  const row = db
    .prepare(
      `SELECT puuid, game_name, tag_line, platform, added_at
       FROM accounts
       ORDER BY added_at DESC
       LIMIT 1`,
    )
    .get() as
    | { puuid?: unknown; game_name?: unknown; tag_line?: unknown; platform?: unknown; added_at?: unknown }
    | undefined
  if (!row) return null
  return {
    puuid: String(row.puuid),
    gameName: String(row.game_name),
    tagLine: String(row.tag_line),
    platform: String(row.platform),
    addedAt: Number(row.added_at),
  }
}

export function knownMatchIds(db: DatabaseSync, ids: readonly string[]): Set<string> {
  const known = new Set<string>()
  if (ids.length === 0) return known

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT match_id FROM matches WHERE match_id IN (${placeholders})`)
    .all(...ids) as { match_id?: unknown }[]

  for (const row of rows) known.add(String(row.match_id))
  return known
}

export function saveMatch(db: DatabaseSync, match: Match, trackedPuuids: readonly string[]): void {
  db.exec('BEGIN')
  try {
    db.prepare(
      `INSERT INTO matches
        (match_id, platform, queue_id, patch, game_version, game_creation, duration_s, remake)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      match.id,
      match.platform,
      match.queueId,
      match.patch,
      match.gameVersion,
      match.gameCreation,
      match.durationSec,
      match.remake ? 1 : 0,
    )

    const insertParticipant = db.prepare(
      `INSERT INTO participants
        (match_id, slot, puuid, team_id, champion_id, position, win, items,
         trinket, summoner1, summoner2, keystone, primary_style, sub_style)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const tracked = new Set(trackedPuuids)
    match.participants.forEach((participant, slot) => {
      insertParticipant.run(
        match.id,
        slot,
        tracked.has(participant.puuid) ? participant.puuid : null,
        participant.teamId,
        participant.championId,
        participant.position,
        participant.win ? 1 : 0,
        JSON.stringify(participant.items),
        participant.trinket,
        participant.summoner1,
        participant.summoner2,
        participant.keystone,
        participant.primaryStyle,
        participant.subStyle,
      )
    })

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function countMatches(db: DatabaseSync, puuid: string): number {
  const row = db
    .prepare('SELECT count(DISTINCT match_id) AS c FROM participants WHERE puuid = ?')
    .get(puuid) as { c?: unknown } | undefined
  return Number(row?.c ?? 0)
}

export function lastGameCreation(db: DatabaseSync, puuid: string): number | null {
  const row = db
    .prepare(
      `SELECT max(m.game_creation) AS g
       FROM matches m
       JOIN participants p ON p.match_id = m.match_id
       WHERE p.puuid = ?`,
    )
    .get(puuid) as { g?: unknown } | undefined
  const value = row?.g
  return value === null || value === undefined ? null : Number(value)
}
