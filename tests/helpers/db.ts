import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '../../src/main/db/open'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'

/** In-memory database with every migration applied. */
export function memoryDb(): DatabaseSync {
  const db = openDb(':memory:')
  runMigrations(db, migrations)
  return db
}

export interface TestParticipant {
  team: 100 | 200
  champion: number // Data Dragon numeric key
  win: boolean
  items?: number[]
  puuid?: string // only for the tracked account, like in production
  position?: string
  keystone?: number | null
  primaryStyle?: number | null
  subStyle?: number | null
  perks?: { style: number; selections: number[] }[] | null
}

export interface TestMatch {
  id: string
  queue: number
  creation: number
  remake?: boolean
  participants: TestParticipant[]
}

/** Inserts a match and its participants with plain SQL (independent of the application repo code). */
export function insertMatch(db: DatabaseSync, match: TestMatch): void {
  db.prepare(
    'INSERT INTO matches (match_id, platform, queue_id, patch, game_version, game_creation, duration_s, remake) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(match.id, 'EUW1', match.queue, '16.21', '16.21.600.1', match.creation, 1800, match.remake ? 1 : 0)
  match.participants.forEach((p, slot) => {
    db.prepare(
      'INSERT INTO participants (match_id, slot, puuid, team_id, champion_id, position, win, items, trinket, summoner1, summoner2, keystone, primary_style, sub_style, perks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      match.id,
      slot,
      p.puuid ?? null,
      p.team,
      p.champion,
      p.position ?? 'TOP',
      p.win ? 1 : 0,
      JSON.stringify(p.items ?? [0, 0, 0, 0, 0, 0]),
      0,
      4,
      14,
      p.keystone ?? null,
      p.primaryStyle ?? null,
      p.subStyle ?? null,
      p.perks ? JSON.stringify(p.perks) : null,
    )
  })
}
