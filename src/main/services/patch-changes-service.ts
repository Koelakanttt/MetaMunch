import type { DatabaseSync } from 'node:sqlite'
import type { Champion, Item } from '@shared/ddragon'
import type { ChampionDetail } from '@shared/ddragon-detail'
import type { Change, EntityChanges, PatchChangesResponse } from '@shared/patch-diff'
import { diffChampion, diffItem, previousPatchVersion } from '@shared/patch-diff'
import { summarizeBuild } from '@shared/personal'
import { getDetailJson, saveDetailJson } from '../db/champion-details-repo'
import { listMyGames } from '../db/personal-stats-repo'
import { listPool } from '../db/pool-repo'
import { getLatestPatch, listChampions, listItems } from '../db/static-data-repo'
import type { DataDragonProvider } from '../providers/data-dragon'
import type { TrackedAccount } from './personal-stats-service'

function lowestIdByName(items: readonly Item[]): Map<string, Item> {
  const byName = new Map<string, Item>()
  for (const item of items) {
    const existing = byName.get(item.name)
    if (!existing || item.id < existing.id) byName.set(item.name, item)
  }
  return byName
}

export class PatchChangesService {
  private readonly db: DatabaseSync
  private readonly provider: DataDragonProvider
  private readonly getAccount: () => TrackedAccount | null

  constructor(deps: {
    db: DatabaseSync
    provider: DataDragonProvider
    getAccount: () => TrackedAccount | null
  }) {
    this.db = deps.db
    this.provider = deps.provider
    this.getAccount = deps.getAccount
  }

  async run(): Promise<PatchChangesResponse> {
    const account = this.getAccount()
    const latest = getLatestPatch(this.db)
    const to = latest?.version ?? null

    if (!account) {
      return { from: null, to, pool: [], champions: [], items: [], notes: ['No account set.'] }
    }
    if (!to) {
      return {
        from: null,
        to: null,
        pool: [],
        champions: [],
        items: [],
        notes: ['No static data yet. Press "Update data" first.'],
      }
    }

    const notes: string[] = []
    const versions = await this.provider.getVersions()
    const from = previousPatchVersion(versions, to)
    if (!from) {
      return {
        from: null,
        to,
        pool: [],
        champions: [],
        items: [],
        notes: [`No previous patch found for ${to}.`],
      }
    }

    const storedChampions = listChampions(this.db, to)
    const byKey = new Map(storedChampions.map((champion) => [champion.key, champion]))

    const pool: { id: string; name: string; games: number }[] = []
    const poolChampions: Champion[] = []
    for (const entry of listPool(this.db, account.puuid)) {
      const champion = byKey.get(entry.championKey)
      if (!champion) {
        notes.push(`Unknown champion key ${entry.championKey} in ${to}`)
        continue
      }
      pool.push({ id: champion.id, name: champion.name, games: entry.games })
      poolChampions.push(champion)
    }

    const champions: EntityChanges[] = []
    for (const champion of poolChampions) {
      const before = await this.loadDetail(from, champion.id)
      if (!before) {
        notes.push(`No details for ${champion.name} in ${from}`)
        champions.push({ id: champion.id, name: champion.name, changes: [] })
        continue
      }
      const after = await this.loadDetail(to, champion.id)
      if (!after) {
        notes.push(`No details for ${champion.name} in ${to}`)
        champions.push({ id: champion.id, name: champion.name, changes: [] })
        continue
      }
      champions.push({ id: champion.id, name: champion.name, changes: diffChampion(before, after) })
    }

    const storedItems = listItems(this.db, to)
    const buildNames = new Set<string>()
    for (const champion of poolChampions) {
      const games = listMyGames(this.db, account.puuid, champion.key)
      for (const entry of summarizeBuild(games, storedItems)) buildNames.add(entry.name)
    }

    const items: EntityChanges[] = []
    if (buildNames.size > 0) {
      const fromItems = await this.provider.getItems(from)
      const beforeByName = lowestIdByName(fromItems.values)
      const afterByName = lowestIdByName(storedItems)
      for (const name of buildNames) {
        const before = beforeByName.get(name)
        const after = afterByName.get(name)
        if (!before || !after) continue
        const changes: Change[] = diffItem(before, after)
        if (changes.length > 0) items.push({ id: String(after.id), name, changes })
      }
    }

    return { from, to, pool, champions, items, notes }
  }

  private async loadDetail(version: string, championId: string): Promise<ChampionDetail | null> {
    const cached = getDetailJson(this.db, version, championId)
    if (cached !== null) {
      try {
        return JSON.parse(cached) as ChampionDetail
      } catch {
        return null
      }
    }

    try {
      const detail = await this.provider.getChampionDetail(version, championId)
      saveDetailJson(this.db, version, championId, JSON.stringify(detail))
      return detail
    } catch {
      return null
    }
  }
}
