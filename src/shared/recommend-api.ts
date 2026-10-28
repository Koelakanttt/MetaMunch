import { z } from 'zod'
import type { PersonalStats } from './personal'
import type { Archetype, Damage, EnemyProfile } from './recommend'
import { ROLES, type Metric } from './rules'

export const RecommendRequestSchema = z.object({
  meId: z.string().min(1), // Data Dragon champion id, e.g. "MonkeyKing"
  role: z.enum(ROLES),
  enemyIds: z.array(z.string().min(1)).max(5),
})
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>

export interface ChampionSummary {
  id: string
  name: string
  tags: string[]
}

export interface ChampionListResponse {
  version: string | null // null when no static data is stored yet
  champions: ChampionSummary[] // sorted by name
}

export interface RecommendationView {
  itemId: number
  name: string
  source: 'rules' | 'core' | 'personal'
  reasons: string[]
  ruleIds: string[]
  score: number
  gold: number
  plaintext: string
  stats: Record<string, number>
}

export interface RecommendResponse {
  version: string
  level: 'rules' | 'core'
  me: { id: string; name: string; damage: Damage; archetype: Archetype }
  profile: { metrics: Record<Metric, number>; names: EnemyProfile['names'] }
  core: RecommendationView[]
  items: RecommendationView[]
  boots: RecommendationView[]
  personal: PersonalStats | null // null when no account is tracked
}

/** Validates an untrusted IPC payload. Throws an Error with a readable message. */
export function parseRecommendRequest(json: unknown): RecommendRequest {
  const result = RecommendRequestSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue && issue.path.length > 0 ? ` (${issue.path.join('.')})` : ''
    throw new Error(`Invalid request${where}: ${issue?.message ?? 'bad shape'}`)
  }
  return result.data
}
