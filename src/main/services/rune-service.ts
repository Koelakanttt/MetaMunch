import type { DatabaseSync } from 'node:sqlite'
import type { Rune, RuneRef, RuneTree, RunesResponse } from '@shared/runes'
import { runePageTotals } from '../db/rune-repo'
import type { RuneDataProvider } from '../providers/rune-data'
import type { StaticDataSource } from './recommendation-service'

const MIN_GAMES = 3

interface StoredPerkStyle {
  style: number
  selections: number[]
}

function isPerkStyle(value: unknown): value is StoredPerkStyle {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const selections = record['selections']
  return (
    typeof record['style'] === 'number' &&
    Array.isArray(selections) &&
    selections.every((id: unknown) => typeof id === 'number')
  )
}

function parsePerks(value: string | null): StoredPerkStyle[] | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return null
    const styles = parsed.filter(isPerkStyle)
    return styles.length > 0 ? styles : null
  } catch {
    return null
  }
}

function ref(id: number, name: string | undefined, icon: string | undefined): RuneRef {
  return {
    id,
    name: name ?? `Rune ${id}`,
    icon: icon && icon.length > 0 ? icon : null,
  }
}

export interface RuneDeps {
  db: DatabaseSync
  source: StaticDataSource
  provider: RuneDataProvider
}

/** Popular rune pages for a champion from the stored sample plus Data Dragon rune metadata. */
export class RuneService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource
  private readonly provider: RuneDataProvider

  constructor(deps: RuneDeps) {
    this.db = deps.db
    this.source = deps.source
    this.provider = deps.provider
  }

  async popular(championId: string): Promise<RunesResponse> {
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const me = champions.find((champion) => champion.id === championId)
    if (!me) {
      return {
        version,
        championId,
        championName: null,
        pages: [],
        hasStaticData: version !== null,
        note: null,
      }
    }

    const rows = runePageTotals(this.db, me.key)
    if (rows.length === 0) {
      return {
        version,
        championId,
        championName: me.name,
        pages: [],
        hasStaticData: true,
        note: null,
      }
    }

    let trees: RuneTree[] = []
    let note: string | null = null
    if (version !== null) {
      try {
        trees = await this.provider.getRunes(version)
      } catch {
        note = 'Rune names and icons are unavailable; showing rune ids only.'
      }
    }

    const styleById = new Map(trees.map((tree) => [tree.id, tree]))
    const keystoneById = new Map<number, Rune>()
    const runeById = new Map<number, Rune>()
    for (const tree of trees) {
      for (const slot of tree.slots) {
        for (const rune of slot.runes) {
          runeById.set(rune.id, rune)
          if (slot === tree.slots[0]) keystoneById.set(rune.id, rune)
        }
      }
    }

    const pages = rows.map((row) => {
      const keystone = keystoneById.get(row.keystone)
      const primary = styleById.get(row.primaryStyle)
      const secondary = styleById.get(row.subStyle)
      const stored = parsePerks(row.perks)
      const primarySelections =
        stored?.find((style) => style.style === row.primaryStyle)?.selections ?? []
      const secondarySelections =
        stored?.find((style) => style.style === row.subStyle)?.selections ?? []
      const primaryRunes =
        primarySelections.length > 0
          ? primarySelections.map((id) =>
              ref(id, runeById.get(id)?.name, runeById.get(id)?.icon),
            )
          : [ref(row.keystone, keystone?.name, keystone?.icon)]
      const secondaryRunes = secondarySelections.map((id) =>
        ref(id, runeById.get(id)?.name, runeById.get(id)?.icon),
      )

      return {
        keystone: ref(row.keystone, keystone?.name, keystone?.icon),
        primaryTree: ref(row.primaryStyle, primary?.name, primary?.icon),
        secondaryTree: ref(row.subStyle, secondary?.name, secondary?.icon),
        primaryRunes,
        secondaryRunes,
        fullRunes: stored !== null,
        games: row.games,
        wins: row.wins,
        winRate: row.games === 0 ? 0 : row.wins / row.games,
        lowSample: row.games < MIN_GAMES,
      }
    })

    return {
      version,
      championId,
      championName: me.name,
      pages,
      hasStaticData: true,
      note,
    }
  }
}
