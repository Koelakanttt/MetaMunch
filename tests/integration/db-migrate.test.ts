import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { getSchemaVersion, runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'

function tableNames(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name?: unknown
  }[]
  return rows.map((row) => String(row.name))
}

describe('db migrations', () => {
  it('applies migrations', () => {
    const db = openDb(':memory:')

    expect(runMigrations(db, migrations)).toBe(5)
    expect(getSchemaVersion(db)).toBe(5)
    expect(tableNames(db)).toContain('patches')
    expect(tableNames(db)).toContain('settings')
    expect(tableNames(db)).toContain('champions')
    expect(tableNames(db)).toContain('items')
    expect(tableNames(db)).toContain('accounts')
    expect(tableNames(db)).toContain('matches')
    expect(tableNames(db)).toContain('participants')
    expect(tableNames(db)).toContain('champion_details')
  })

  it('is idempotent', () => {
    const db = openDb(':memory:')

    expect(runMigrations(db, migrations)).toBe(5)
    expect(runMigrations(db, migrations)).toBe(5)
  })

  it('round trips settings', () => {
    const db = openDb(':memory:')
    runMigrations(db, migrations)

    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('theme', 'dark')
    const row = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get() as
      | { value?: unknown }
      | undefined

    expect(String(row?.value)).toBe('dark')
  })

  it('rolls back a failing migration', () => {
    const db = openDb(':memory:')
    const failing = [
      { version: 1, sql: 'CREATE TABLE a (x INTEGER)' },
      { version: 2, sql: 'CREATE TABLE a (x INTEGER)' },
    ]

    expect(() => runMigrations(db, failing)).toThrow()
    expect(getSchemaVersion(db)).toBe(1)
    expect(tableNames(db)).toContain('a')
  })

  it('rejects invalid migrations', () => {
    const db = openDb(':memory:')

    expect(() =>
      runMigrations(db, [
        { version: 2, sql: '' },
        { version: 1, sql: '' },
      ]),
    ).toThrow('Invalid migrations')
  })
})
