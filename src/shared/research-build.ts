import type { ResearchFilters, ResearchItemSample, ResearchRuneSample } from './research'
import { HIGHEST_WIN_MIN_GAMES } from './research'
import { wilsonLowerBound } from './research-stats'

/** Minimum conditioned games behind one build step. */
export const MIN_CORE_GAMES = 60
/** Minimum games behind one alternative option (keeps the 30-game rule). */
export const MIN_OPTION_GAMES = 30
/** A lane matchup sample must reach this many games before it replaces the champion-role build. */
export const MIN_MATCHUP_GAMES = 60
/** Levels 1-15 are shown for the common skill order. */
export const SKILL_ORDER_LENGTH = 15

export type BuildOrder = 'pick' | 'win'

/** One compact timeline sample of the filtered champion-role. */
export interface ResearchTimelineSample {
  matchId: string
  win: boolean
  purchaseOrder: number[]
  startingItems: number[]
  skillOrder: string
  spells: number[]
}

export interface BuildOption {
  itemId: number
  games: number
  wins: number
  winRate: number
  pickRate: number
  winRateLow: number
}

export interface BuildStartingSet {
  itemIds: number[]
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface BuildCoreStep {
  slot: number
  itemId: number
  games: number
  wins: number
  winRate: number
  winRateLow: number
  /** Share of the conditioned sample that bought this item in this slot. */
  pickRate: number
  /** Games that had the prefix up to this step. */
  conditionedGames: number
}

export interface BuildCoreResult {
  steps: BuildCoreStep[]
  /** How many leading steps stayed at or above the minimum sample. */
  reliableUpTo: number
  /** Games behind the next (unreliable) step, or the total sample when nothing was built. */
  conditionedGames: number
  note: string | null
}

export interface BuildLaterSlot {
  slot: number
  options: BuildOption[]
}

export interface SkillPriorityEntry {
  ability: 'Q' | 'W' | 'E'
  games: number
  wins: number
  pickRate: number
  winRate: number
}

export interface SkillOrderEntry {
  slots: string
  games: number
  wins: number
  winRate: number
}

export interface SpellPairEntry {
  spells: number[]
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface ResearchBuildScope {
  patch: string
  samplePatch: string
  fallback: boolean
  tierScope: string
  roleScope: string
  filters: ResearchFilters
  /** Timeline games behind this model. */
  games: number
  laneMatchup: boolean
  opponentId: string | null
  matchupGames: number
  note: string | null
}

export interface ResearchBuildModel {
  championId: string
  role: string
  scope: ResearchBuildScope
  hasTimelines: boolean
  /** Set when no timeline sample exists at all. */
  note: string | null
  starting: BuildStartingSet[]
  core: BuildCoreResult
  highestWin: BuildCoreResult | null
  highestWinNote: string | null
  laterSlots: BuildLaterSlot[]
  skillPriority: SkillPriorityEntry[]
  skillOrders: SkillOrderEntry[]
  spellPairs: SpellPairEntry[]
  /** Final-item inclusion, always available from the match rows. */
  finalItems: ResearchItemSample[]
  runePages: ResearchRuneSample[]
}

function winRateOf(wins: number, games: number): number {
  return games === 0 ? 0 : wins / games
}

function byPickThenWin<T extends { games: number; wins: number; itemId?: number }>(
  a: T,
  b: T,
): number {
  return (
    b.games - a.games ||
    wilsonLowerBound(b.wins, b.games) - wilsonLowerBound(a.wins, a.games) ||
    (a.itemId ?? 0) - (b.itemId ?? 0)
  )
}

/** Most common starting-item sets, largest sample first. */
export function startingSets(
  samples: readonly ResearchTimelineSample[],
  limit = 3,
): BuildStartingSet[] {
  const groups = new Map<string, { itemIds: number[]; games: number; wins: number }>()
  for (const sample of samples) {
    if (sample.startingItems.length === 0) continue
    const key = sample.startingItems.join(',')
    const entry = groups.get(key) ?? { itemIds: sample.startingItems, games: 0, wins: 0 }
    entry.games += 1
    if (sample.win) entry.wins += 1
    groups.set(key, entry)
  }
  return [...groups.values()]
    .sort(byPickThenWin)
    .slice(0, limit)
    .map((entry) => ({
      itemIds: entry.itemIds,
      games: entry.games,
      wins: entry.wins,
      winRate: winRateOf(entry.wins, entry.games),
      pickRate: samples.length === 0 ? 0 : entry.games / samples.length,
    }))
}

/**
 * Greedy ordered core: each step is chosen among games that followed the previous step.
 * The build stops before a step whose conditioned sample is below `minGames`.
 */
export function greedyBuild(
  samples: readonly ResearchTimelineSample[],
  order: BuildOrder,
  minGames = MIN_CORE_GAMES,
): BuildCoreResult {
  if (samples.length < minGames) {
    return {
      steps: [],
      reliableUpTo: 0,
      conditionedGames: samples.length,
      note: `Timeline sample has ${samples.length} games; ${minGames} are required for a build order.`,
    }
  }

  const steps: BuildCoreStep[] = []
  let conditioned = samples
  let note: string | null = null
  for (let slot = 0; slot < 3; slot += 1) {
    const counted = conditioned.filter((sample) => sample.purchaseOrder.length > slot)
    if (counted.length < minGames) {
      note =
        steps.length > 0
          ? `Build order reliable up to item ${steps.length}, ${counted.length} games.`
          : `Timeline sample has ${counted.length} games with ${slot + 1} completed items; ${minGames} are required for a build order.`
      conditioned = counted
      break
    }
    const groups = new Map<number, { games: number; wins: number }>()
    for (const sample of counted) {
      const itemId = sample.purchaseOrder[slot]
      if (itemId === undefined) continue
      const entry = groups.get(itemId) ?? { games: 0, wins: 0 }
      entry.games += 1
      if (sample.win) entry.wins += 1
      groups.set(itemId, entry)
    }
    const ranked = [...groups.entries()]
      .map(([itemId, entry]) => ({
        itemId,
        games: entry.games,
        wins: entry.wins,
        winRate: winRateOf(entry.wins, entry.games),
        winRateLow: wilsonLowerBound(entry.wins, entry.games),
      }))
      .sort(
        order === 'win'
          ? (a, b) =>
              b.winRateLow - a.winRateLow ||
              b.games - a.games ||
              a.itemId - b.itemId
          : byPickThenWin,
      )
    const chosen = ranked[0]
    if (!chosen) {
      conditioned = counted
      break
    }
    steps.push({
      slot,
      itemId: chosen.itemId,
      games: chosen.games,
      wins: chosen.wins,
      winRate: chosen.winRate,
      winRateLow: chosen.winRateLow,
      pickRate: counted.length === 0 ? 0 : chosen.games / counted.length,
      conditionedGames: counted.length,
    })
    conditioned = counted.filter((sample) => sample.purchaseOrder[slot] === chosen.itemId)
    if (conditioned.length < minGames) {
      note = `Build order reliable up to item ${steps.length}, ${conditioned.length} games.`
      break
    }
  }

  return {
    steps,
    reliableUpTo: steps.length,
    conditionedGames: conditioned.length,
    note,
  }
}

/** Highest-win build: same greedy steps ordered by the Wilson lower bound, 300+ conditioned games. */
export function highestWinBuild(
  samples: readonly ResearchTimelineSample[],
): { result: BuildCoreResult | null; note: string | null } {
  const result = greedyBuild(samples, 'win', HIGHEST_WIN_MIN_GAMES)
  if (result.steps.length === 3) return { result, note: result.note }
  return {
    result: null,
    note:
      samples.length < HIGHEST_WIN_MIN_GAMES
        ? `Not enough games for the highest-win build (needs ${HIGHEST_WIN_MIN_GAMES}).`
        : `Highest-win build needs ${HIGHEST_WIN_MIN_GAMES} conditioned games per step.`,
  }
}

/** Item 4/5/6 alternatives among games that already contain the whole core. */
export function laterSlotOptions(
  samples: readonly ResearchTimelineSample[],
  core: readonly number[],
  limit = 3,
  minGames = MIN_OPTION_GAMES,
): BuildLaterSlot[] {
  if (core.length === 0) return []
  const withCore = samples.filter((sample) =>
    core.every((itemId) => sample.purchaseOrder.includes(itemId)),
  )
  const slots: BuildLaterSlot[] = []
  for (let slot = 3; slot < 6; slot += 1) {
    const counted = withCore.filter((sample) => sample.purchaseOrder.length > slot)
    if (counted.length < minGames) continue
    const groups = new Map<number, { games: number; wins: number }>()
    for (const sample of counted) {
      const itemId = sample.purchaseOrder[slot]
      if (itemId === undefined || core.includes(itemId)) continue
      const entry = groups.get(itemId) ?? { games: 0, wins: 0 }
      entry.games += 1
      if (sample.win) entry.wins += 1
      groups.set(itemId, entry)
    }
    const options = [...groups.entries()]
      .map(([itemId, entry]) => ({
        itemId,
        games: entry.games,
        wins: entry.wins,
        winRate: winRateOf(entry.wins, entry.games),
        pickRate: entry.games / counted.length,
        winRateLow: wilsonLowerBound(entry.wins, entry.games),
      }))
      .sort(byPickThenWin)
      .slice(0, limit)
    if (options.length > 0) slots.push({ slot, options })
  }
  return slots
}

const ABILITIES = ['Q', 'W', 'E'] as const

/** Which of Q/W/E reached five points first. */
export function firstMaxedAbility(order: string): 'Q' | 'W' | 'E' | null {
  const counts: Record<'Q' | 'W' | 'E', number> = { Q: 0, W: 0, E: 0 }
  for (const character of order) {
    if (character !== 'Q' && character !== 'W' && character !== 'E') continue
    counts[character] += 1
    if (counts[character] >= 5) return character
  }
  return null
}

export function skillPriority(
  samples: readonly ResearchTimelineSample[],
): SkillPriorityEntry[] {
  const groups = new Map<'Q' | 'W' | 'E', { games: number; wins: number }>()
  for (const sample of samples) {
    const ability = firstMaxedAbility(sample.skillOrder)
    if (ability === null) continue
    const entry = groups.get(ability) ?? { games: 0, wins: 0 }
    entry.games += 1
    if (sample.win) entry.wins += 1
    groups.set(ability, entry)
  }
  const total = [...groups.values()].reduce((sum, entry) => sum + entry.games, 0)
  return ABILITIES.flatMap((ability) => {
    const entry = groups.get(ability)
    if (!entry) return []
    return [
      {
        ability,
        games: entry.games,
        wins: entry.wins,
        pickRate: total === 0 ? 0 : entry.games / total,
        winRate: winRateOf(entry.wins, entry.games),
      },
    ]
  }).sort((a, b) => b.games - a.games || a.ability.localeCompare(b.ability))
}

/** Most common level 1-15 skill order. */
export function skillOrders(
  samples: readonly ResearchTimelineSample[],
  limit = 3,
): SkillOrderEntry[] {
  const groups = new Map<string, { games: number; wins: number }>()
  for (const sample of samples) {
    if (sample.skillOrder.length < SKILL_ORDER_LENGTH) continue
    const key = sample.skillOrder.slice(0, SKILL_ORDER_LENGTH)
    const entry = groups.get(key) ?? { games: 0, wins: 0 }
    entry.games += 1
    if (sample.win) entry.wins += 1
    groups.set(key, entry)
  }
  return [...groups.entries()]
    .map(([slots, entry]) => ({
      slots,
      games: entry.games,
      wins: entry.wins,
      winRate: winRateOf(entry.wins, entry.games),
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, limit)
}

/** Most common summoner spell pairs. */
export function spellPairs(
  samples: readonly ResearchTimelineSample[],
  limit = 3,
): SpellPairEntry[] {
  const groups = new Map<string, { spells: number[]; games: number; wins: number }>()
  let total = 0
  for (const sample of samples) {
    if (sample.spells.length < 2) continue
    total += 1
    const spells = [...sample.spells].sort((a, b) => a - b)
    const key = spells.join(',')
    const entry = groups.get(key) ?? { spells, games: 0, wins: 0 }
    entry.games += 1
    if (sample.win) entry.wins += 1
    groups.set(key, entry)
  }
  return [...groups.values()]
    .sort(byPickThenWin)
    .slice(0, limit)
    .map((entry) => ({
      spells: entry.spells,
      games: entry.games,
      wins: entry.wins,
      winRate: winRateOf(entry.wins, entry.games),
      pickRate: total === 0 ? 0 : entry.games / total,
    }))
}

/** Order of `options` for the Highest-win view; callers gate it on the sample size. */
export function orderBuildOptions(
  options: readonly BuildOption[],
  order: BuildOrder,
): BuildOption[] {
  if (order === 'pick') return [...options].sort(byPickThenWin)
  return [...options].sort(
    (a, b) => b.winRateLow - a.winRateLow || b.games - a.games || a.itemId - b.itemId,
  )
}
