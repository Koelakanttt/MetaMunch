import type { DatabaseSync } from 'node:sqlite'
import type {
  PopularRunePage,
  Rune,
  RuneRef,
  RuneSource,
  RuneTree,
  RunesResponse,
  ResearchRuneScope,
} from '@shared/runes'
import { statShardRef } from '@shared/runes'
import { PERSONAL_QUEUES } from '@shared/personal'
import type { ResearchFilters } from '@shared/research'
import {
  DEFAULT_RESEARCH_FILTERS,
  roleScopeLabel,
  tierScopeLabel,
} from '@shared/research'
import type { Role } from '@shared/rules'
import { toPatch } from '@shared/riot'
import { championRoleTotals, researchRuneRows, type ResearchRuneRow } from '../db/research-aggregate-repo'
import {
  previousResearchSnapshot,
  researchSnapshotForPatch,
} from '../db/research-repo'
import type { RunePageRow } from '../db/rune-repo'
import { runePageTotals } from '../db/rune-repo'
import type { RuneDataProvider } from '../providers/rune-data'
import type { StaticDataSource } from './recommendation-service'

const MIN_GAMES = 5
const MIN_RESEARCH_GAMES = 30
const MIN_RESEARCH_CHAMPION_GAMES = 300

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

/** Groups filtered research rows into the rune-page rows the response builder expects. */
function researchRunePages(rows: ResearchRuneRow[]): RunePageRow[] {
  const grouped = new Map<
    string,
    {
      keystone: number
      primaryStyle: number
      subStyle: number
      perks: string
      statPerks: string | null
      games: number
      wins: number
    }
  >()
  for (const row of rows) {
    if (row.keystone <= 0 || row.primaryStyle <= 0 || row.subStyle <= 0) continue
    const perks = JSON.stringify([
      { style: row.primaryStyle, selections: row.primaryRuneIds },
      { style: row.subStyle, selections: row.secondaryRuneIds },
    ])
    const [offense, flex, defense] = row.statShardIds
    const statPerks =
      offense !== undefined && flex !== undefined && defense !== undefined
        ? JSON.stringify({ offense, flex, defense })
        : null
    const key = `${perks}|${statPerks ?? ''}`
    const entry = grouped.get(key) ?? {
      keystone: row.keystone,
      primaryStyle: row.primaryStyle,
      subStyle: row.subStyle,
      perks,
      statPerks,
      games: 0,
      wins: 0,
    }
    entry.games += 1
    if (row.win === 1) entry.wins += 1
    grouped.set(key, entry)
  }
  return [...grouped.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.keystone - b.keystone)
    .slice(0, 6)
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

  async popular(
    championId: string,
    role?: Role,
    opponentId?: string | null,
    source: RuneSource = 'combined',
    filters: ResearchFilters = DEFAULT_RESEARCH_FILTERS,
  ): Promise<RunesResponse> {
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const me = champions.find((champion) => champion.id === championId)
    if (!me) {
      return {
        version,
        championId,
        championName: null,
        source,
        opponentName: null,
        pages: [],
        researchPages: [],
        researchScope: null,
        hasStaticData: version !== null,
        note: null,
      }
    }
    const opponent = opponentId
      ? (champions.find((champion) => champion.id === opponentId) ?? null)
      : null
    const opponentKey = opponent?.key ?? null

    const ownGeneral = runePageTotals(this.db, me.key, PERSONAL_QUEUES, 6, role)
    const ownMatchup =
      opponentKey === null
        ? []
        : runePageTotals(this.db, me.key, PERSONAL_QUEUES, 6, role, opponentKey)
    const rows =
      ownMatchup.some((row) => row.games >= MIN_GAMES) ? ownMatchup : ownGeneral
    const currentPatch = version === null ? null : toPatch(version)
    const currentSnapshot = currentPatch ? researchSnapshotForPatch(this.db, currentPatch) : null
    const previousSnapshot = currentPatch ? previousResearchSnapshot(this.db, currentPatch) : null
    const currentGames =
      currentSnapshot && role
        ? championRoleTotals(this.db, currentSnapshot.id, me.key, role, filters).games
        : 0
    const snapshot =
      currentSnapshot && (currentGames >= MIN_RESEARCH_CHAMPION_GAMES || !previousSnapshot)
        ? currentSnapshot
        : previousSnapshot
    const fallback = snapshot !== null && snapshot !== currentSnapshot
    const generalResearchRows =
      role && snapshot
        ? researchRunePages(
            researchRuneRows(this.db, snapshot.id, me.key, role, filters),
          ).filter((row) => row.games >= MIN_RESEARCH_GAMES)
        : []
    const matchupResearchRows =
      role && snapshot && opponentKey !== null
        ? researchRunePages(
            researchRuneRows(this.db, snapshot.id, me.key, role, filters, opponentKey),
          ).filter((row) => row.games >= MIN_RESEARCH_GAMES)
        : []
    const researchRows =
      matchupResearchRows.length > 0 ? matchupResearchRows : generalResearchRows
    const sampleGames = role && snapshot
      ? championRoleTotals(this.db, snapshot.id, me.key, role, filters).games
      : 0
    const sampleNote =
      source !== 'personal' && snapshot && role && researchRows.length === 0 && sampleGames > 0
        ? `Research sample has ${sampleGames} ${role} games on patch ${snapshot.patch}; 30 are required for rune rankings.`
        : null
    const researchScope: ResearchRuneScope | null =
      researchRows.length > 0 && snapshot
        ? {
            region: snapshot.region,
            rankScope: `${tierScopeLabel(filters)} · ${roleScopeLabel(filters)} · crawl ${snapshot.rankScope}`,
            patch: currentPatch ?? snapshot.patch,
            samplePatch: snapshot.patch,
            fallback,
            championGames: sampleGames,
          }
        : null
    const matchupNote =
      opponent && matchupResearchRows.length === 0 && researchRows.length > 0
        ? `No matchup-specific rune sample vs ${opponent.name}; showing champion baseline.`
        : opponent && source !== 'global' && ownMatchup.length === 0 && rows.length > 0
          ? `No personal matchup rune sample vs ${opponent.name}; showing champion baseline.`
          : null

    if (rows.length === 0 && researchRows.length === 0) {
      return {
        version,
        championId,
        championName: me.name,
        source,
        opponentName: opponent?.name ?? null,
        pages: [],
        researchPages: [],
        researchScope: null,
        hasStaticData: true,
        note: [matchupNote, sampleNote].filter(Boolean).join(' ') || null,
      }
    }

    let trees: RuneTree[] = []
    let note: string | null = [matchupNote, sampleNote].filter(Boolean).join(' ') || null
    if (version !== null) {
      try {
        trees = await this.provider.getRunes(version)
      } catch {
        note = note
          ? `${note} Rune names and icons are unavailable; showing rune ids only.`
          : 'Rune names and icons are unavailable; showing rune ids only.'
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
      source,
      opponentName: opponent?.name ?? null,
      pages: toPages(rows, MIN_GAMES),
      researchPages: toPages(researchRows, MIN_RESEARCH_GAMES, researchScope?.championGames),
      researchScope,
      hasStaticData: true,
      note,
    }
  }
}
