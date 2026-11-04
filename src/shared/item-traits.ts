import type { Item } from './ddragon'
import type { Role } from './rules'

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

// Lane-locked rewards of the role quests (V26 rules): the Midlane Quest turns its lane's tier-2
// boots into these tier-3 boots. Every other shop item is open to all players.
const MID_QUEST_TIER3_BOOTS: readonly string[] = [
  'Gunmetal Greaves',
  'Swiftmarch',
  'Immortal Path',
  'Crimson Lucidity',
  'Armored Advance',
  'Chainlaced Crushers',
  "Spellslinger's Shoes",
]

// These tier-3 boots replace these tier-2 boots for the mid laner only.
const MID_QUEST_TIER2_BOOTS: readonly string[] = [
  "Berserker's Greaves",
  'Boots of Swiftness',
  'Gluttonous Greaves',
  'Ionian Boots of Lucidity',
  'Plated Steelcaps',
  "Mercury's Treads",
  "Sorcerer's Shoes",
]

const ITEM_NAME_SEPARATORS = /[\u2018\u2019]/g

function normalizeItemName(name: string): string {
  return name.replace(ITEM_NAME_SEPARATORS, "'").toLowerCase().trim()
}

/** Tier-2 boots the mid quest upgrade replaces, for the tier-3 quest boot of the same index. */
export function questUpgradeSource(name: string): string | null {
  const normalized = normalizeItemName(name)
  const index = MID_QUEST_TIER3_BOOTS.findIndex(
    (boots) => normalizeItemName(boots) === normalized,
  )
  return index < 0 ? null : (MID_QUEST_TIER2_BOOTS[index] ?? null)
}

/** Lane that receives the item from its role quest; `null` for items every lane can buy. */
export function itemLaneRequirement(name: string): Role | null {
  return questUpgradeSource(name) === null ? null : 'MIDDLE'
}

/**
 * Items the lane cannot buy, by name:
 * - tier-3 quest boots belong to the mid lane only;
 * - "Unknown"/"N/A" entries are removed or unreleased items, not shop stock;
 * - zero-gold "Quest:" placeholders are internal progress items.
 */
export function isItemUnavailableInLane(item: Item, role: Role): boolean {
  if (item.goldTotal <= 0) return true
  if (/^Quest:/i.test(item.name)) return true
  if (/\b(unknown|n\/a)\b/i.test(item.name)) return true
  const required = itemLaneRequirement(item.name)
  return required !== null && required !== role
}

const MIN_COMPLETED_GOLD = 1000
const MIN_BOOTS_GOLD = 500
const MAX_BOOTS_LIKE_GOLD = 1400

// Event/mode-only or removed items Data Dragon can keep listing. They are never shop stock and
// must not reach a recommendation, a pool or any evidence table.
const NON_SR_ITEM_IDS: ReadonlySet<number> = new Set([
  3904, // Demon King's Crown (event)
  3193, // Gargoyle Stoneplate (removed from Summoner's Rift)
  443193, // Gargoyle Stoneplate (Arena variant)
])
const NON_SR_ITEM_NAMES: readonly RegExp[] = [
  /demon king'?s? crown/i,
  /gargoyle stoneplate/i,
]

/** True for event/arena-only items and tombstone catalogue entries. */
export function isNonSREventItem(item: Item): boolean {
  if (NON_SR_ITEM_IDS.has(item.id)) return true
  const name = normalizeItemName(item.name)
  if (NON_SR_ITEM_NAMES.some((pattern) => pattern.test(name))) return true
  if (/^quest:/.test(name)) return true
  if (name === 'unknown' || name === 'n/a') return true
  return false
}

/**
 * Shop stock of Summoner's Rift (map 11): priced, purchasable, visible in the shop, not
 * champion/ally bound, not a consumable or trinket, and not an event/tombstone entry.
 * This is the single gate every item pool must pass.
 */
export function isPurchasableOnSR(item: Item): boolean {
  return (
    item.maps['11'] === true &&
    item.purchasable &&
    item.inStore &&
    item.requiredAlly === null &&
    !item.tags.includes('Consumable') &&
    !item.tags.includes('Trinket') &&
    item.goldTotal > 0 &&
    !isNonSREventItem(item)
  )
}

/** Boots carry the Boots tag; some newer boots do not, but they are cheap and give Move Speed. */
function isBootsLike(item: Item): boolean {
  if (item.tags.includes('Boots')) return true
  return item.goldTotal <= MAX_BOOTS_LIKE_GOLD && itemTraits(item).includes('moveSpeed')
}

/**
 * Items worth recommending on Summoner's Rift: strict SR purchasability, not champion-locked,
 * fully built, one per name. `lane` restricts tier-3 quest boots to the lane that can buy them.
 */
export function buildItemPool(
  items: readonly Item[],
  excludeNames: readonly string[] = [],
  lane?: Role,
): ItemPool {
  const excluded = new Set(excludeNames)
  const pool: ItemPool = { items: [], boots: [] }
  const seen = new Map<string, number>() // item name -> id of the kept variant
  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    if (!isPurchasableOnSR(item)) continue
    if (item.requiredChampion !== null) continue
    const isBoots = isBootsLike(item)
    // Boots stay completed even though Data Dragon lists their tier-3 quest upgrade in `into`
    // (3047 Plated Steelcaps -> 3174 Armored Advance). Other items must be fully built.
    if (!isBoots && item.into.length > 0) continue
    if (excluded.has(item.name)) continue
    if (lane !== undefined && isItemUnavailableInLane(item, lane)) continue
    if (isBoots ? item.goldTotal < MIN_BOOTS_GOLD : item.goldTotal < MIN_COMPLETED_GOLD) continue
    // Data Dragon lists some items twice (mode variants with other prices): keep the lowest id.
    if (seen.has(item.name)) continue
    seen.set(item.name, item.id)
    if (isBoots) pool.boots.push(item)
    else pool.items.push(item)
  }
  return pool
}

/**
 * Alternative shop boots for one lane: the usual tier-2 boots priced in a build, with the
 * lane's own quest upgrade noted. Returns null for a tier-3 boot the lane cannot obtain.
 */
export interface BootsUpgradeNote {
  fromId: number | null
  fromName: string | null
  laneLocked: boolean
}

/** Tier-2 boots a tier-3 quest boot replaces, or null for ordinary boots or a foreign lane. */
export function bootsUpgradeNote(
  item: Item,
  items: readonly Item[],
  role: Role,
): BootsUpgradeNote | null {
  const required = itemLaneRequirement(item.name)
  if (required !== null && required !== role) return null
  const fromName = questUpgradeSource(item.name)
  if (fromName === null) return null
  const target = normalizeItemName(fromName)
  const source = items.find((candidate) => normalizeItemName(candidate.name) === target)
  return {
    fromId: source?.id ?? null,
    fromName: source?.name ?? fromName,
    laneLocked: true,
  }
}
