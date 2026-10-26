import type { DatabaseSync } from 'node:sqlite'

export function getDetailJson(db: DatabaseSync, patch: string, id: string): string | null {
  const row = db
    .prepare('SELECT json FROM champion_details WHERE patch = ? AND id = ?')
    .get(patch, id) as { json?: unknown } | undefined
  return row === undefined ? null : String(row.json)
}

export function saveDetailJson(
  db: DatabaseSync,
  patch: string,
  id: string,
  json: string,
): void {
  db.prepare('INSERT OR REPLACE INTO champion_details (patch, id, json) VALUES (?, ?, ?)').run(
    patch,
    id,
    json,
  )
}
