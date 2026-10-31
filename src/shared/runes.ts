import { z } from 'zod'

const RuneSchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string().default(''),
})

const RuneTreeSchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string().default(''),
  slots: z
    .array(
      z.object({
        runes: z.array(RuneSchema).default([]),
      }),
    )
    .default([]),
})

export type Rune = z.infer<typeof RuneSchema>
export type RuneTree = z.infer<typeof RuneTreeSchema>

export function parseRuneTrees(json: unknown): RuneTree[] {
  return z.array(RuneTreeSchema).parse(json)
}

export interface RuneRef {
  id: number
  name: string
  /** Data Dragon path under /cdn/img, or null when rune metadata was unavailable. */
  icon: string | null
}

export const STAT_SHARDS: Record<number, { name: string; icon: string }> = {
  5001: { name: 'Health Scaling', icon: 'perk-images/StatMods/StatModsHealthScalingIcon.png' },
  5002: { name: 'Armor', icon: 'perk-images/StatMods/StatModsArmorIcon.png' },
  5005: { name: 'Attack Speed', icon: 'perk-images/StatMods/StatModsAttackSpeedIcon.png' },
  5007: { name: 'Ability Haste', icon: 'perk-images/StatMods/StatModsCDRScalingIcon.png' },
  5008: { name: 'Adaptive Force', icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png' },
  5010: { name: 'Move Speed', icon: 'perk-images/StatMods/StatModsMovementSpeedIcon.png' },
  5011: { name: 'Health', icon: 'perk-images/StatMods/StatModsHealthIcon.png' },
  5012: { name: 'Magic Resist', icon: 'perk-images/StatMods/StatModsMagicResIcon.png' },
  5013: { name: 'Tenacity', icon: 'perk-images/StatMods/StatModsTenacityIcon.png' },
}

export function statShardRef(id: number): RuneRef {
  const shard = STAT_SHARDS[id]
  return {
    id,
    name: shard?.name ?? `Stat shard ${id}`,
    icon: shard?.icon ?? null,
  }
}

export interface ResearchRuneScope {
  region: string
  rankScope: string
  patch: string
  samplePatch?: string
  fallback?: boolean
  championGames?: number
}

export interface PopularRunePage {
  keystone: RuneRef
  primaryTree: RuneRef
  secondaryTree: RuneRef
  /** All selected primary runes (keystone first), or just the keystone on older matches. */
  primaryRunes: RuneRef[]
  secondaryRunes: RuneRef[]
  /** Every option in the primary tree, row by row. Empty when metadata is unavailable. */
  primarySlots: RuneRef[][]
  /** Every option in the secondary tree, row by row. Empty when metadata is unavailable. */
  secondarySlots: RuneRef[][]
  /** Selected stat shards (offense/flex/defense). */
  statShards: RuneRef[]
  fullRunes: boolean
  games: number
  wins: number
  winRate: number
  /** Share of the champion-role sample; set for research pages. */
  pickRate?: number
  lowSample: boolean
}

export interface RunesResponse {
  version: string | null
  championId: string
  championName: string | null
  pages: PopularRunePage[]
  researchPages: PopularRunePage[]
  researchScope: ResearchRuneScope | null
  hasStaticData: boolean
  note: string | null
}
