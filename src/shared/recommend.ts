import type { Champion, Item } from './ddragon'
import { buildItemPool, itemTraits, type Trait } from './item-traits'
import type { ChampionTags, Metric, Role, Rule, Rules } from './rules'

export type Damage = 'ad' | 'ap' | 'mixed'

export interface EnemyProfile {
  metrics: Record<Metric, number>
  names: {
    healers: string[]
    hardCc: string[]
    tanks: string[]
    assassins: string[]
    marksmen: string[]
    mages: string[]
  }
}

export interface Recommendation {
  itemId: number
  name: string
  slot: 'item' | 'boots'
  source: 'rules' | 'core'
  reasons: string[]
  ruleIds: string[]
  score: number
}

export interface RecommendResult {
  level: 'rules' | 'core'
  profile: EnemyProfile
  items: Recommendation[]
  boots: Recommendation[]
}

export interface RecommendInput {
  me: Champion
  role: Role
  enemies: readonly Champion[]
  items: readonly Item[]
  tags: ChampionTags
  rules: Rules
}

export const MAX_ITEMS = 6
export const MAX_BOOTS = 2
export const CORE_TARGET = 4
/** Rule matches below this score are only tie-breakers: they never form a recommendation on their own. */
export const MIN_RULE_SCORE = 2
const MAX_REASONS = 2
/** A Data Dragon "Tank" champion counts as a real tank only with this much defense rating. */
export const TANK_MIN_DEFENSE = 7

export function isTank(champion: Champion, tags: ChampionTags): boolean {
  const override = tags.champions[champion.id]?.tank
  if (override !== undefined) return override
  return champion.tags.includes('Tank') && champion.info.defense >= TANK_MIN_DEFENSE
}

export function damageClass(champion: Champion, tags: ChampionTags): Damage {
  const explicit = tags.champions[champion.id]?.damage
  if (explicit) return explicit
  const diff = champion.info.magic - champion.info.attack
  if (diff >= 2) return 'ap'
  if (diff <= -2) return 'ad'
  return 'mixed'
}

export function buildEnemyProfile(enemies: readonly Champion[], tags: ChampionTags): EnemyProfile {
  const names = {
    healers: [] as string[],
    hardCc: [] as string[],
    tanks: [] as string[],
    assassins: [] as string[],
    marksmen: [] as string[],
    mages: [] as string[],
  }
  let ap = 0
  let ad = 0
  for (const champion of enemies) {
    const damage = damageClass(champion, tags)
    if (damage === 'ap') ap += 1
    else if (damage === 'ad') ad += 1
    else {
      ap += 0.5
      ad += 0.5
    }
    const tag = tags.champions[champion.id]
    if (tag?.healing) names.healers.push(champion.name)
    if (tag?.cc === 'hard') names.hardCc.push(champion.name)
    if (isTank(champion, tags)) names.tanks.push(champion.name)
    if (champion.tags.includes('Assassin')) names.assassins.push(champion.name)
    if (champion.tags.includes('Marksman')) names.marksmen.push(champion.name)
    if (champion.tags.includes('Mage')) names.mages.push(champion.name)
  }
  const n = enemies.length
  return {
    metrics: {
      enemies: n,
      apShare: n === 0 ? 0 : ap / n,
      adShare: n === 0 ? 0 : ad / n,
      healers: names.healers.length,
      hardCc: names.hardCc.length,
      tanks: names.tanks.length,
      assassins: names.assassins.length,
      marksmen: names.marksmen.length,
      mages: names.mages.length,
    },
    names,
  }
}

const SHARES: ReadonlySet<Metric> = new Set<Metric>(['apShare', 'adShare'])

export function formatReason(template: string, profile: EnemyProfile): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (key in profile.metrics) {
      const value = profile.metrics[key as Metric]
      return SHARES.has(key as Metric) ? `${Math.round(value * 100)}%` : String(value)
    }
    if (key.endsWith('Names')) {
      const list = profile.names[key.slice(0, -'Names'.length) as keyof EnemyProfile['names']]
      if (list) return list.join(', ')
    }
    return whole
  })
}

function ruleApplies(rule: Rule, slot: 'item' | 'boots', role: Role, myDamage: Damage, profile: EnemyProfile): boolean {
  if (rule.slot !== slot) return false
  if (rule.roles && !rule.roles.includes(role)) return false
  if (rule.myDamage && rule.myDamage !== myDamage) return false
  return rule.when.every((c) => {
    const value = profile.metrics[c.metric]
    return (c.atLeast === undefined || value >= c.atLeast) && (c.atMost === undefined || value <= c.atMost)
  })
}

const DEFENSIVE_CLASSES = ['Tank', 'Fighter', 'Support']

/** Tanks, fighters and supports may buy purely defensive items; squishy damage dealers may not. */
function allowsDefensiveItems(me: Champion): boolean {
  return me.tags.some((t) => DEFENSIVE_CLASSES.includes(t))
}

function hasDamageStat(traits: readonly Trait[], myDamage: Damage): boolean {
  if (traits.includes('adaptive')) return true
  if (myDamage !== 'ap' && traits.includes('ad')) return true
  if (myDamage !== 'ad' && traits.includes('ap')) return true
  return false
}

function compatible(traits: readonly Trait[], me: Champion, myDamage: Damage, slot: 'item' | 'boots'): boolean {
  // Hybrid items (both AD and AP) and adaptive items suit everyone; pure items only their own damage type.
  if (!traits.includes('adaptive')) {
    if (myDamage === 'ad' && traits.includes('ap') && !traits.includes('ad')) return false
    if (myDamage === 'ap' && traits.includes('ad') && !traits.includes('ap')) return false
  }
  if (me.stats['mp'] === 0 && traits.includes('mana')) return false
  if (slot === 'item' && !allowsDefensiveItems(me) && !hasDamageStat(traits, myDamage)) return false
  return true
}

interface Scored {
  item: Item
  score: number
  reasons: { weight: number; text: string }[]
  ruleIds: string[]
}

function byScore(a: Scored, b: Scored): number {
  return b.score - a.score || b.item.goldTotal - a.item.goldTotal || a.item.id - b.item.id
}

function pickByRules(
  slot: 'item' | 'boots',
  pool: readonly Item[],
  traitsOf: ReadonlyMap<number, Trait[]>,
  input: RecommendInput,
  myDamage: Damage,
  profile: EnemyProfile,
  limit: number,
): Recommendation[] {
  const rules = input.rules.rules.filter((r) => ruleApplies(r, slot, input.role, myDamage, profile))
  const scored = new Map<number, Scored>()
  for (const rule of rules) {
    const text = formatReason(rule.reason, profile)
    for (const item of pool) {
      const traits = traitsOf.get(item.id) ?? []
      if (!compatible(traits, input.me, myDamage, slot)) continue
      if (!rule.allOf.every((t) => traits.includes(t))) continue
      const matched = rule.anyOf.filter((t) => traits.includes(t)).length
      if (rule.anyOf.length > 0 && matched === 0) continue
      const bonus = rule.anyOf.length > 1 ? 0.5 * (matched - 1) : 0
      const entry = scored.get(item.id) ?? { item, score: 0, reasons: [], ruleIds: [] }
      entry.score += rule.weight + bonus
      entry.reasons.push({ weight: rule.weight, text })
      entry.ruleIds.push(rule.id)
      scored.set(item.id, entry)
    }
  }
  return [...scored.values()]
    .filter((s) => s.score >= MIN_RULE_SCORE)
    .sort(byScore)
    .slice(0, limit)
    .map((s) => ({
      itemId: s.item.id,
      name: s.item.name,
      slot,
      source: 'rules' as const,
      reasons: s.reasons
        .sort((a, b) => b.weight - a.weight)
        .map((r) => r.text)
        .slice(0, MAX_REASONS),
      ruleIds: s.ruleIds,
      score: s.score,
    }))
}

function pickCore(
  pool: readonly Item[],
  traitsOf: ReadonlyMap<number, Trait[]>,
  input: RecommendInput,
  myDamage: Damage,
  skip: ReadonlySet<number>,
  limit: number,
): Recommendation[] {
  if (limit <= 0) return []
  // A key like "Assassin:ap" (class + damage type) wins over the plain class key.
  let cls: string | undefined
  let spec: Rules['coreByClass'][string] | undefined
  for (const tag of input.me.tags) {
    const specific = input.rules.coreByClass[`${tag}:${myDamage}`]
    const plain = input.rules.coreByClass[tag]
    if (specific || plain) {
      cls = specific ? `${tag}:${myDamage}` : tag
      spec = specific ?? plain
      break
    }
  }
  if (!cls || !spec) return []
  const scored: Scored[] = []
  for (const item of pool) {
    if (skip.has(item.id)) continue
    const traits = traitsOf.get(item.id) ?? []
    if (!compatible(traits, input.me, myDamage, 'item')) continue
    const matched = spec.traits.filter((t) => traits.includes(t)).length
    if (matched < 2) continue
    scored.push({ item, score: matched, reasons: [{ weight: 1, text: spec.reason }], ruleIds: [`core:${cls}`] })
  }
  return scored
    .sort(byScore)
    .slice(0, limit)
    .map((s) => ({
      itemId: s.item.id,
      name: s.item.name,
      slot: 'item' as const,
      source: 'core' as const,
      reasons: s.reasons.map((r) => r.text),
      ruleIds: s.ruleIds,
      score: s.score,
    }))
}

export function recommend(input: RecommendInput): RecommendResult {
  const profile = buildEnemyProfile(input.enemies, input.tags)
  const myDamage = damageClass(input.me, input.tags)
  const excluded = [...input.rules.excludeItems, ...(input.rules.excludeItemsByRole[input.role] ?? [])]
  const pool = buildItemPool(input.items, excluded)
  const traitsOf = new Map<number, Trait[]>()
  for (const item of [...pool.items, ...pool.boots]) traitsOf.set(item.id, itemTraits(item))

  const ruleItems = pickByRules('item', pool.items, traitsOf, input, myDamage, profile, MAX_ITEMS)
  const boots = pickByRules('boots', pool.boots, traitsOf, input, myDamage, profile, MAX_BOOTS)

  const items = [...ruleItems]
  if (ruleItems.length < 3) {
    const skip = new Set(ruleItems.map((r) => r.itemId))
    items.push(...pickCore(pool.items, traitsOf, input, myDamage, skip, CORE_TARGET - ruleItems.length))
  }
  const anyRules = ruleItems.length > 0 || boots.length > 0
  return { level: anyRules ? 'rules' : 'core', profile, items, boots }
}
