import type { DatabaseSync } from 'node:sqlite'
import type { Champion, Item } from '@shared/ddragon'
import type { ChampionDetail } from '@shared/ddragon-detail'
import type {
  Change,
  EntityChanges,
  PatchAbilityProgress,
  PatchAbilityStatus,
  PatchChangesRequest,
  PatchChangesResponse,
  PatchChangesSummary,
} from '@shared/patch-diff'
import {
  diffChampion,
  diffItem,
  diffStats,
  lowestIdByName,
  previousPatchVersion,
  recentVersions,
  shopItems,
} from '@shared/patch-diff'
import { getDetailJson, saveDetailJson } from '../db/champion-details-repo'
import { listPool } from '../db/pool-repo'
import { getLatestPatch } from '../db/static-data-repo'
import type { DataDragonProvider } from '../providers/data-dragon'
import type { TrackedAccount } from './personal-stats-service'

interface AbilityRun {
  from: string
  to: string
  token: number
  ids: string[]
  total: number
  loaded: number
  errors: number
  running: boolean
  changes: Map<string, Change[]>
}

function emptyProgress(): PatchAbilityProgress {
  return { loaded: 0, total: 0, running: false, errors: 0 }
}

export class PatchChangesService {
  private readonly db: DatabaseSync
  private readonly provider: DataDragonProvider
  private readonly getAccount: () => TrackedAccount | null
  private readonly championCache = new Map<string, Champion[]>()
  private readonly itemCache = new Map<string, Item[]>()
  private ability: AbilityRun | null = null
  private token = 0
  constructor(deps: {
    db: DatabaseSync
    provider: DataDragonProvider
    getAccount: () => TrackedAccount | null
  }) {
    this.db = deps.db
    this.provider = deps.provider
    this.getAccount = deps.getAccount
  }

  async run(request: PatchChangesRequest = {}): Promise<PatchChangesResponse> {
    const notes: string[] = []
    const versions = await this.safeVersions()
    const stored = getLatestPatch(this.db)?.version ?? null
    const to = request.to ?? stored ?? versions[0] ?? null
    const from = request.from ?? (to ? previousPatchVersion(versions, to) : null)
    const available = recentVersions(versions)

    if (!to) {
      return this.empty(null, null, available, ['No Data Dragon version available.'])
    }
    if (!from) {
      return this.empty(null, to, available, [`No previous patch found for ${to}.`])
    }

    let championsReady = true
    let itemsReady = true
    const beforeChampions = await this.loadChampions(from).catch((error: unknown) => {
      notes.push(`Champions ${from}: ${this.short(error)}`)
      championsReady = false
      return [] as Champion[]
    })
    const afterChampions = await this.loadChampions(to).catch((error: unknown) => {
      notes.push(`Champions ${to}: ${this.short(error)}`)
      championsReady = false
      return [] as Champion[]
    })
    const beforeItems = await this.loadItems(from).catch((error: unknown) => {
      notes.push(`Items ${from}: ${this.short(error)}`)
      itemsReady = false
      return [] as Item[]
    })
    const afterItems = await this.loadItems(to).catch((error: unknown) => {
      notes.push(`Items ${to}: ${this.short(error)}`)
      itemsReady = false
      return [] as Item[]
    })

    const account = this.getAccount()
    const pool: { id: string; name: string; games: number }[] = []
    const poolIds = new Set<string>()
    if (account) {
      const afterByKey = new Map(afterChampions.map((champion) => [champion.key, champion]))
      for (const entry of listPool(this.db, account.puuid)) {
        const champion = afterByKey.get(entry.championKey)
        if (!champion) continue
        pool.push({ id: champion.id, name: champion.name, games: entry.games })
        poolIds.add(champion.id)
      }
    }
    if (pool.length === 0) {
      notes.push('No matches in your pool yet. The full patch is still shown.')
    }

    const champions = championsReady
      ? this.diffChampions(beforeChampions, afterChampions, to).filter(
          (entry) => !request.poolOnly || poolIds.has(entry.id),
        )
      : []
    const items = itemsReady
      ? this.diffItems(beforeItems, afterItems, to, request.allItems === true)
      : []

    const summary: PatchChangesSummary = {
      championsChanged: champions.filter((entry) => entry.status === 'changed').length,
      itemsChanged: items.filter((entry) => entry.status === 'changed').length,
      added: [...champions, ...items].filter((entry) => entry.status === 'added').length,
      removed: [...champions, ...items].filter((entry) => entry.status === 'removed').length,
    }

    this.token += 1
    const abilityIds = champions
      .filter((entry) => entry.status !== 'removed')
      .map((entry) => entry.id)
    this.ability = {
      from,
      to,
      token: this.token,
      ids: abilityIds,
      total: abilityIds.length,
      loaded: 0,
      errors: 0,
      running: false,
      changes: new Map(),
    }

    return {
      from,
      to,
      versions: available,
      pool,
      champions,
      items,
      summary,
      abilityProgress: this.progress(),
      notes,
    }
  }

  /** Starts a bounded background load; returns immediately so the UI can poll progress. */
  startAbilityLoad(championIds?: readonly string[]): PatchAbilityStatus {
    const current = this.ability
    if (!current) return this.abilityStatus()
    const requested = championIds ? new Set(championIds) : null
    const targets = current.ids.filter(
      (id) => (!requested || requested.has(id)) && !current.changes.has(id),
    )
    const token = ++this.token
    this.ability = {
      ...current,
      token,
      total: targets.length,
      loaded: 0,
      errors: 0,
      running: targets.length > 0,
      changes: new Map(current.changes),
    }
    void this.loadAbilities(targets, token)
    return this.abilityStatus()
  }

  abilityStatus(): PatchAbilityStatus {
    const ability = this.ability
    if (!ability) {
      return { from: null, to: null, progress: emptyProgress(), changes: {} }
    }
    return {
      from: ability.from,
      to: ability.to,
      progress: this.progress(),
      changes: Object.fromEntries(ability.changes),
    }
  }

  private progress(): PatchAbilityProgress {
    if (!this.ability) return emptyProgress()
    return {
      loaded: this.ability.loaded,
      total: this.ability.total,
      running: this.ability.running,
      errors: this.ability.errors,
    }
  }

  private async loadAbilities(ids: readonly string[], token: number): Promise<void> {
    if (!this.ability) return
    const queue = [...ids]
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const current = this.ability
        if (!current || current.token !== token) return
        const championId = queue.shift()
        if (!championId) return
        try {
          const before = await this.loadDetail(current.from, championId)
          const after = await this.loadDetail(current.to, championId)
          if (!before || !after) throw new Error('missing champion detail')
          const changes = diffChampion(before, after).filter(
            (change) => !(change.label in after.stats),
          )
          const latest = this.ability
          if (latest && latest.token === token) {
            latest.changes.set(championId, changes)
            latest.loaded += 1
          }
        } catch {
          const latest = this.ability
          if (latest && latest.token === token) {
            latest.errors += 1
            latest.changes.set(championId, [])
          }
        }
      }
    }
    await Promise.all(Array.from({ length: 3 }, () => worker()))
    const latest = this.ability
    if (latest && latest.token === token) latest.running = false
  }

  private diffChampions(
    beforeChampions: readonly Champion[],
    afterChampions: readonly Champion[],
    to: string,
  ): EntityChanges[] {
    const beforeById = new Map(beforeChampions.map((champion) => [champion.id, champion]))
    const afterById = new Map(afterChampions.map((champion) => [champion.id, champion]))
    const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort()
    return ids.map((id) => {
      const before = beforeById.get(id)
      const after = afterById.get(id)
      const name = after?.name ?? before?.name ?? id
      if (!before) {
        return {
          id,
          name,
          status: 'added' as const,
          changes: [{ label: 'Champion added', before: '—', after: `added in ${to}` }],
        }
      }
      if (!after) {
        return {
          id,
          name,
          status: 'removed' as const,
          changes: [{ label: 'Champion removed', before: `removed in ${to}`, after: '—' }],
        }
      }
      const changes = diffStats(before.stats, after.stats)
      return {
        id,
        name,
        status: changes.length > 0 ? ('changed' as const) : ('unchanged' as const),
        changes,
      }
    })
  }

  private diffItems(
    beforeItems: readonly Item[],
    afterItems: readonly Item[],
    to: string,
    allItems: boolean,
  ): EntityChanges[] {
    const before = allItems ? lowestIdByName(beforeItems) : lowestIdByName(shopItems(beforeItems))
    const after = allItems ? lowestIdByName(afterItems) : lowestIdByName(shopItems(afterItems))
    const names = [...new Set([...before.keys(), ...after.keys()])].sort()
    return names.map((name) => {
      const beforeItem = before.get(name)
      const afterItem = after.get(name)
      const id = String((afterItem ?? beforeItem)?.id ?? 0)
      if (!beforeItem) {
        return {
          id,
          name,
          status: 'added' as const,
          changes: [{ label: 'Item added', before: '—', after: `added in ${to}` }],
        }
      }
      if (!afterItem) {
        return {
          id,
          name,
          status: 'removed' as const,
          changes: [{ label: 'Item removed', before: `removed in ${to}`, after: '—' }],
        }
      }
      const changes = diffItem(beforeItem, afterItem)
      return {
        id,
        name,
        status: changes.length > 0 ? ('changed' as const) : ('unchanged' as const),
        changes,
      }
    })
  }

  private empty(
    from: string | null,
    to: string | null,
    versions: string[],
    notes: string[],
  ): PatchChangesResponse {
    return {
      from,
      to,
      versions,
      pool: [],
      champions: [],
      items: [],
      summary: { championsChanged: 0, itemsChanged: 0, added: 0, removed: 0 },
      abilityProgress: emptyProgress(),
      notes,
    }
  }

  private async safeVersions(): Promise<string[]> {
    try {
      return await this.retry(() => this.provider.getVersions())
    } catch {
      return []
    }
  }

  private async loadChampions(version: string): Promise<Champion[]> {
    const cached = this.championCache.get(version)
    if (cached) return cached
    const result = await this.retry(() => this.provider.getChampions(version))
    this.championCache.set(version, result.values)
    return result.values
  }

  private async loadItems(version: string): Promise<Item[]> {
    const cached = this.itemCache.get(version)
    if (cached) return cached
    const result = await this.retry(() => this.provider.getItems(version))
    this.itemCache.set(version, result.values)
    return result.values
  }

  private async retry<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action()
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return action()
    }
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
      const detail = await this.retry(() => this.provider.getChampionDetail(version, championId))
      saveDetailJson(this.db, version, championId, JSON.stringify(detail))
      return detail
    } catch {
      return null
    }
  }

  private short(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.length > 180 ? `${message.slice(0, 177)}...` : message
  }
}
