import { z } from 'zod'
import { TRAITS } from './item-traits'

export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const
export type Role = (typeof ROLES)[number]

export const METRICS = [
  'enemies',
  'apShare',
  'adShare',
  'healers',
  'hardCc',
  'tanks',
  'assassins',
  'marksmen',
  'mages',
] as const
export type Metric = (typeof METRICS)[number]

/** Placeholders usable inside `reason` templates, in addition to every metric name. */
export const NAME_PLACEHOLDERS = [
  'healersNames',
  'hardCcNames',
  'tanksNames',
  'assassinsNames',
  'marksmenNames',
  'magesNames',
] as const

const TraitSchema = z.enum(TRAITS)

const ConditionSchema = z
  .object({
    metric: z.enum(METRICS),
    atLeast: z.number().optional(),
    atMost: z.number().optional(),
  })
  .refine((c) => c.atLeast !== undefined || c.atMost !== undefined, {
    message: 'condition needs atLeast or atMost',
  })

const ALLOWED_PLACEHOLDERS = new Set<string>([...METRICS, ...NAME_PLACEHOLDERS])

function placeholdersOk(text: string): boolean {
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (!ALLOWED_PLACEHOLDERS.has(m[1] ?? '')) return false
  }
  return true
}

const ReasonSchema = z
  .string()
  .min(1)
  .refine(placeholdersOk, { message: 'unknown placeholder in reason' })

const RuleSchema = z
  .object({
    id: z.string().min(1),
    slot: z.enum(['item', 'boots']).default('item'),
    when: z.array(ConditionSchema).min(1),
    myDamage: z.enum(['ad', 'ap']).optional(),
    roles: z.array(z.enum(ROLES)).optional(),
    allOf: z.array(TraitSchema).default([]),
    anyOf: z.array(TraitSchema).default([]),
    weight: z.number().positive(),
    reason: ReasonSchema,
  })
  .refine((r) => r.allOf.length + r.anyOf.length > 0, {
    message: 'rule needs allOf or anyOf traits',
  })

const CoreSchema = z.object({
  traits: z.array(TraitSchema).min(2),
  reason: z.string().min(1),
})

const RulesFileSchema = z
  .object({
    version: z.literal(1),
    excludeItems: z.array(z.string()).default([]),
    excludeItemsByRole: z.partialRecord(z.enum(ROLES), z.array(z.string())).default({}),
    rules: z.array(RuleSchema),
    coreByClass: z.record(z.string(), CoreSchema).default({}),
  })
  .refine((f) => new Set(f.rules.map((r) => r.id)).size === f.rules.length, {
    message: 'duplicate rule id',
  })

export type Condition = z.infer<typeof ConditionSchema>
export type Rule = z.infer<typeof RuleSchema>
export type CoreSpec = z.infer<typeof CoreSchema>
export type Rules = z.infer<typeof RulesFileSchema>

const ChampionTagSchema = z.object({
  damage: z.enum(['ad', 'ap', 'mixed']).optional(),
  healing: z.boolean().optional(), // strong self or ally healing/sustain
  cc: z.literal('hard').optional(), // reliable stun / knock-up / suppress / root / long CC
})

const ChampionTagsFileSchema = z.object({
  version: z.literal(1),
  champions: z.record(z.string(), ChampionTagSchema),
})

export type ChampionTag = z.infer<typeof ChampionTagSchema>
export type ChampionTags = z.infer<typeof ChampionTagsFileSchema>

export function parseRules(json: unknown): Rules {
  return RulesFileSchema.parse(json)
}

export function parseChampionTags(json: unknown): ChampionTags {
  return ChampionTagsFileSchema.parse(json)
}
