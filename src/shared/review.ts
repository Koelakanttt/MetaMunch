import type { TimelineReviewView } from './swing'

export const REVIEW_CHECKLIST_KEYS = [
  'died_too_much',
  'missed_cs',
  'bad_recall',
  'lost_vision',
  'poor_teamfight',
] as const

export type ReviewChecklistKey = (typeof REVIEW_CHECKLIST_KEYS)[number]
export type ReviewChecklist = Record<ReviewChecklistKey, boolean>

export interface MatchReview {
  matchId: string
  fixText: string
  checklist: ReviewChecklist
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface MatchReviewInput {
  fixText: string
  checklist: Partial<ReviewChecklist>
  tags: string[]
}

export interface MatchReviewHeader {
  matchId: string
  championId: string | null
  championName: string | null
  position: string
  win: boolean
  queueId: number
  patch: string
  gameCreation: number
  durationSec: number
  items: { id: number; name: string }[]
}

export interface MatchReviewView {
  match: MatchReviewHeader
  timeline: TimelineReviewView | null
  review: MatchReview | null
}
