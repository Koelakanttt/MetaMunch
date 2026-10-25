import type { DatabaseSync } from 'node:sqlite'
import type { IpcHandlers } from '@shared/ipc'
import { getSchemaVersion } from '../db/migrate'

export function createHandlers(deps: { db: DatabaseSync }): IpcHandlers {
  return {
    'app:ping': ({ message }) => ({ reply: 'pong: ' + message, at: Date.now() }),
    'db:info': () => {
      const row = deps.db.prepare('SELECT sqlite_version() AS v').get() as
        | { v?: unknown }
        | undefined
      return {
        schemaVersion: getSchemaVersion(deps.db),
        sqliteVersion: String(row?.v ?? ''),
      }
    },
  }
}
