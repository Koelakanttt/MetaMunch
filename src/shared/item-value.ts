import type { Item } from './ddragon'
import { itemTraits, type Trait } from './item-traits'
import type { Archetype } from './rules'

export type DamageKind = 'ad' | 'ap' | 'mixed'

export const STAT_KEYS = [
  'ad',
  'ap',
  'hp',
  'armor',
  'mr',
  'mana',
  'attackSpeed',
  'crit',
  'abilityHaste',
  'lifesteal',
  'omnivamp',
  'armorPen',
  'magicPen',
  'moveSpeed',
  'healShield',
] as const

export type StatKey = (typeof STAT_KEYS)[number]
export type StatVector = Record<StatKey, number>

/** Enemy numbers used by the math layer; structurally the existing EnemyProfile metrics. */
export interface ThreatMetrics {
  adShare: number
  apShare: number
  healers: number
  hardCc: number
  tanks: number
  assassins: number
  marksmen: number
  mages: number
}

export interface ItemMath {
  item: Item
  stats: StatVector
  goldValue: number
  efficiency: number
  utility: number
}

/**
 * Relative gold values used to compare item budgets. These are deliberately approximate:
 * they are weights for a deterministic prior, not claims about Riot's internal balancing.
 */
export const GOLD_PER_POINT: Record<StatKey, number> = {
  ad: 35,
  ap: 20,
  hp: 2.67,
  armor: 20,
  mr: 18,
  mana: 1.4,
  attackSpeed: 25,
  crit: 40,
  abilityHaste: 20,
  lifesteal: 45,
  omnivamp: 50,
  armorPen: 30,
  magicPen: 35,
  moveSpeed: 10,
  healShield: 20,
}

const EMPTY_STATS: StatVector = {
  ad: 0,
  ap: 0,
  hp: 0,
  armor: 0,
  mr: 0,
  mana: 0,
  attackSpeed: 0,
  crit: 0,
  abilityHaste: 0,
  lifesteal: 0,
  omnivamp: 0,
  armorPen: 0,
  magicPen: 0,
  moveSpeed: 0,
  healShield: 0,
}

function attributeText(item: Item, label: RegExp): number {
  const match = label.exec(item.description)
  return match ? Number(match[1]) : 0
}

export function itemStats(item: Item): StatVector {
  const stats: StatVector = { ...EMPTY_STATS }
  const add = (key: StatKey, value: number): void => {
    if (Number.isFinite(value) && value > 0) stats[key] += value
  }

  for (const [key, value] of Object.entries(item.stats)) {
    switch (key) {
      case 'FlatPhysicalDamageMod':
        add('ad', value)
        break
      case 'FlatMagicDamageMod':
        add('ap', value)
        break
      case 'FlatHPPoolMod':
        add('hp', value)
        break
      case 'FlatArmorMod':
        add('armor', value)
        break
      case 'FlatSpellBlockMod':
        add('mr', value)
        break
      case 'FlatMPPoolMod':
        add('mana', value)
        break
      case 'PercentAttackSpeedMod':
        add('attackSpeed', value * 100)
        break
      case 'FlatCritChanceMod':
        add('crit', value * 100)
        break
      case 'PercentLifeStealMod':
        add('lifesteal', value * 100)
        break
      case 'PercentSpellVampMod':
        add('omnivamp', value * 100)
        break
      case 'FlatArmorPenetrationMod':
        add('armorPen', value)
        break
      case 'PercentArmorPenetrationMod':
        add('armorPen', value * 100)
        break
      case 'FlatMagicPenetrationMod':
        add('magicPen', value)
        break
      case 'PercentMagicPenetrationMod':
        add('magicPen', value * 100)
        break
      case 'FlatMovementSpeedMod':
        add('moveSpeed', value)
        break
      case 'PercentMovementSpeedMod':
        add('moveSpeed', value * 100)
        break
      default:
        break
    }
  }

  // Ability Haste and heal/shield power often live in the description rather than stats.
  const haste = attributeText(item, /<attention>([\d.]+)<\/attention>\s*ability haste/i)
  add('abilityHaste', haste)
  const healShield = attributeText(
    item,
    /<attention>([\d.]+)<\/attention>\s*heal and shield power/i,
  )
  add('healShield', healShield)

  return stats
}

export function statGoldValue(stats: StatVector): number {
  let total = 0
  for (const key of STAT_KEYS) total += stats[key] * GOLD_PER_POINT[key]
  return total
}

export function championStatWeights(
  damage: DamageKind,
  archetype: Archetype,
  metrics: ThreatMetrics,
): StatVector {
  const weights: StatVector = { ...EMPTY_STATS }
  for (const key of STAT_KEYS) weights[key] = 0.15

  if (damage === 'ad' || damage === 'mixed') {
    weights.ad += 1.1
    weights.attackSpeed += 0.7
    weights.crit += 0.6
    weights.armorPen += 0.5
    weights.lifesteal += 0.4
  }
  if (damage === 'ap' || damage === 'mixed') {
    weights.ap += 1.1
    weights.magicPen += 0.6
    weights.abilityHaste += 0.4
    weights.mana += 0.25
  }

  switch (archetype) {
    case 'tank':
      weights.hp += 1
      weights.armor += 1
      weights.mr += 0.9
      weights.abilityHaste += 0.3
      break
    case 'bruiser':
      weights.hp += 0.7
      weights.ad += 0.4
      weights.abilityHaste += 0.4
      break
    case 'assassin':
      weights.ad += 0.7
      weights.armorPen += 0.7
      weights.abilityHaste += 0.3
      break
    case 'marksman':
      weights.ad += 0.6
      weights.attackSpeed += 0.8
      weights.crit += 0.7
      weights.armorPen += 0.3
      break
    case 'mage':
      weights.ap += 0.7
      weights.magicPen += 0.7
      weights.abilityHaste += 0.5
      weights.mana += 0.3
      break
    case 'enchanter':
      weights.ap += 0.5
      weights.healShield += 1
      weights.abilityHaste += 0.7
      weights.hp += 0.3
      break
  }

  weights.armor += metrics.adShare * 0.8
  weights.mr += metrics.apShare * 0.8
  weights.hp += metrics.assassins * 0.08 + metrics.tanks * 0.08
  weights.armorPen += metrics.tanks * 0.12
  weights.magicPen += metrics.tanks * 0.12
  return weights
}

function itemEffectValue(
  item: Item,
  traits: readonly Trait[],
  archetype: Archetype,
  metrics: ThreatMetrics,
): number {
  const has = (trait: Trait): boolean => traits.includes(trait)
  let value = 0
  if (has('antiheal')) value += metrics.healers > 0 ? 220 : 20
  if (has('tenacity')) value += metrics.hardCc >= 2 ? 140 : 20
  if (has('onHit')) value += 60
  if (has('healShieldPower') && archetype === 'enchanter') value += 160
  if (has('omnivamp') || has('lifesteal')) value += 40
  return value
}

export function itemMath(
  item: Item,
  damage: DamageKind,
  archetype: Archetype,
  metrics: ThreatMetrics,
): ItemMath {
  const stats = itemStats(item)
  const traits = itemTraits(item)
  const weights = championStatWeights(damage, archetype, metrics)
  let weighted = 0
  for (const key of STAT_KEYS) weighted += stats[key] * weights[key]
  const goldValue = statGoldValue(stats)
  const utility = weighted + itemEffectValue(item, traits, archetype, metrics)
  return {
    item,
    stats,
    goldValue,
    efficiency: item.goldTotal > 0 ? goldValue / item.goldTotal : 0,
    utility,
  }
}

export interface ItemGroupLimit {
  trait: Trait
  max: number
}

export interface OptimizeBuildOptions {
  excludedNames?: readonly string[]
  groups?: readonly ItemGroupLimit[]
  beamWidth?: number
  maxItems?: number
  requireBoots?: boolean
}

export interface BuildOption {
  items: Item[]
  boots: Item | null
  score: number
  gold: number
}

interface BuildState {
  items: Item[]
  boots: Item | null
  score: number
  gold: number
  counts: Map<Trait, number>
  key: string
}

function stateKey(items: readonly Item[], boots: Item | null): string {
  return `${items
    .map((item) => item.id)
    .sort((a, b) => a - b)
    .join(',')}|${boots?.id ?? 0}`
}

function canAdd(
  item: Item,
  itemTraitsOf: ReadonlyMap<number, Trait[]>,
  counts: ReadonlyMap<Trait, number>,
  groups: readonly ItemGroupLimit[],
): boolean {
  const traits = itemTraitsOf.get(item.id) ?? []
  return groups.every((group) => {
    if (!traits.includes(group.trait)) return true
    return (counts.get(group.trait) ?? 0) + 1 <= group.max
  })
}

function addToCounts(counts: Map<Trait, number>, traits: readonly Trait[]): Map<Trait, number> {
  const next = new Map(counts)
  for (const trait of traits) next.set(trait, (next.get(trait) ?? 0) + 1)
  return next
}

/**
 * Deterministic beam search over six slots. It maximizes the stat/effect utility and
 * enforces duplicate/group/boot constraints; it is a prior, not a win-rate model.
 */
export function optimizeBuild(
  items: readonly Item[],
  boots: readonly Item[],
  damage: DamageKind,
  archetype: Archetype,
  metrics: ThreatMetrics,
  options: OptimizeBuildOptions = {},
): BuildOption | null {
  const excluded = new Set(options.excludedNames ?? [])
  const groups = options.groups ?? []
  const beamWidth = Math.max(10, options.beamWidth ?? 200)
  const maxItems = Math.max(1, Math.min(6, options.maxItems ?? 6))
  const itemPool = items.filter((item) => !excluded.has(item.name))
  const bootPool = boots.filter((item) => !excluded.has(item.name))
  const traitsOf = new Map<number, Trait[]>()
  for (const item of [...itemPool, ...bootPool]) traitsOf.set(item.id, itemTraits(item))

  const utilityOf = new Map<number, number>()
  for (const item of [...itemPool, ...bootPool]) {
    utilityOf.set(item.id, itemMath(item, damage, archetype, metrics).utility)
  }

  let states: BuildState[] = [
    {
      items: [],
      boots: null,
      score: 0,
      gold: 0,
      counts: new Map(),
      key: stateKey([], null),
    },
  ]

  const slots = maxItems
  for (let slot = 0; slot < slots; slot += 1) {
    const next = new Map<string, BuildState>()
    for (const state of states) {
      const filled = state.items.length + (state.boots ? 1 : 0)
      const canAddBoot = state.boots === null && filled < maxItems
      if (canAddBoot) {
        for (const boot of bootPool) {
          if (!canAdd(boot, traitsOf, state.counts, groups)) continue
          const traits = traitsOf.get(boot.id) ?? []
          const candidate: BuildState = {
            items: state.items,
            boots: boot,
            score: state.score + (utilityOf.get(boot.id) ?? 0),
            gold: state.gold + boot.goldTotal,
            counts: addToCounts(state.counts, traits),
            key: stateKey(state.items, boot),
          }
          const key = `${candidate.key}|b`
          const previous = next.get(key)
          if (!previous || candidate.score > previous.score) next.set(key, candidate)
        }
      }

      if (filled < maxItems) {
        for (const item of itemPool) {
          if (state.items.some((picked) => picked.name === item.name)) continue
          if (!canAdd(item, traitsOf, state.counts, groups)) continue
          const traits = traitsOf.get(item.id) ?? []
          const candidate: BuildState = {
            items: [...state.items, item],
            boots: state.boots,
            score: state.score + (utilityOf.get(item.id) ?? 0),
            gold: state.gold + item.goldTotal,
            counts: addToCounts(state.counts, traits),
            key: stateKey([...state.items, item], state.boots),
          }
          const key = `${candidate.key}|i`
          const previous = next.get(key)
          if (!previous || candidate.score > previous.score) next.set(key, candidate)
        }
      }
    }

    if (next.size === 0) break
    states = [...next.values()]
      .sort((a, b) => b.score - a.score || b.gold - a.gold || a.key.localeCompare(b.key))
      .slice(0, beamWidth)
  }

  const best = options.requireBoots
    ? states.find((state) => state.boots !== null)
    : states[0]
  if (!best) return null
  return {
    items: best.items,
    boots: best.boots,
    score: best.score,
    gold: best.gold,
  }
}
