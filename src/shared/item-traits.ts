import type { Item } from './ddragon'

export const TRAITS = [
  'ad',
  'ap',
  'armor',
  'mr',
  'health',
  'attackSpeed',
  'crit',
  'abilityHaste',
  'armorPen',
  'magicPen',
  'lifesteal',
  'omnivamp',
  'tenacity',
  'moveSpeed',
  'mana',
  'healShieldPower',
  'antiheal',
  'adaptive',
  'onHit',
  'boots',
] as const
export type Trait = (typeof TRAITS)[number]

// Labels as they appear in the <stats> block of an item description (lower-cased).
const LABEL_TO_TRAIT: Record<string, Trait> = {
  'attack damage': 'ad',
  'ability power': 'ap',
  armor: 'armor',
  'magic resist': 'mr',
  health: 'health',
  'attack speed': 'attackSpeed',
  'critical strike chance': 'crit',
  'ability haste': 'abilityHaste',
  'armor penetration': 'armorPen',
  lethality: 'armorPen',
  'magic penetration': 'magicPen',
  'life steal': 'lifesteal',
  omnivamp: 'omnivamp',
  'move speed': 'moveSpeed',
  mana: 'mana',
  'base mana regen': 'mana',
  'heal and shield power': 'healShieldPower',
  'adaptive force': 'adaptive',
}

// Data Dragon item tags.
const TAG_TO_TRAIT: Record<string, Trait> = {
  Armor: 'armor',
  SpellBlock: 'mr',
  Health: 'health',
  AttackSpeed: 'attackSpeed',
  CriticalStrike: 'crit',
  AbilityHaste: 'abilityHaste',
  CooldownReduction: 'abilityHaste',
  ArmorPenetration: 'armorPen',
  MagicPenetration: 'magicPen',
  LifeSteal: 'lifesteal',
  SpellVamp: 'omnivamp',
  Tenacity: 'tenacity',
  Damage: 'ad',
  SpellDamage: 'ap',
  Mana: 'mana',
  OnHit: 'onHit',
  Boots: 'boots',
}

// Legacy stat keys of Data Dragon (only used as a fallback).
const STAT_TO_TRAIT: Record<string, Trait> = {
  FlatPhysicalDamageMod: 'ad',
  FlatMagicDamageMod: 'ap',
  FlatArmorMod: 'armor',
  FlatSpellBlockMod: 'mr',
  FlatHPPoolMod: 'health',
  PercentAttackSpeedMod: 'attackSpeed',
  FlatCritChanceMod: 'crit',
  PercentLifeStealMod: 'lifesteal',
  FlatMPPoolMod: 'mana',
}

/** Description without markup tags, collapsed to single spaces. */
export function plainText(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Lower-cased stat labels from the <stats> block of a description, e.g. ["attack damage", "ability haste"]. */
export function statLabels(description: string): string[] {
  const block = /<stats>([\s\S]*?)<\/stats>/i.exec(description)?.[1]
  if (!block) return []
  const labels: string[] = []
  for (const segment of block.split(/<br\s*\/?>/i)) {
    const m = /<attention>[^<]*<\/attention>\s*([\s\S]*)$/i.exec(segment)
    if (!m) continue
    const label = plainText(m[1] ?? '').toLowerCase()
    if (label) labels.push(label)
  }
  return labels
}

/** Labels of the <stats> block that no trait mapping understands (used to extend the mapping). */
export function unknownStatLabels(description: string): string[] {
  return statLabels(description).filter((l) => !(l in LABEL_TO_TRAIT) && !l.includes('tenacity'))
}

export function itemTraits(item: Item): Trait[] {
  const traits = new Set<Trait>()
  for (const label of statLabels(item.description)) {
    const t = LABEL_TO_TRAIT[label]
    if (t) traits.add(t)
    if (label.includes('tenacity')) traits.add('tenacity')
  }
  for (const tag of item.tags) {
    const t = TAG_TO_TRAIT[tag]
    if (t) traits.add(t)
  }
  for (const [key, value] of Object.entries(item.stats)) {
    const t = STAT_TO_TRAIT[key]
    if (t && value > 0) traits.add(t)
  }
  // In the current patches the effect is worded "applies 40% Wounds" (older text: "Grievous Wounds").
  if (/\bwounds\b/i.test(plainText(item.description)) || /\bwounds\b/i.test(item.plaintext)) {
    traits.add('antiheal')
  }
  return [...traits].sort()
}

export interface ItemPool {
  items: Item[] // completed non-boots items
  boots: Item[] // completed boots
}

const MIN_COMPLETED_GOLD = 1000
const MIN_BOOTS_GOLD = 500
const MAX_BOOTS_LIKE_GOLD = 1400

/** Boots carry the Boots tag; some newer boots do not, but they are cheap and give Move Speed. */
function isBootsLike(item: Item): boolean {
  if (item.tags.includes('Boots')) return true
  return item.goldTotal <= MAX_BOOTS_LIKE_GOLD && itemTraits(item).includes('moveSpeed')
}

/** Items worth recommending on Summoner's Rift: shop-buyable, not champion/ally locked, fully built, one per name. */
export function buildItemPool(items: readonly Item[], excludeNames: readonly string[] = []): ItemPool {
  const excluded = new Set(excludeNames)
  const pool: ItemPool = { items: [], boots: [] }
  const seen = new Map<string, number>() // item name -> id of the kept variant
  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    if (!item.purchasable || !item.inStore) continue
    if (item.requiredAlly !== null || item.requiredChampion !== null) continue
    if (item.maps['11'] !== true) continue
    if (item.into.length > 0) continue
    if (item.tags.includes('Consumable') || item.tags.includes('Trinket')) continue
    if (excluded.has(item.name)) continue
    const isBoots = isBootsLike(item)
    if (isBoots ? item.goldTotal < MIN_BOOTS_GOLD : item.goldTotal < MIN_COMPLETED_GOLD) continue
    // Data Dragon lists some items twice (mode variants with other prices): keep the lowest id.
    if (seen.has(item.name)) continue
    seen.set(item.name, item.id)
    if (isBoots) pool.boots.push(item)
    else pool.items.push(item)
  }
  return pool
}
