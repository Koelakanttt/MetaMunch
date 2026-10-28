export interface MatchHistoryItem {
  id: number
  name: string
}

export interface MatchHistoryEntry {
  matchId: string
  championId: string
  championName: string
  position: string
  win: boolean
  queueId: number
  patch: string
  gameCreation: number
  durationSec: number
  items: MatchHistoryItem[]
}

export interface MatchHistoryFilters {
  championId?: string
  position?: string
  patch?: string
  queue?: number
  limit?: number
}

export interface MatchHistoryResponse {
  account: { gameName: string; tagLine: string } | null
  entries: MatchHistoryEntry[]
  /** Patches present in the stored matches, newest first. */
  patches: string[]
  hasStaticData: boolean
}
