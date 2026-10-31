export interface MatchTimelinePurchase {
  itemId: number
  name: string
  seconds: number
}

export interface MatchTimelineSkill {
  slot: string
  level: number
  seconds: number
}

export interface MatchTimelineResponse {
  matchId: string
  hasTimeline: boolean
  purchases: MatchTimelinePurchase[]
  skills: MatchTimelineSkill[]
}
