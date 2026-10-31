export type EvidenceConfidence = 'low' | 'medium' | 'high'

export interface ItemEvidence {
  itemId: number
  games: number
  wins: number
  winRate: number
  smoothedWinRate: number
  deltaWinRate: number
  pickRate: number
  confidence: EvidenceConfidence
}

export interface LaneEvidence {
  enemyId: string
  enemyName: string
  games: number
  wins: number
  winRate: number
  deltaWinRate: number
  confidence: EvidenceConfidence
}

export interface EvidenceScope {
  patch: string
  region: string
  queueId: number
  rankScope: string
  championGames: number
  /** Patch actually used when the current patch had fewer than 100 champion-role games. */
  samplePatch?: string
  fallback?: boolean
}

export interface EvidenceBundle {
  scope: EvidenceScope
  items: Map<number, ItemEvidence>
  lane?: LaneEvidence
  research?: import('./research').ResearchBuildSample
}
