import type { DatabaseSync } from 'node:sqlite'
import type {
  PopularRunePage,
  Rune,
  RuneRef,
  RuneTree,
  RunesResponse,
  ResearchRuneScope,
} from '@shared/runes'
import { statShardRef } from '@shared/runes'
import type { Role } from '@shared/rules'
import { toPatch } from '@shared/riot'
import { championRoleTotals } from '../db/research-aggregate-repo'
import {
  previousResearchSnapshot,
  researchSnapshotForPatch,
} from '../db/research-repo'
import { researchRunePageTotals } from '../db/research-rune-repo'
import type { RunePageRow } from '../db/rune-repo'
import { runePageTotals } from '../db/rune-repo'
import type { RuneDataProvider } from '../providers/rune-data'
import type { StaticDataSource } from './recommendation-service'

const MIN_GAMES = 5
const MIN_RESEARCH_GAMES = 30
const MIN_RESEARCH_CHAMPION_GAMES = 100

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

function parseStatShards(value: string | null | undefined): RuneRef[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null) return []
    const record = parsed as Record<string, unknown>
    return ['offense', 'flex', 'defense']
      .map((key) => record[key])
      .filter((id): id is number => typeof id === 'number')
      .map(statShardRef)
  } catch {
    return []
  }
}

function ref(id: number, name: string | undefined, icon: string | undefined): RuneRef {
  return {
    id,
    name: name ?? `Rune ${id}`,
    icon: icon && icon.length > 0 ? icon : null,
  }
}

function treeSlots(
  tree: RuneTree | undefined,
  runeById: ReadonlyMap<number, Rune>,
): RuneRef[][] {
  if (!tree) return []
  return tree.slots.map((slot) =>
    slot.runes.map((rune) => ref(rune.id, runeById.get(rune.id)?.name, runeById.get(rune.id)?.icon)),
  )
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

  async popular(championId: string, role?: Role): Promise<RunesResponse> {
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const me = champions.find((champion) => champion.id === championId)
    if (!me) {
      return {
        version,
        championId,
        championName: null,
        pages: [],
        researchPages: [],
        researchScope: null,
        hasStaticData: version !== null,
        note: null,
      }
    }

    const rows = runePageTotals(this.db, me.key)
    const currentPatch = version === null ? null : toPatch(version)
    const currentSnapshot = currentPatch ? researchSnapshotForPatch(this.db, currentPatch) : null
    const previousSnapshot = currentPatch ? previousResearchSnapshot(this.db, currentPatch) : null
    const currentGames =
      currentSnapshot && role
        ? championRoleTotals(this.db, currentSnapshot.id, me.key, role).games
        : 0
    const snapshot =
      currentSnapshot && currentGames >= MIN_RESEARCH_CHAMPION_GAMES
        ? currentSnapshot
        : previousSnapshot
    const fallback = snapshot !== null && snapshot !== currentSnapshot
    const researchRows =
      role && snapshot
        ? researchRunePageTotals(this.db, snapshot.id, me.key, role).filter(
            (row) => row.games >= MIN_RESEARCH_GAMES,
          )
        : []
    const sampleGames = role && snapshot
      ? championRoleTotals(this.db, snapshot.id, me.key, role).games
      : 0
    const researchScope: ResearchRuneScope | null =
      researchRows.length > 0 && snapshot
        ? {
            region: snapshot.region,
            rankScope: snapshot.rankScope,
            patch: currentPatch ?? snapshot.patch,
            samplePatch: snapshot.patch,
            fallback,
            championGames: sampleGames,
          }
        : null

    if (rows.length === 0 && researchRows.length === 0) {
      return {
        version,
        championId,
        championName: me.name,
        pages: [],
        researchPages: [],
        researchScope: null,
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

    const toPages = (
      pageRows: RunePageRow[],
      lowSampleBelow: number,
      totalGames?: number,
    ): PopularRunePage[] =>
      pageRows
        .map((row) => {
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
          primarySlots: treeSlots(primary, runeById),
          secondarySlots: treeSlots(secondary, runeById).slice(1),
          statShards: parseStatShards(row.statPerks),
          fullRunes: stored !== null,
          games: row.games,
          wins: row.wins,
          winRate: row.games === 0 ? 0 : row.wins / row.games,
          ...(totalGames !== undefined && totalGames > 0
            ? { pickRate: row.games / totalGames }
            : {}),
          lowSample: row.games < lowSampleBelow,
        }
        })
        .sort(
          (a, b) =>
            Number(a.lowSample) - Number(b.lowSample) ||
            b.games - a.games ||
            a.keystone.id - b.keystone.id,
        )

    return {
      version,
      championId,
      championName: me.name,
      pages: toPages(rows, MIN_GAMES),
      researchPages: toPages(researchRows, MIN_RESEARCH_GAMES, researchScope?.championGames),
      researchScope,
      hasStaticData: true,
      note,
    }
  }
}
