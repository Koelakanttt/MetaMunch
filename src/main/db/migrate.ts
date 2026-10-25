import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number // integer >= 1
  sql: string
}

export function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: unknown } | undefined
  return Number(row?.user_version ?? 0)
}

export function runMigrations(db: DatabaseSync, migrations: readonly Migration[]): number {
  let previous = 0
  for (const migration of migrations) {
    if (
      !Number.isInteger(migration.version) ||
      migration.version < 1 ||
      migration.version <= previous
    ) {
      throw new Error('Invalid migrations')
    }
    previous = migration.version
  }

  let current = getSchemaVersion(db)
  for (const migration of migrations) {
    if (migration.version <= current) continue
    try {
      db.exec('BEGIN')
      db.exec(migration.sql)
      db.exec(`PRAGMA user_version = ${migration.version}`)
      db.exec('COMMIT')
      current = migration.version
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  return current
}
