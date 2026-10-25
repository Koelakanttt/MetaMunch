import type { DatabaseSync } from 'node:sqlite'
import type { IpcHandlers } from '@shared/ipc'
import { getSchemaVersion } from '../db/migrate'
import type { MatchSyncService } from '../services/match-sync-service'
import type { StaticDataService } from '../services/static-data-service'

export function createHandlers(deps: {
  db: DatabaseSync
  staticData: StaticDataService
  matchSync: MatchSyncService
}): IpcHandlers {
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
    'staticData:status': () => {
      const status = deps.staticData.status()
      if (!status) {
        return { version: null, champions: 0, items: 0, fetchedAt: null }
      }
      return {
        version: status.version,
        champions: status.champions,
        items: status.items,
        fetchedAt: status.fetchedAt,
      }
    },
    'staticData:refresh': () => deps.staticData.refresh(),
    'account:set': async ({ riotId }) => {
      const account = await deps.matchSync.setAccount(riotId)
      return { gameName: account.gameName, tagLine: account.tagLine }
    },
    'matches:status': () => deps.matchSync.status(),
    'matches:sync': () => deps.matchSync.sync(),
  }
}
