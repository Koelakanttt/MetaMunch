import { z } from 'zod'

export interface ChampionInfo {
  attack: number
  defense: number
  magic: number
  difficulty: number
}

export interface Champion {
  key: number // numeric champion id, the one match-v5 uses
  id: string // Data Dragon string id, e.g. "MonkeyKing" (display name is "Wukong")
  name: string
  tags: string[]
  info: ChampionInfo
  stats: Record<string, number> // base stats, e.g. hp, hpperlevel, armor
}

export interface Item {
  id: number
  name: string
  plaintext: string
  description: string // raw Data Dragon HTML-like markup
  tags: string[]
  stats: Record<string, number> // e.g. FlatPhysicalDamageMod
  goldTotal: number
  purchasable: boolean
  from: number[]
  into: number[]
  maps: Record<string, boolean> // map id -> available
  inStore: boolean // false for items that cannot be bought in the shop
  requiredAlly: string | null // e.g. "Ornn" for his upgrades
  requiredChampion: string | null // champion-locked items
}

export interface ParseResult<T> {
  values: T[]
  skipped: string[] // keys of entries that failed validation
}

const NumberRecord = z.record(z.string(), z.number())

const RealmSchema = z.object({ v: z.string().regex(/^\d+\.\d+(\.\d+)?$/) })

const ChampionRaw = z.object({
  id: z.string().min(1),
  key: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  info: z.object({
    attack: z.number(),
    defense: z.number(),
    magic: z.number(),
    difficulty: z.number(),
  }),
  stats: NumberRecord,
})

const ItemRaw = z.object({
  name: z.string(),
  plaintext: z.string().default(''),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  stats: NumberRecord.default({}),
  gold: z.object({ total: z.number(), purchasable: z.boolean() }),
  from: z.array(z.string()).default([]),
  into: z.array(z.string()).default([]),
  maps: z.record(z.string(), z.boolean()).default({}),
  inStore: z.boolean().default(true),
  requiredAlly: z.string().optional(),
  requiredChampion: z.string().optional(),
})

const ListRaw = z.object({ data: z.record(z.string(), z.unknown()) })

function collect<T>(
  entries: Record<string, unknown>,
  parseOne: (key: string, raw: unknown) => T | null,
  sortKey: (value: T) => number,
): ParseResult<T> {
  const values: T[] = []
  const skipped: string[] = []
  for (const [key, raw] of Object.entries(entries)) {
    const value = parseOne(key, raw)
    if (value === null) skipped.push(key)
    else values.push(value)
  }
  if (values.length === 0) throw new Error('Data Dragon: no valid entries')
  values.sort((a, b) => sortKey(a) - sortKey(b))
  return { values, skipped }
}

function toIds(list: string[]): number[] {
  return list.map(Number).filter((n) => Number.isInteger(n))
}

/** Returns the Data Dragon version of a realm file (realms/<region>.json). Throws on bad shape. */
export function parseRealmVersion(json: unknown): string {
  return RealmSchema.parse(json).v
}

/** Parses champion.json. Invalid entries are skipped; throws if the file is malformed or nothing is valid. */
export function parseChampionList(json: unknown): ParseResult<Champion> {
  const list = ListRaw.parse(json)
  return collect(
    list.data,
    (_key, raw) => {
      const r = ChampionRaw.safeParse(raw)
      if (!r.success) return null
      const c = r.data
      return {
        key: Number(c.key),
        id: c.id,
        name: c.name,
        tags: c.tags,
        info: c.info,
        stats: c.stats,
      }
    },
    (c) => c.key,
  )
}

/** Parses item.json. Invalid entries (and non-numeric keys) are skipped; throws if the file is malformed or nothing is valid. */
export function parseItemList(json: unknown): ParseResult<Item> {
  const list = ListRaw.parse(json)
  return collect(
    list.data,
    (key, raw) => {
      if (!/^\d+$/.test(key)) return null
      const r = ItemRaw.safeParse(raw)
      if (!r.success) return null
      const i = r.data
      return {
        id: Number(key),
        name: i.name,
        plaintext: i.plaintext,
        description: i.description,
        tags: i.tags,
        stats: i.stats,
        goldTotal: i.gold.total,
        purchasable: i.gold.purchasable,
        from: toIds(i.from),
        into: toIds(i.into),
        maps: i.maps,
        inStore: i.inStore,
        requiredAlly: i.requiredAlly || null,
        requiredChampion: i.requiredChampion || null,
      }
    },
    (i) => i.id,
  )
}
