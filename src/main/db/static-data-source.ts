import type { DatabaseSync } from 'node:sqlite'
import type { StaticDataSource } from '../services/recommendation-service'
import { getLatestPatch, listChampions, listItems } from './static-data-repo'

export function createDbSource(db: DatabaseSync): StaticDataSource {
  return {
    latestVersion: () => getLatestPatch(db)?.version ?? null,
    champions: (version: string) => listChampions(db, version),
    items: (version: string) => listItems(db, version),
  }
}
