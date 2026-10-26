import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Champion } from '../../src/shared/ddragon'
import { buildEnemyProfile, damageClass, formatReason, recommend } from '../../src/shared/recommend'
import { parseChampionTags, parseRules, type Rules } from '../../src/shared/rules'
import { mkItem, stats } from '../helpers/items'

function champ(id: string, tags: string[], attack: number, magic: number, mp = 300, defense = 5): Champion {
  return {
    key: 1,
    id,
    name: id,
    tags,
    info: { attack, defense, magic, difficulty: 5 },
    stats: { mp },
  }
}

const garen = champ('Garen', ['Fighter', 'Tank'], 7, 1, 0)
const ahri = champ('Ahri', ['Mage', 'Assassin'], 3, 8)
const soraka = champ('Soraka', ['Support', 'Mage'], 2, 7)
const vladimir = champ('Vladimir', ['Mage', 'Tank'], 2, 8)
const syndra = champ('Syndra', ['Mage'], 2, 9)
const leona = champ('Leona', ['Tank', 'Support'], 4, 3, 300, 8)
const ornn = champ('Ornn', ['Tank', 'Fighter'], 5, 3, 300, 9)
const aatrox = champ('Aatrox', ['Fighter', 'Tank'], 8, 3)
const zed = champ('Zed', ['Assassin'], 9, 1)
const jinx = champ('Jinx', ['Marksman'], 9, 2)
const darius = champ('Darius', ['Fighter', 'Tank'], 9, 1)

const tags = parseChampionTags({
  version: 1,
  champions: {
    Soraka: { healing: true },
    Vladimir: { healing: true },
    Aatrox: { healing: true },
    Syndra: { cc: 'hard' },
    Leona: { cc: 'hard' },
  },
})

const catalog = [
  mkItem(1, 'Thornmail', { tags: ['Armor'], description: stats([60, 'Armor']) + 'Grievous Wounds', goldTotal: 2700 }),
  mkItem(2, 'Mortal Reminder', { tags: ['Damage', 'ArmorPenetration'], description: stats([35, 'Attack Damage'], [30, 'Armor Penetration']) + 'Grievous Wounds', goldTotal: 3000 }),
  mkItem(3, 'Morellonomicon', { tags: ['SpellDamage'], description: stats([75, 'Ability Power']) + 'Grievous Wounds', goldTotal: 2200 }),
  mkItem(4, 'Force of Nature', { tags: ['SpellBlock'], description: stats([70, 'Magic Resist'], [350, 'Health']), goldTotal: 2900 }),
  mkItem(5, 'Randuins', { tags: ['Armor', 'Health'], description: stats([80, 'Armor'], [400, 'Health']), goldTotal: 2700 }),
  mkItem(6, 'Jak Sho', { tags: ['Armor', 'SpellBlock'], description: stats([50, 'Armor'], [50, 'Magic Resist']), goldTotal: 3200 }),
  mkItem(7, 'Black Cleaver', { tags: ['Damage', 'Health', 'AbilityHaste'], description: stats([40, 'Attack Damage'], [400, 'Health'], [20, 'Ability Haste']), goldTotal: 3000 }),
  mkItem(8, 'Void Staff', { tags: ['SpellDamage', 'MagicPenetration'], description: stats([95, 'Ability Power'], ['40%', 'Magic Penetration']), goldTotal: 3000 }),
  mkItem(9, 'Rabadons', { tags: ['SpellDamage'], description: stats([130, 'Ability Power']), goldTotal: 3600 }),
  mkItem(10, 'Sunfire', { tags: ['Health', 'Armor'], description: stats([400, 'Health'], [50, 'Armor']), goldTotal: 2700 }),
  mkItem(11, 'Manamune', { tags: ['Damage', 'Mana'], description: stats([35, 'Attack Damage'], [500, 'Mana'], [15, 'Ability Haste']), goldTotal: 2900 }),
  mkItem(12, 'Ornn masterwork', { tags: ['Armor'], description: stats([100, 'Armor']), requiredAlly: 'Ornn', goldTotal: 3500 }),
  mkItem(14, 'Zhonyas Hourglass', { tags: ['SpellDamage', 'Armor'], description: stats([80, 'Ability Power'], [45, 'Armor']), goldTotal: 3250 }),
  mkItem(13, 'Long Sword', { tags: ['Damage'], description: stats([10, 'Attack Damage']), goldTotal: 350 }),
  mkItem(20, 'Plated Steelcaps', { tags: ['Boots', 'Armor'], description: stats([20, 'Armor']), goldTotal: 1100 }),
  mkItem(21, 'Mercurys Treads', { tags: ['Boots', 'SpellBlock', 'Tenacity'], description: stats([25, 'Magic Resist'], ['30%', 'Tenacity and Slow Resist']), goldTotal: 1100 }),
  mkItem(22, 'Ionian Boots', { tags: ['Boots', 'AbilityHaste'], description: stats([20, 'Ability Haste']), goldTotal: 900 }),
  mkItem(23, 'Berserkers Greaves', { tags: ['Boots', 'AttackSpeed'], description: stats(['35%', 'Attack Speed']), goldTotal: 1100 }),
]

const rules: Rules = parseRules(JSON.parse(readFileSync(join(process.cwd(), 'data/rules.json'), 'utf8')))

function run(me: Champion, enemies: Champion[], over: Partial<Rules> = {}) {
  return recommend({ me, role: 'TOP', enemies, items: catalog, tags, rules: { ...rules, ...over } })
}
const names = (r: { name: string }[]) => r.map((x) => x.name)

describe('damageClass / profile', () => {
  it('uses explicit tags, then info', () => {
    const t = parseChampionTags({ version: 1, champions: { Kayle: { damage: 'mixed' } } })
    expect(damageClass(champ('Kayle', [], 8, 1), t)).toBe('mixed')
    expect(damageClass(garen, tags)).toBe('ad')
    expect(damageClass(ahri, tags)).toBe('ap')
    expect(damageClass(leona, tags)).toBe('mixed')
  })
  it('counts enemies by trait and formats shares', () => {
    const p = buildEnemyProfile([soraka, vladimir, ahri, syndra, leona], tags)
    expect(p.metrics.enemies).toBe(5)
    expect(p.metrics.healers).toBe(2)
    expect(p.metrics.hardCc).toBe(2)
    expect(p.metrics.tanks).toBe(1) // Vladimir has the Tank tag but low defense
    expect(p.metrics.apShare).toBeCloseTo(0.9)
    expect(p.names.healers).toEqual(['Soraka', 'Vladimir'])
    expect(formatReason('{apShare} / {healers} / {healersNames} / {nope}', p)).toBe('90% / 2 / Soraka, Vladimir / {nope}')
  })
  it('lets champion-tags override tank detection', () => {
    const t = parseChampionTags({ version: 1, champions: { Darius: { tank: true }, Leona: { tank: false } } })
    const p = buildEnemyProfile([darius, leona, ornn], t)
    expect(p.names.tanks).toEqual(['Darius', 'Ornn'])
  })
  it('handles an empty enemy list', () => {
    const p = buildEnemyProfile([], tags)
    expect(p.metrics.enemies).toBe(0)
    expect(p.metrics.apShare).toBe(0)
  })
})

describe('recommend by rules', () => {
  const result = run(garen, [soraka, vladimir, ahri, syndra, leona])
  it('ranks anti-heal first and magic resist next, skipping AP items for an AD champion', () => {
    expect(result.level).toBe('rules')
    expect(names(result.items).slice(0, 4)).toEqual(['Mortal Reminder', 'Thornmail', 'Jak Sho', 'Force of Nature'])
    expect(names(result.items)).not.toContain('Morellonomicon')
    expect(names(result.items)).not.toContain('Ornn masterwork')
    expect(names(result.items)).not.toContain('Long Sword')
  })
  it('explains every recommendation with source and reason', () => {
    const top = result.items[0]
    expect(top?.source).toBe('rules')
    expect(top?.reasons[0]).toContain('Soraka, Vladimir')
    expect(top?.ruleIds).toContain('antiheal-many-healers')
    for (const r of result.items) expect(r.reasons.length).toBeGreaterThan(0)
  })
  it('recommends boots by threat', () => {
    expect(names(result.boots)).toEqual(['Mercurys Treads', 'Ionian Boots'])
  })
  it('flips for an AP champion against a physical team', () => {
    const r = run(ahri, [aatrox, zed, jinx, darius, garen])
    expect(r.level).toBe('rules')
    const list = names(r.items)
    expect(list[0]).toBe('Zhonyas Hourglass') // armor on an AP item
    expect(list).toContain('Morellonomicon') // AP item with anti-heal (one healer)
    expect(list).not.toContain('Thornmail') // purely defensive: not for a squishy mage
    expect(list).not.toContain('Randuins')
    expect(list).not.toContain('Black Cleaver') // AD item for an AP champion
    expect(list).not.toContain('Mortal Reminder')
    expect(names(r.boots)[0]).toBe('Plated Steelcaps')
  })
  it('keeps purely defensive items for fighters and tanks but not for squishy champions', () => {
    const enemies = [zed, jinx, darius, aatrox, garen]
    expect(names(run(garen, enemies).items)).toContain('Thornmail')
    expect(names(run(ahri, enemies).items)).not.toContain('Thornmail')
    expect(names(run(zed, enemies).items)).not.toContain('Randuins')
  })
  it('still offers boots to squishy champions and prefers magic penetration boots for AP', () => {
    const r = run(ahri, [zed, jinx, darius, aatrox, garen])
    expect(r.boots.length).toBeGreaterThan(0)
    const mage = recommend({ me: ahri, role: 'MIDDLE', enemies: [leona], items: [...catalog, mkItem(24, 'Sorcerers Shoes', { tags: ['Boots'], description: stats([18, 'Magic Penetration']), goldTotal: 1100 })], tags, rules })
    expect(names(mage.boots)[0]).toBe('Sorcerers Shoes')
  })
  it('uses a class plus damage core for AP assassins', () => {
    const akali = champ('Akali', ['Assassin'], 5, 8)
    const r = run(akali, [])
    expect(r.level).toBe('core')
    expect(r.items.map((i) => i.ruleIds[0])).toEqual(['core:Assassin:ap'])
    expect(names(r.items)).toEqual(['Void Staff'])
  })
  it('uses armor penetration against tanks for AD and magic penetration for AP', () => {
    const tanks = [leona, ornn, darius]
    expect(names(run(garen, tanks).items)).toContain('Mortal Reminder')
    expect(names(run(ahri, tanks).items)).toContain('Void Staff')
  })
  it('honours excludeItems', () => {
    const r = run(garen, [soraka, vladimir, ahri, syndra, leona], { excludeItems: ['Thornmail'] })
    expect(names(r.items)).not.toContain('Thornmail')
  })
  it('lets hybrid and adaptive items through for both damage types', () => {
    const hybrid = mkItem(31, 'Hybrid Rageblade', { tags: ['Damage', 'SpellDamage', 'Armor'], description: stats([40, 'Attack Damage'], [40, 'Ability Power'], [30, 'Armor']), goldTotal: 3000 })
    const adaptive = mkItem(32, 'Adaptive Blade', { tags: ['Damage', 'Armor'], description: stats([50, 'Adaptive Force'], [30, 'Armor']), goldTotal: 3000 })
    const extra = [...catalog, hybrid, adaptive]
    const enemies = [zed, jinx, darius, aatrox, garen]
    const ad = recommend({ me: garen, role: 'TOP', enemies, items: extra, tags, rules })
    const ap = recommend({ me: ahri, role: 'MIDDLE', enemies, items: extra, tags, rules })
    for (const r of [ad, ap]) {
      expect(names(r.items)).toContain('Hybrid Rageblade')
      expect(names(r.items)).toContain('Adaptive Blade')
    }
  })
  it('applies role specific exclusions', () => {
    const base = [soraka, vladimir, ahri, syndra, leona]
    const withSupportItem = [...catalog, mkItem(30, 'Locket', { tags: ['SpellBlock'], description: stats([60, 'Magic Resist']), goldTotal: 2200 })]
    const rulesByRole = { ...rules, excludeItemsByRole: { TOP: ['Locket'] } }
    const top = recommend({ me: garen, role: 'TOP', enemies: base, items: withSupportItem, tags, rules: rulesByRole })
    const sup = recommend({ me: garen, role: 'UTILITY', enemies: base, items: withSupportItem, tags, rules: rulesByRole })
    expect(names(top.items)).not.toContain('Locket')
    expect(names(sup.items)).toContain('Locket')
  })
  it('limits the list sizes', () => {
    const r = run(garen, [soraka, vladimir, ahri, syndra, leona])
    expect(r.items.length).toBeLessThanOrEqual(6)
    expect(r.boots.length).toBeLessThanOrEqual(2)
  })
  it('respects role restrictions of a rule', () => {
    const custom = parseRules({
      version: 1,
      rules: [{ id: 'jg', roles: ['JUNGLE'], when: [{ metric: 'enemies', atLeast: 1 }], anyOf: ['armor'], weight: 2, reason: 'r' }],
    })
    const r = recommend({ me: garen, role: 'TOP', enemies: [jinx], items: catalog, tags, rules: custom })
    expect(r.items).toEqual([])
    const jg = recommend({ me: garen, role: 'JUNGLE', enemies: [jinx], items: catalog, tags, rules: custom })
    expect(jg.items.length).toBeGreaterThan(0)
  })
})

describe('fallback to core items', () => {
  it('uses class core when no rule matches (no enemies yet)', () => {
    const r = run(garen, [])
    expect(r.level).toBe('core')
    expect(r.boots).toEqual([])
    expect(names(r.items)).toEqual(['Black Cleaver'])
    expect(r.items[0]?.source).toBe('core')
    expect(r.items[0]?.ruleIds).toEqual(['core:Fighter'])
  })
  it('skips mana items for a champion without mana but not for others', () => {
    const wukong = champ('MonkeyKing', ['Fighter', 'Tank'], 8, 2, 300)
    expect(names(run(garen, []).items)).not.toContain('Manamune')
    expect(names(run(wukong, []).items)).toContain('Manamune')
  })
  it('tops up a short rule list with core items without duplicates', () => {
    const r = run(garen, [jinx])
    const list = r.items.map((i) => i.itemId)
    expect(new Set(list).size).toBe(list.length)
    expect(r.items.some((i) => i.source === 'core')).toBe(true)
  })
})
