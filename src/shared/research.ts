export type ResearchCrawlState = 'idle' | 'running' | 'paused' | 'stopped' | 'complete'

export interface ResearchSnapshot {
  id: number
  patch: string
  region: string
  queueId: number
  rankScope: string
  createdAt: number
  targetMatches: number
}

export interface ResearchCoverageRow {
  championId: string
  name: string
  role: string
  games: number
  wins: number
  pickRate: number
  roleGames: number
}

export interface ResearchStatus {
  snapshot: ResearchSnapshot | null
  matches: number
  participants: number
  bans: number
  timelineEvents: number
  state: ResearchCrawlState
  patch: string | null
  targetMatches: number
  dailyRequestCap: number
  requestsToday: number
  requestsPerMinute: number
  etaSeconds: number | null
  startedAt: number | null
  updatedAt: number
  lastError: string | null
  emeraldPlus: boolean
  seedsExhausted: boolean
  coverage: ResearchCoverageRow[]
}

export interface ResearchCollectResult {
  snapshotId: number
  requested: number
  saved: number
  skipped: number
  failed: number
  seedPlayers: number
  state: ResearchCrawlState
}

export interface ResearchChampionStat {
  championId: string
  name: string
  games: number
  wins: number
  winRate: number
  pickRate: number
  banRate: number
}

export interface ResearchItemStat {
  itemId: number
  name: string
  purchases: number
  wins: number
  winRate: number
  inclusionRate: number
}

export interface ResearchSummary {
  status: ResearchStatus
  champions: ResearchChampionStat[]
  items: ResearchItemStat[]
}

/** A slot-wise final-item sample from the research crawl. */
export interface ResearchItemSample {
  itemId: number
  slot: number
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface ResearchRuneSample {
  keystone: number
  primaryStyle: number
  subStyle: number
  runeIds: number[]
  statShardIds: number[]
  games: number
  wins: number
  winRate: number
  pickRate: number
}

export interface ResearchLaneSample {
  enemyId: string
  enemyName: string
  games: number
  wins: number
  winRate: number
}

export interface ResearchSampleScope {
  patch: string
  /** Patch actually used; differs when the current patch has fewer than 100 games. */
  samplePatch: string
  region: string
  rankScope: string
  championGames: number
  fallback: boolean
}

export interface ResearchBuildSample {
  scope: ResearchSampleScope
  games: number
  wins: number
  items: ResearchItemSample[]
  boots: ResearchItemSample | null
  rune: ResearchRuneSample | null
  lanes: ResearchLaneSample[]
}
