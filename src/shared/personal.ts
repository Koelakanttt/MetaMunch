import type { Item } from './ddragon'
import { buildItemPool } from './item-traits'

/** Queues used for personal statistics: normal draft, ranked solo, ranked flex. */
export const PERSONAL_QUEUES: readonly number[] = [400, 420, 440]
/** Below this many games a number is shown with a "low sample" mark. */
export const LOW_SAMPLE_GAMES = 5
/** Weight of the account-average prior when smoothing a champion win rate. */
export const WINRATE_PRIOR_GAMES = 5

export interface MyGame {
  matchId: string
  win: boolean
  teamId: number
  items: number[] // 6 slots, 0 = empty
  patch: string
  gameCreation: number
}

export interface BuildEntry {
  itemId: number
  name: string
  games: number // in how many of my games on this champion the item was in the final build
}

export interface MatchupEntry {
  enemyId: string
  enemyName: string
  games: number
  wins: number
  lowSample: boolean
}

export interface PersonalStats {
  account: string // "Name#TAG"
  games: number
  wins: number
  lowSample: boolean
  /** Win rate shrunk toward the account average; use it on small samples (0..1). */
  adjustedWinRate: number
  build: BuildEntry[]
  vs: MatchupEntry[]
}

export function isLowSample(games: number): boolean {
  return games < LOW_SAMPLE_GAMES
}

/** Win rate shrunk toward `priorWinRate`; small samples move toward the prior, large ones barely. */
export function smoothWinRate(games: number, wins: number, priorWinRate: number): number {
  if (games <= 0) return priorWinRate
  return (wins + WINRATE_PRIOR_GAMES * priorWinRate) / (games + WINRATE_PRIOR_GAMES)
}

/**
 * Most frequent completed items (and boots) in my final builds on one champion.
 * Items are matched by NAME against the latest patch pool, so mode/price variants of an item
 * count together and items that no longer exist are ignored.
 */
export function summarizeBuild(games: readonly MyGame[], items: readonly Item[], top = 6): BuildEntry[] {
  const pool = buildItemPool(items)
  const nameById = new Map<number, string>()
  for (const item of items) nameById.set(item.id, item.name)
  const representative = new Map<string, number>() // name -> id kept in the pool
  for (const item of [...pool.items, ...pool.boots]) representative.set(item.name, item.id)

  const counts = new Map<string, number>()
  for (const game of games) {
    const namesInGame = new Set<string>()
    for (const id of game.items) {
      const name = nameById.get(id)
      if (name !== undefined && representative.has(name)) namesInGame.add(name)
    }
    for (const name of namesInGame) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([name, count]) => ({ itemId: representative.get(name) as number, name, games: count }))
}
