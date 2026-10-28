export interface SynergyEntry {
  championId: string
  name: string
  games: number
  wins: number
  winRate: number
  lowSample: boolean
}

export interface SynergiesResponse {
  championId: string
  championName: string | null
  best: SynergyEntry[]
  worst: SynergyEntry[]
  all: SynergyEntry[]
  hasStaticData: boolean
}
