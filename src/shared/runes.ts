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

export interface PopularRunePage {
  keystone: RuneRef
  primaryTree: RuneRef
  secondaryTree: RuneRef
  /** All selected primary runes (keystone first), or just the keystone on older matches. */
  primaryRunes: RuneRef[]
  secondaryRunes: RuneRef[]
  fullRunes: boolean
  games: number
  wins: number
  winRate: number
  lowSample: boolean
}

export interface RunesResponse {
  version: string | null
  championId: string
  championName: string | null
  pages: PopularRunePage[]
  hasStaticData: boolean
  note: string | null
}
