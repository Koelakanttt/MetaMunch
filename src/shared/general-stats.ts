export interface GeneralStatsFilters {
  patch?: string
  queue?: number
}

export interface ChampionStat {
  championId: string
  name: string
  picks: number
  wins: number
  pickRate: number
  winRate: number
}

export interface ItemStat {
  itemId: number
  name: string
  purchases: number
  wins: number
  winRate: number
}

export interface GeneralStatsSample {
  matches: number
  picks: number
}

export type StatsSourceKind = 'own' | 'external'

export interface GeneralStatsResponse {
  sample: GeneralStatsSample
  /** Patches present in the stored sample, newest first. */
  patches: string[]
  champions: ChampionStat[]
  items: ItemStat[]
  hasStaticData: boolean
  source: StatsSourceKind
  /** Human-readable fallback or source note, if any. */
  note: string | null
}
