import { z } from 'zod'

export interface SpellDetail {
  id: string
  name: string
  cooldown: number[]
  cost: number[]
  range: number[]
  effects: number[][]
}

export interface ChampionDetail {
  id: string
  name: string
  stats: Record<string, number>
  passiveName: string
  spells: SpellDetail[]
}

const SpellRaw = z.object({
  id: z.string(),
  name: z.string(),
  cooldown: z.array(z.number()).default([]),
  cost: z.array(z.number()).default([]),
  range: z.array(z.number()).default([]),
  effect: z.array(z.array(z.number()).nullable()).default([]),
})

const ChampionRaw = z.object({
  id: z.string(),
  name: z.string(),
  stats: z.record(z.string(), z.number()).default({}),
  passive: z.object({ name: z.string() }).default({ name: '' }),
  spells: z.array(SpellRaw).default([]),
})

const DetailRaw = z.object({ data: z.record(z.string(), ChampionRaw) })

export function parseChampionDetail(json: unknown, championId: string): ChampionDetail {
  const parsed = DetailRaw.safeParse(json)
  if (!parsed.success) {
    throw new Error(`Invalid Data Dragon champion detail for ${championId}`)
  }

  const raw = parsed.data.data[championId]
  if (!raw) throw new Error(`Data Dragon has no detail for champion ${championId}`)

  return {
    id: raw.id,
    name: raw.name,
    stats: raw.stats,
    passiveName: raw.passive.name,
    spells: raw.spells.map((spell) => ({
      id: spell.id,
      name: spell.name,
      cooldown: spell.cooldown,
      cost: spell.cost,
      range: spell.range,
      effects: spell.effect.map((effect) => effect ?? []),
    })),
  }
}
