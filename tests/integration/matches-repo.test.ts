import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import {
  countMatches,
  getAccount,
  knownMatchIds,
  lastGameCreation,
  saveMatch,
  upsertAccount,
} from '../../src/main/db/matches-repo'
import { openDb } from '../../src/main/db/open'
import { parseAccount, parseMatch } from '../../src/shared/riot'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

function migratedDb() {
  const db = openDb(':memory:')
  runMigrations(db, migrations)
  return db
}

describe('matches repo', () => {
  it('upserts an account and keeps the first addedAt', () => {
    const db = migratedDb()
    const account = parseAccount(fixture('account.json'))

    upsertAccount(db, account, 'EUW1', 1000)
    upsertAccount(db, { ...account, gameName: 'Renamed', tagLine: '999' }, 'EUW1', 2000)

    expect(getAccount(db)).toEqual({
      puuid: account.puuid,
      gameName: 'Renamed',
      tagLine: '999',
      platform: 'EUW1',
      addedAt: 1000,
    })
  })

  it('returns the newest account', () => {
    const db = migratedDb()

    upsertAccount(db, { puuid: 'puuid-a', gameName: 'A', tagLine: '1' }, 'EUW1', 1)
    upsertAccount(db, { puuid: 'puuid-b', gameName: 'B', tagLine: '2' }, 'EUW1', 2)

    expect(getAccount(db)?.puuid).toBe('puuid-b')
  })

  it('stores only the tracked puuid and round-trips items', () => {
    const db = migratedDb()
    const match = parseMatch(fixture('match.json'))

    saveMatch(db, match, ['puuid-me-0001'])

    const rows = db
      .prepare('SELECT slot, puuid, items FROM participants WHERE match_id = ? ORDER BY slot')
      .all(match.id) as { slot?: unknown; puuid?: unknown; items?: unknown }[]

    expect(rows).toHaveLength(10)
    const tracked = rows.filter((row) => row.puuid !== null)
    expect(tracked).toHaveLength(1)
    expect(String(tracked[0]?.puuid)).toBe('puuid-me-0001')

    const items = JSON.parse(String(rows[0]?.items)) as unknown
    expect(Array.isArray(items)).toBe(true)
    if (Array.isArray(items)) {
      expect(items).toHaveLength(6)
      expect(items.every((value) => typeof value === 'number')).toBe(true)
    }
  })

  it('throws when saving the same match twice', () => {
    const db = migratedDb()
    const match = parseMatch(fixture('match.json'))
    saveMatch(db, match, ['puuid-me-0001'])

    expect(() => saveMatch(db, match, ['puuid-me-0001'])).toThrow()

    const row = db
      .prepare('SELECT count(*) AS c FROM participants WHERE match_id = ?')
      .get(match.id) as { c?: unknown } | undefined
    expect(Number(row?.c)).toBe(10)
  })

  it('reports known ids, counts and the last game creation', () => {
    const db = migratedDb()
    const match = parseMatch(fixture('match.json'))
    saveMatch(db, match, ['puuid-me-0001'])

    expect(knownMatchIds(db, ['EUW1_7000000001', 'EUW1_7000000099'])).toEqual(
      new Set(['EUW1_7000000001']),
    )
    expect(knownMatchIds(db, [])).toEqual(new Set())
    expect(countMatches(db, 'puuid-me-0001')).toBe(1)
    expect(countMatches(db, 'puuid-nobody')).toBe(0)
    expect(lastGameCreation(db, 'puuid-me-0001')).toBe(1761350000000)
    expect(lastGameCreation(db, 'puuid-nobody')).toBeNull()
  })
})
