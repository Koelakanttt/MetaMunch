import type { DatabaseSync } from 'node:sqlite'
import type { Champion, Item } from '@shared/ddragon'
import type { EvidenceBundle, ItemEvidence } from '@shared/evidence'
import { itemTraits } from '@shared/item-traits'
import type {
  ResearchBuildSample,
  ResearchItemSample,
  ResearchRuneSample,
} from '@shared/research'
import { wilsonLowerBound } from '@shared/research-stats'
import { toPatch } from '@shared/riot'
import type { Role } from '@shared/rules'
import {
  championRoleTotals,
  itemSamples,
  itemSlotSamples,
  laneSamples,
  runeSamples,
} from '../db/research-aggregate-repo'
import {
  previousResearchSnapshot,
  researchSnapshotForPatch,
} from '../db/research-repo'
import type { StaticDataSource } from './recommendation-service'

const MIN_CURRENT_GAMES = 100
const MIN_OPTION_GAMES = 30
const MIN_LANE_GAMES = 30
const PRIOR_GAMES = 50

export interface EvidenceProvider {
  forChampion(
    champion: Champion,
    role: Role,
    items: readonly Item[],
    opponent?: Champion,
  ): EvidenceBundle | null
}

function confidenceOf(games: number): ItemEvidence['confidence'] {
  if (games >= 200) return 'high'
  if (games >= 50) return 'medium'
  return 'low'
}

function toItemEvidence(
  sample: ResearchItemSample,
  championGames: number,
  championWins: number,
): ItemEvidence {
  const prior = championGames === 0 ? 0 : championWins / championGames
  const smoothed = (sample.wins + PRIOR_GAMES * prior) / (sample.games + PRIOR_GAMES)
  return {
    itemId: sample.itemId,
    games: sample.games,
    wins: sample.wins,
    winRate: sample.winRate,
    smoothedWinRate: smoothed,
    deltaWinRate: smoothed - prior,
    pickRate: sample.pickRate,
    confidence: confidenceOf(sample.games),
  }
}

function isBoot(item: Item | undefined): boolean {
  if (!item) return false
  return item.tags.includes('Boots') || itemTraits(item).includes('boots')
}

function byPickRate(a: ResearchItemSample, b: ResearchItemSample): number {
  return (
    b.pickRate - a.pickRate ||
    wilsonLowerBound(b.wins, b.games) - wilsonLowerBound(a.wins, a.games) ||
    b.games - a.games ||
    a.itemId - b.itemId
  )
}

function buildSample(
  items: readonly Item[],
  slots: ResearchItemSample[],
  overall: ResearchItemSample[],
  runes: ResearchRuneSample[],
  lanes: { enemyId: string; enemyName: string; games: number; wins: number; winRate: number }[],
): Pick<ResearchBuildSample, 'items' | 'boots' | 'rune' | 'lanes'> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const eligible = slots.filter((sample) => sample.games >= MIN_OPTION_GAMES)
  const core: ResearchItemSample[] = []
  const used = new Set<number>()
  for (let slot = 0; slot < 6 && core.length < 4; slot += 1) {
    const candidate = eligible
      .filter((sample) => sample.slot === slot && !used.has(sample.itemId))
      .sort(byPickRate)[0]
    if (!candidate || isBoot(byId.get(candidate.itemId))) continue
    core.push(candidate)
    used.add(candidate.itemId)
  }
  for (const candidate of [...overall].sort(byPickRate)) {
    if (core.length >= 4) break
    if (candidate.games < MIN_OPTION_GAMES || used.has(candidate.itemId)) continue
    if (isBoot(byId.get(candidate.itemId))) continue
    core.push({ ...candidate, slot: -1 })
    used.add(candidate.itemId)
  }

  const boots = overall
    .filter((sample) => sample.games >= MIN_OPTION_GAMES && isBoot(byId.get(sample.itemId)))
    .sort(byPickRate)[0] ?? null
  const rune = runes.filter((sample) => sample.games >= MIN_OPTION_GAMES)[0] ?? null
  return {
    items: core,
    boots,
    rune,
    lanes: lanes
      .filter((lane) => lane.games >= MIN_LANE_GAMES)
      .sort((a, b) => b.games - a.games || a.enemyName.localeCompare(b.enemyName)),
  }
}

/** Reads the research sample for one champion-role, with a labeled previous-patch fallback. */
export class ResearchEvidenceProvider implements EvidenceProvider {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource

  constructor(deps: { db: DatabaseSync; source: StaticDataSource }) {
    this.db = deps.db
    this.source = deps.source
  }

  forChampion(
    champion: Champion,
    role: Role,
    items: readonly Item[],
    opponent?: Champion,
  ): EvidenceBundle | null {
    const version = this.source.latestVersion()
    if (version === null) return null
    const currentPatch = toPatch(version)
    const current = researchSnapshotForPatch(this.db, currentPatch)
    const previous = previousResearchSnapshot(this.db, currentPatch)

    let snapshot = current
    let totals = snapshot
      ? championRoleTotals(this.db, snapshot.id, champion.key, role)
      : { games: 0, wins: 0 }
    let fallback = false
    if (!snapshot || totals.games < MIN_CURRENT_GAMES) {
      if (!previous) return null
      const previousTotals = championRoleTotals(this.db, previous.id, champion.key, role)
      if (previousTotals.games < MIN_OPTION_GAMES) return null
      snapshot = previous
      totals = previousTotals
      fallback = true
    }
    if (!snapshot || totals.games < MIN_OPTION_GAMES) return null

    const slots = itemSlotSamples(this.db, snapshot.id, champion.key, role)
    const overall = itemSamples(this.db, snapshot.id, champion.key, role)
    const runes = runeSamples(this.db, snapshot.id, champion.key, role)
    const champions = this.source.champions(version)
    const byKey = new Map(champions.map((entry) => [entry.key, entry]))
    const lanes = laneSamples(this.db, snapshot.id, champion.key, role).map((lane) => ({
      enemyId: byKey.get(lane.enemyChampionKey)?.id ?? String(lane.enemyChampionKey),
      enemyName: byKey.get(lane.enemyChampionKey)?.name ?? `Champion ${lane.enemyChampionKey}`,
      games: lane.games,
      wins: lane.wins,
      winRate: lane.winRate,
    }))
    const built = buildSample(items, slots, overall, runes, lanes)
    const research: ResearchBuildSample = {
      scope: {
        patch: currentPatch,
        samplePatch: snapshot.patch,
        region: snapshot.region,
        rankScope: snapshot.rankScope,
        championGames: totals.games,
        fallback,
      },
      games: totals.games,
      wins: totals.wins,
      ...built,
    }

    const evidence = new Map<number, ItemEvidence>()
    for (const sample of overall) {
      evidence.set(sample.itemId, toItemEvidence(sample, totals.games, totals.wins))
    }

    const bundle: EvidenceBundle = {
      scope: {
        patch: currentPatch,
        samplePatch: snapshot.patch,
        fallback,
        region: snapshot.region,
        queueId: snapshot.queueId,
        rankScope: snapshot.rankScope,
        championGames: totals.games,
      },
      items: evidence,
      research,
    }

    if (opponent) {
      const lane = lanes.find((entry) => entry.enemyId === opponent.id)
      if (lane && lane.games >= MIN_LANE_GAMES) {
        const prior = totals.games === 0 ? 0 : totals.wins / totals.games
        const smoothed = (lane.wins + PRIOR_GAMES * prior) / (lane.games + PRIOR_GAMES)
        bundle.lane = {
          enemyId: opponent.id,
          enemyName: opponent.name,
          games: lane.games,
          wins: lane.wins,
          winRate: lane.winRate,
          deltaWinRate: smoothed - prior,
          confidence: confidenceOf(lane.games),
        }
      }
    }
    return bundle
  }
}
