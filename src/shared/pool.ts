export interface PoolEntry {
  championId: string
  name: string
  games: number
  wins: number
  lowSample: boolean
  adjustedWinRate: number
  lastGameCreation: number
}

export interface PoolOverall {
  games: number
  wins: number
  lowSample: boolean
  adjustedWinRate: number
}

export interface PoolResponse {
  account: { gameName: string; tagLine: string } | null
  overall: PoolOverall | null
  entries: PoolEntry[]
  /** False when Data Dragon data is missing, so entries cannot be named. */
  hasStaticData: boolean
}
