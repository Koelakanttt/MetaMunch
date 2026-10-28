import type { LiveItem } from './live-game'

export interface PostGameChange {
  label: string
  before: string
  after: string
}

export interface PostGameMatch {
  matchId: string
  championId: string | null
  championName: string | null
  position: string
  win: boolean
  queueId: number
  patch: string
  gameCreation: number
  durationSec: number
  items: LiveItem[]
}

export interface PostGameReview {
  match: PostGameMatch
  recommended: { name: string; source: string }[]
  missed: string[]
  /** Null when the patch comparison is unavailable (no network, no previous patch). */
  patchChanges: PostGameChange[] | null
}

export type PostGameResult =
  | { state: 'no-account' }
  | { state: 'no-matches' }
  | { state: 'ready'; review: PostGameReview }
