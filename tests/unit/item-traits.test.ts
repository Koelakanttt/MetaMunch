import { describe, expect, it } from 'vitest'
import { buildItemPool, itemTraits, statLabels, unknownStatLabels } from '../../src/shared/item-traits'
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
