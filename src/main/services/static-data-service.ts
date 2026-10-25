import type { DatabaseSync } from 'node:sqlite'
import type { PatchStatus } from '../db/static-data-repo'
import { getLatestPatch, hasPatch, listChampions, listItems, savePatch } from '../db/static-data-repo'
import type { DataDragonProvider } from '../providers/data-dragon'

export interface RefreshResult {
  version: string
  fromCache: boolean
  champions: number
  items: number
}

export class StaticDataService {
  private readonly db: DatabaseSync
  private readonly provider: DataDragonProvider
  private readonly now: () => number

  constructor(deps: { db: DatabaseSync; provider: DataDragonProvider; now?: () => number }) {
    this.db = deps.db
    this.provider = deps.provider
    this.now = deps.now ?? Date.now
  }

  status(): PatchStatus | null {
    return getLatestPatch(this.db)
  }

  async refresh(): Promise<RefreshResult> {
    const version = await this.provider.getLatestVersion()

    if (hasPatch(this.db, version)) {
      return {
        version,
        fromCache: true,
        champions: listChampions(this.db, version).length,
        items: listItems(this.db, version).length,
      }
    }

    const champions = await this.provider.getChampions(version)
    const items = await this.provider.getItems(version)
    savePatch(this.db, version, champions.values, items.values, this.now())

    return {
      version,
      fromCache: false,
      champions: champions.values.length,
      items: items.values.length,
    }
  }
}
