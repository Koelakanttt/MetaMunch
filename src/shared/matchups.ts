export interface MatchupEntry {
  championId: string
  name: string
  games: number
  wins: number
  winRate: number
  lowSample: boolean
}

export interface MatchupsResponse {
  championId: string
  championName: string | null
  strong: MatchupEntry[]
  weak: MatchupEntry[]
  all: MatchupEntry[]
  hasStaticData: boolean
}
