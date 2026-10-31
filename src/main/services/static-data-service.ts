import type { DatabaseSync } from 'node:sqlite'
import type { PatchStatus } from '../db/static-data-repo'
import { getLatestPatch, hasPatch, listChampions, listItems, savePatch } from '../db/static-data-repo'
import { recordPatchFirstSeen } from '../db/research-repo'
import { toPatch } from '@shared/riot'
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
  private inFlight: Promise<RefreshResult> | null = null

  constructor(deps: { db: DatabaseSync; provider: DataDragonProvider; now?: () => number }) {
    this.db = deps.db
    this.provider = deps.provider
    this.now = deps.now ?? Date.now
  }

  status(): PatchStatus | null {
    return getLatestPatch(this.db)
  }

  /** Concurrent callers (startup check and the Update button) share one refresh. */
  refresh(): Promise<RefreshResult> {
    if (this.inFlight) return this.inFlight
    const run = this.doRefresh().finally(() => {
      if (this.inFlight === run) this.inFlight = null
    })
    this.inFlight = run
    return run
  }

  private async doRefresh(): Promise<RefreshResult> {
    const version = await this.provider.getLatestVersion()
    const patch = toPatch(version)

    if (hasPatch(this.db, version)) {
      recordPatchFirstSeen(this.db, patch, this.now())
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
    recordPatchFirstSeen(this.db, patch, this.now())

    return {
      version,
      fromCache: false,
      champions: champions.values.length,
      items: items.values.length,
    }
  }
}
