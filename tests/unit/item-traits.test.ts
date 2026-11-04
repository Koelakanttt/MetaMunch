import { describe, expect, it } from 'vitest'
import {
  bootsUpgradeNote,
  buildItemPool,
  isItemUnavailableInLane,
  isNonSREventItem,
  isPurchasableOnSR,
  itemLaneRequirement,
  itemTraits,
  statLabels,
  unknownStatLabels,
} from '../../src/shared/item-traits'
import { mkItem, stats } from '../helpers/items'

describe('statLabels', () => {
  it('extracts lower-cased labels from the stats block', () => {
    const d = stats([55, 'Attack Damage'], ['20%', 'Attack Speed'], [20, 'Ability Haste'])
    expect(statLabels(d)).toEqual(['attack damage', 'attack speed', 'ability haste'])
  })
  it('returns [] without a stats block and ignores passive text', () => {
    expect(statLabels('<mainText><passive>Rage:</passive> does things</mainText>')).toEqual([])
  })
  it('lists labels no mapping understands', () => {
    const d = stats([5, 'Base Health Regen'], [40, 'Armor'], ['30%', 'Tenacity and Slow Resist'])
    expect(unknownStatLabels(d)).toEqual(['base health regen'])
  })
})

describe('itemTraits', () => {
  it('reads traits from description labels', () => {
    const item = mkItem(1, 'Cleaver', { description: stats([40, 'Attack Damage'], [400, 'Health'], [20, 'Ability Haste']) })
    expect(itemTraits(item)).toEqual(['abilityHaste', 'ad', 'health'])
  })
  it('does not mistake Armor Penetration for Armor', () => {
    const item = mkItem(2, 'Pen', { description: stats([18, 'Lethality']) })
    expect(itemTraits(item)).toEqual(['armorPen'])
  })
  it('merges tags and legacy stat keys', () => {
    const item = mkItem(3, 'Tags', { tags: ['SpellDamage', 'Boots'], stats: { FlatMagicDamageMod: 40, FlatArmorMod: 0 } })
    expect(itemTraits(item)).toEqual(['ap', 'boots'])
  })
  it('detects tenacity from a combined label', () => {
    const item = mkItem(4, 'Treads', { description: stats([25, 'Magic Resist'], ['30%', 'Tenacity and Slow Resist']) })
    expect(itemTraits(item)).toEqual(['mr', 'tenacity'])
  })
  it('detects the current "Wounds" wording and adaptive force', () => {
    const thorns = mkItem(8, 'Thornmail', { description: stats([75, 'Armor']) + '<passive>Thorns</passive> apply 40% Wounds for 3 seconds' })
    expect(itemTraits(thorns)).toContain('antiheal')
    const adaptive = mkItem(9, 'Adaptive', { description: stats([50, 'Adaptive Force']) })
    expect(itemTraits(adaptive)).toEqual(['adaptive'])
    expect(itemTraits(mkItem(10, 'Lifeline', { description: 'would reduce your Health below 30%' }))).not.toContain('antiheal')
  })
  it('detects Grievous Wounds in description and plaintext', () => {
    const a = mkItem(5, 'A', { description: '<mainText><status>Grievous Wounds</status> on hit</mainText>' })
    const b = mkItem(6, 'B', { plaintext: 'Applies grievous wounds' })
    expect(itemTraits(a)).toContain('antiheal')
    expect(itemTraits(b)).toContain('antiheal')
    expect(itemTraits(mkItem(7, 'C'))).toEqual([])
  })
})

describe('buildItemPool', () => {
  const good = mkItem(10, 'Good', { tags: ['Armor'] })
  const boots = mkItem(11, 'Boots', { tags: ['Boots'], goldTotal: 1100 })
  const catalog = [
    good,
    boots,
    mkItem(12, 'Component', { goldTotal: 700 }),
    mkItem(13, 'Upgrades', { into: [99] }),
    mkItem(14, 'Not buyable', { purchasable: false }),
    mkItem(15, 'Hidden', { inStore: false }),
    mkItem(16, 'Ornn item', { requiredAlly: 'Ornn' }),
    mkItem(17, 'Locked', { requiredChampion: 'Viktor' }),
    mkItem(18, 'Aram only', { maps: { '12': true } }),
    mkItem(19, 'Potion', { tags: ['Consumable'] }),
    mkItem(20, 'Trinket', { tags: ['Trinket'] }),
    mkItem(21, 'Starter boots', { tags: ['Boots'], goldTotal: 300, into: [11] }),
    mkItem(22, 'Excluded by name'),
  ]
  it('keeps only completed shop items on Summoner\'s Rift', () => {
    const pool = buildItemPool(catalog, ['Excluded by name'])
    expect(pool.items.map((i) => i.id)).toEqual([10])
    expect(pool.boots.map((i) => i.id)).toEqual([11])
  })
  it('treats cheap move speed items without the Boots tag as boots', () => {
    const greaves = mkItem(40, 'Gunmetal Greaves', { goldTotal: 1100, description: stats(['35%', 'Attack Speed'], [45, 'Move Speed']) })
    const pool = buildItemPool([greaves, mkItem(41, 'Kraken-like', { goldTotal: 3000, description: stats([45, 'Move Speed']) })])
    expect(pool.boots.map((i) => i.id)).toEqual([40])
    expect(pool.items.map((i) => i.id)).toEqual([41])
  })
  it('keeps one variant per name (the lowest id)', () => {
    const pool = buildItemPool([
      mkItem(223075, 'Thornmail', { goldTotal: 2650 }),
      mkItem(3075, 'Thornmail', { goldTotal: 2450 }),
      mkItem(1, 'Mode Boots', { tags: ['Boots'], goldTotal: 1100 }),
      mkItem(2, 'Mode Boots', { tags: ['Boots'], goldTotal: 1200 }),
    ])
    expect(pool.items.map((i) => i.id)).toEqual([3075])
    expect(pool.boots.map((i) => i.id)).toEqual([1])
  })
})

describe('Summoner\'s Rift catalog hygiene', () => {
  const base = { tags: [] as string[], goldTotal: 3000 }

  it('accepts normal SR shop items', () => {
    expect(isPurchasableOnSR(mkItem(3031, 'Infinity Edge', base))).toBe(true)
  })

  it('rejects event, tombstone, lane-export and non-shop entries', () => {
    expect(
      isPurchasableOnSR(mkItem(3904, "Demon King's Crown", { tags: ['Boots'], goldTotal: 1200 })),
    ).toBe(false)
    expect(
      isPurchasableOnSR(mkItem(9990, 'Demon King\u2019s Crown', { tags: ['Boots'], goldTotal: 1200 })),
    ).toBe(false)
    // Removed items stay out even if a stale catalog still claims every searchable flag.
    expect(
      isPurchasableOnSR(
        mkItem(3193, 'Gargoyle Stoneplate', {
          tags: ['Armor', 'SpellBlock'],
          goldTotal: 3150,
          purchasable: true,
          inStore: true,
          maps: { '11': true },
        }),
      ),
    ).toBe(false)
    expect(isPurchasableOnSR(mkItem(443193, 'Gargoyle Stoneplate', { goldTotal: 2750 }))).toBe(false)
    expect(isPurchasableOnSR(mkItem(1, 'Unknown', base))).toBe(false)
    expect(isPurchasableOnSR(mkItem(1091, 'Quest: Mid', { goldTotal: 0 }))).toBe(false)
    expect(isPurchasableOnSR(mkItem(2, 'Aram only', { maps: { '12': true } }))).toBe(false)
    expect(isPurchasableOnSR(mkItem(3, 'Not buyable', { ...base, purchasable: false }))).toBe(false)
    expect(isPurchasableOnSR(mkItem(4, 'Hidden', { ...base, inStore: false }))).toBe(false)
    expect(isPurchasableOnSR(mkItem(5, 'Ornn item', { ...base, requiredAlly: 'Ornn' }))).toBe(false)
    expect(isPurchasableOnSR(mkItem(6, 'Potion', { tags: ['Consumable'], goldTotal: 50 }))).toBe(false)
    expect(isPurchasableOnSR(mkItem(7, 'Ward', { tags: ['Trinket'], goldTotal: 0 }))).toBe(false)
    expect(isNonSREventItem(mkItem(3904, "Demon King's Crown"))).toBe(true)
    expect(isNonSREventItem(mkItem(3031, 'Infinity Edge'))).toBe(false)
  })

  it('keeps event items out of the pool even when every flag looks buyable', () => {
    const pool = buildItemPool([
      mkItem(3904, "Demon King's Crown", { tags: ['Boots'], goldTotal: 1200 }),
      mkItem(3047, 'Plated Steelcaps', { tags: ['Boots'], goldTotal: 1200 }),
      mkItem(3031, 'Infinity Edge'),
    ])

    expect(pool.items.map((item) => item.name)).toEqual(['Infinity Edge'])
    expect(pool.boots.map((item) => item.name)).toEqual(['Plated Steelcaps'])
  })
})

describe('lane availability', () => {
  // Quest boots are finished items with an empty `into`; the tier-2 boots list them in `into`.
  const tier2 = (id: number, name: string, upgradesTo: number) =>
    mkItem(id, name, { tags: ['Boots'], goldTotal: 1100, into: [upgradesTo] })
  const tier3 = (id: number, name: string) => mkItem(id, name, { tags: ['Boots'], goldTotal: 1200 })
  const shop = [
    tier2(3047, 'Plated Steelcaps', 3174),
    tier2(3006, "Berserker's Greaves", 3172),
    tier2(3020, "Sorcerer's Shoes", 3175),
    tier2(3111, "Mercury's Treads", 3173),
    tier2(3158, 'Ionian Boots of Lucidity', 3171),
    tier2(3009, 'Boots of Swiftness', 3170),
    tier3(3174, 'Armored Advance'),
    tier3(3172, 'Gunmetal Greaves'),
    tier3(3175, "Spellslinger's Shoes"),
    tier3(3173, 'Chainlaced Crushers'),
    tier3(3171, 'Crimson Lucidity'),
    tier3(3170, 'Swiftmarch'),
  ]

  it('marks only the mid-lane quest boots as lane locked', () => {
    expect(itemLaneRequirement('Armored Advance')).toBe('MIDDLE')
    expect(itemLaneRequirement('Plated Steelcaps')).toBeNull()
    expect(itemLaneRequirement('Unknown')).toBeNull()
    expect(isItemUnavailableInLane(tier2(3047, 'Plated Steelcaps', 3174), 'BOTTOM')).toBe(false)
    expect(isItemUnavailableInLane(tier3(3174, 'Armored Advance'), 'BOTTOM')).toBe(true)
    expect(isItemUnavailableInLane(tier3(3174, 'Armored Advance'), 'MIDDLE')).toBe(false)
  })

  it('drops removed items, placeholders and foreign-lane boots from a lane pool', () => {
    const catalog = [
      ...shop,
      mkItem(447107, 'Unknown', { tags: ['Boots'], goldTotal: 1200 }),
      mkItem(6667, 'Demon King\u2019s Crown', { tags: ['Boots'], goldTotal: 1200 }),
      mkItem(1091, 'Quest: Mid', { goldTotal: 0 }),
      mkItem(3031, 'Infinity Edge'),
    ]

    const bottom = buildItemPool(catalog, [], 'BOTTOM')
    // Pool order follows item ids (keep the lowest id per name), not the catalog order.
    expect(bottom.boots.map((item) => item.name)).toEqual([
      "Berserker's Greaves",
      'Boots of Swiftness',
      "Sorcerer's Shoes",
      'Plated Steelcaps',
      "Mercury's Treads",
      "Ionian Boots of Lucidity",
    ])

    const middle = buildItemPool(catalog, [], 'MIDDLE')
    expect(middle.boots.map((item) => item.name)).toContain('Armored Advance')
    expect(middle.boots.map((item) => item.name)).not.toContain('Demon King\u2019s Crown')
    expect(middle.boots.map((item) => item.name)).not.toContain('Unknown')
    expect(middle.items.map((item) => item.name)).toEqual(['Infinity Edge'])
  })

  it('explains a quest boot upgrade and rejects foreign lanes', () => {
    expect(bootsUpgradeNote(tier3(3174, 'Armored Advance'), shop, 'MIDDLE')).toEqual({
      fromId: 3047,
      fromName: 'Plated Steelcaps',
      laneLocked: true,
    })
    expect(bootsUpgradeNote(tier3(3174, 'Armored Advance'), shop, 'BOTTOM')).toBeNull()
    expect(bootsUpgradeNote(tier2(3047, 'Plated Steelcaps', 3174), shop, 'MIDDLE')).toBeNull()
  })
  it('keeps the mid quest boots out of the other lanes but in the mid pool', () => {
    expect(buildItemPool(shop, [], 'BOTTOM').boots.some((item) => item.id === 3174)).toBe(false)
    expect(buildItemPool(shop, [], 'MIDDLE').boots.some((item) => item.id === 3174)).toBe(true)
  })
})
