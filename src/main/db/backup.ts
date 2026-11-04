import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

function stamp(now: number): string {
  const date = new Date(now)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/** Writes a consistent SQLite backup before a schema-changing startup. */
export function backupDatabase(db: DatabaseSync, dir: string, now = Date.now()): string {
  mkdirSync(dir, { recursive: true })
  const base = `metamunch-${stamp(now)}`
  let path = join(dir, `${base}.sqlite`)
  let suffix = 1
  while (existsSync(path)) {
    path = join(dir, `${base}-${suffix}.sqlite`)
    suffix += 1
  }
  db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
  return path
}
