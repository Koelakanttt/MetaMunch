import { describe, expect, it } from 'vitest'
import type { Champion, Item } from '../../src/shared/ddragon'
import {
  archetypeOf,
  buildEnemyProfile,
  damageClass,
  formatReason,
  recommend,
} from '../../src/shared/recommend'
import { itemTraits } from '../../src/shared/item-traits'
import { parseChampionTags, parseRules, type Rules } from '../../src/shared/rules'
import { mkItem, stats } from '../helpers/items'

function champ(
  id: string,
  tags: string[],
  attack: number,
  magic: number,
  mp = 300,
  defense = 5,
): Champion {
  return {
    key: 1,
    id,
    name: id,
    tags,
    info: { attack, defense, magic, difficulty: 5 },
    stats: { mp },
  }
}

const garen = champ('Garen', ['Fighter', 'Tank'], 7, 1, 0, 7)
const ahri = champ('Ahri', ['Mage', 'Assassin'], 3, 8)
const soraka = champ('Soraka', ['Support', 'Mage'], 2, 7)
const vladimir = champ('Vladimir', ['Mage', 'Tank'], 2, 8)
const jinx = champ('Jinx', ['Marksman'], 9, 2)
const zed = champ('Zed', ['Assassin'], 9, 1)
const aatrox = champ('Aatrox', ['Fighter', 'Tank'], 8, 3)
const ornn = champ('Ornn', ['Tank', 'Fighter'], 5, 3, 300, 9)
const darius = champ('Darius', ['Fighter', 'Tank'], 9, 1)
const briar = champ('Briar', ['Assassin'], 9, 2)

const bruiser = {
  label: 'bruisers',
  prefer: ['ad', 'health', 'abilityHaste'],
  avoid: ['crit', 'mana'],
}
const tank = {
  label: 'tanks',
  prefer: ['health', 'armor', 'mr', 'abilityHaste'],
  avoid: ['crit', 'attackSpeed'],
}
const assassin = {
  label: 'assassins',
  prefer: ['ad', 'ap', 'armorPen', 'magicPen', 'abilityHaste'],
  avoid: [],
}
const mage = {
  label: 'mages',
  prefer: ['ap', 'abilityHaste', 'magicPen', 'mana'],
  avoid: ['attackSpeed', 'crit'],
}
const marksman = {
  label: 'marksmen',
  prefer: ['ad', 'attackSpeed', 'crit', 'onHit', 'armorPen'],
  avoid: ['mana', 'healShieldPower'],
}
const enchanter = {
  label: 'enchanters',
  prefer: ['healShieldPower', 'abilityHaste', 'mana', 'ap'],
  avoid: ['ad', 'crit'],
}
const archetypes = { bruiser, tank, assassin, mage, marksman, enchanter }

const tags = parseChampionTags({
  version: 1,
  champions: {
    Aatrox: { healing: true, archetype: 'bruiser' },
    Ahri: { archetype: 'mage' },
    Jinx: { archetype: 'marksman' },
    Briar: { healing: true, archetype: 'bruiser' },
    Soraka: { healing: true },
    Vladimir: { healing: true },
  },
})

const catalog: Item[] = [
  mkItem(1, 'Warrior Blade', {
    tags: ['Damage', 'Health', 'AbilityHaste'],
    description: stats([40, 'Attack Damage'], [400, 'Health'], [20, 'Ability Haste']),
    goldTotal: 3000,
  }),
  mkItem(2, 'Tank Plate', {
    tags: ['Armor', 'Health'],
    description: stats([60, 'Armor'], [300, 'Health']),
    goldTotal: 2800,
  }),
  mkItem(3, 'Mage Staff', {
    tags: ['SpellDamage', 'Mana', 'AbilityHaste'],
    description: stats([80, 'Ability Power'], [500, 'Mana'], [20, 'Ability Haste']),
    goldTotal: 3000,
  }),
  mkItem(4, 'Rapid Bow', {
    tags: ['Damage', 'AttackSpeed'],
    description: stats([30, 'Attack Damage'], ['35%', 'Attack Speed']),
    goldTotal: 3000,
  }),
  mkItem(5, 'Crit Edge', {
    tags: ['Damage', 'CriticalStrike'],
    description: stats([40, 'Attack Damage'], [25, 'Critical Strike Chance']),
    goldTotal: 3000,
  }),
  mkItem(6, 'Armor Boots', {
    tags: ['Boots', 'Armor'],
    description: stats([20, 'Armor']),
    goldTotal: 1100,
  }),
  mkItem(7, 'Magic Resist Boots', {
    tags: ['Boots', 'SpellBlock'],
    description: stats([25, 'Magic Resist']),
    goldTotal: 1100,
  }),
  mkItem(8, 'Sorcerer Shoes', {
    tags: ['Boots'],
    description: stats([18, 'Magic Penetration']),
    goldTotal: 1100,
  }),
  mkItem(9, 'Attack Speed Boots', {
    tags: ['Boots', 'AttackSpeed'],
    description: stats(['35%', 'Attack Speed']),
    goldTotal: 1100,
  }),
  mkItem(10, 'Chempunk Chainsword', {
    tags: ['Damage', 'Health'],
    description: stats([40, 'Attack Damage'], [400, 'Health']) + 'applies 40% Wounds',
    goldTotal: 3000,
  }),
  mkItem(11, 'Thornmail', {
    tags: ['Armor'],
    description: stats([60, 'Armor']) + 'Grievous Wounds',
    goldTotal: 2700,
  }),
  mkItem(12, 'Mortal Reminder', {
    tags: ['Damage', 'CriticalStrike'],
    description: stats([35, 'Attack Damage'], [25, 'Critical Strike Chance']) + 'applies 40% Wounds',
    goldTotal: 3000,
  }),
  mkItem(13, 'Morellonomicon', {
    tags: ['SpellDamage'],
    description: stats([75, 'Ability Power']) + 'Grievous Wounds',
    goldTotal: 2200,
  }),
]

const traitsByName = new Map(catalog.map((item) => [item.name, itemTraits(item)]))

function runWith(
  me: Champion,
  enemies: Champion[],
  rules: Rules,
  options: {
    items?: Item[]
    prior?: { games: number; build: { name: string; games: number }[] }
  } = {},
) {
  return recommend({
    me,
    role: 'TOP',
    enemies,
    items: options.items ?? catalog,
    tags,
    rules,
    prior: options.prior,
  })
}

const names = (list: { name: string }[]) => list.map((item) => item.name)

describe('archetypeOf', () => {
  it('uses the explicit archetype first', () => {
    const explicit = parseChampionTags({ version: 1, champions: { Garen: { archetype: 'mage' } } })
    expect(archetypeOf(garen, explicit)).toBe('mage')
  })

  it('detects tanks with the defense rule', () => {
    expect(archetypeOf(ornn, tags)).toBe('tank')
    expect(archetypeOf(champ('LowTank', ['Tank'], 5, 3, 300, 3), tags)).toBe('bruiser')
  })

  it('maps Data Dragon tags in priority order', () => {
    expect(archetypeOf(jinx, tags)).toBe('marksman')
    expect(archetypeOf(zed, tags)).toBe('assassin')
    expect(archetypeOf(ahri, tags)).toBe('mage')
    expect(archetypeOf(darius, tags)).toBe('bruiser')
    expect(archetypeOf(soraka, tags)).toBe('mage')
    expect(archetypeOf(champ('Janna', ['Support'], 2, 7), tags)).toBe('enchanter')
    expect(archetypeOf(champ('Nothing', [], 5, 5), tags)).toBe('bruiser')
  })

  it('keeps the tank override working', () => {
    const forced = parseChampionTags({ version: 1, champions: { LowTank: { tank: true } } })
    expect(archetypeOf(champ('LowTank', ['Tank'], 5, 3, 300, 3), forced)).toBe('tank')
    const denied = parseChampionTags({ version: 1, champions: { Ornn: { tank: false } } })
    expect(archetypeOf(ornn, denied)).toBe('bruiser')
  })
})

describe('enemy profile', () => {
  it('counts enemies by archetype, not raw tags', () => {
    const p = buildEnemyProfile([ahri, jinx, zed, ornn, briar], tags)

    expect(p.metrics.tanks).toBe(1)
    expect(p.metrics.assassins).toBe(1)
    expect(p.metrics.marksmen).toBe(1)
    expect(p.metrics.mages).toBe(1)
    expect(p.names.tanks).toEqual(['Ornn'])
    expect(p.names.assassins).toEqual(['Zed'])
    expect(p.names.marksmen).toEqual(['Jinx'])
    expect(p.names.mages).toEqual(['Ahri'])
    expect(p.names.healers).toEqual(['Briar'])
  })

  it('keeps damage shares and formatting', () => {
    const p = buildEnemyProfile([soraka, vladimir, ahri], tags)
    expect(p.metrics.apShare).toBe(1)
    expect(formatReason('{apShare} / {healersNames} / {nope}', p)).toBe(
      '100% / Soraka, Vladimir / {nope}',
    )
  })
})

describe('situational ranking', () => {
  const antihealRules = parseRules({
    version: 1,
    archetypes,
    groups: [{ id: 'antiheal', trait: 'antiheal', max: 1 }],
    rules: [
      {
        id: 'heal',
        when: [{ metric: 'healers', atLeast: 1 }],
        anyOf: ['antiheal'],
        weight: 4,
        reason: '{healers} healing enemies.',
      },
    ],
    coreByClass: {},
  })

  it('keeps only one item per exclusive group and fits the bruiser', () => {
    const result = runWith(aatrox, [soraka], antihealRules)

    expect(names(result.items)).toEqual(['Chempunk Chainsword'])
    expect(result.items[0]?.reasons).toEqual([
      '1 healing enemies.',
      'Fits bruisers: attack damage, health.',
    ])
  })

  it('gives the marksman the crit variant instead of the bruiser one', () => {
    const result = runWith(jinx, [soraka], antihealRules)

    expect(names(result.items)).toEqual(['Mortal Reminder'])
    expect(result.items[0]?.reasons[1]).toBe('Fits marksmen: attack damage, critical strike chance.')
  })

  it('adds a fit sentence when no prefer trait matches', () => {
    const armorRules = parseRules({
      version: 1,
      archetypes,
      rules: [
        {
          id: 'armor',
          when: [{ metric: 'enemies', atLeast: 1 }],
          anyOf: ['armor'],
          weight: 3,
          reason: 'Armor threat.',
        },
      ],
      coreByClass: {},
    })
    const plainArmor = mkItem(20, 'Plain Armor', {
      tags: ['Armor'],
      description: stats([50, 'Armor']),
      goldTotal: 2500,
    })

    const result = runWith(aatrox, [jinx], armorRules, { items: [plainArmor] })

    expect(result.items[0]?.reasons).toEqual(['Armor threat.', 'Not a typical pick for bruisers.'])
  })

  it('drops items with an avoid trait and no prefer trait', () => {
    const critRules = parseRules({
      version: 1,
      archetypes,
      rules: [
        {
          id: 'crit',
          when: [{ metric: 'enemies', atLeast: 1 }],
          anyOf: ['crit'],
          weight: 3,
          reason: 'Crit threat.',
        },
      ],
      coreByClass: {},
    })
    const critOnly = mkItem(21, 'Crit Cloak', {
      tags: ['CriticalStrike'],
      description: stats([25, 'Critical Strike Chance']),
      goldTotal: 1200,
    })
    const critHealth = mkItem(22, 'Crit Health', {
      tags: ['CriticalStrike', 'Health'],
      description: stats([25, 'Critical Strike Chance'], [300, 'Health']),
      goldTotal: 2600,
    })

    const result = runWith(aatrox, [jinx], critRules, { items: [critOnly, critHealth] })

    expect(names(result.items)).toEqual(['Crit Health'])
  })
})

describe('core list', () => {
  const coreRules = parseRules({
    version: 1,
    archetypes,
    rules: [],
    coreByClass: {
      Fighter: { traits: ['ad', 'health', 'abilityHaste'], reason: 'Fighter core.' },
    },
  })

  it('uses my build when there are at least three games', () => {
    const result = runWith(aatrox, [], coreRules, {
      prior: { games: 3, build: [{ name: 'Warrior Blade', games: 3 }] },
    })

    expect(result.core).toHaveLength(1)
    expect(result.core[0]?.source).toBe('personal')
    expect(result.core[0]?.reasons).toEqual(['In your usual build (3 of 3 games).'])
    expect(result.level).toBe('core')
  })

  it('falls back to the class core below three games', () => {
    const result = runWith(aatrox, [], coreRules, {
      prior: { games: 2, build: [{ name: 'Warrior Blade', games: 2 }] },
    })

    expect(result.core[0]?.source).toBe('core')
    expect(result.core[0]?.reasons[0]).toMatch(/^Fighter core\. /)
    expect(result.core.length).toBeLessThanOrEqual(4)
  })

  it('never repeats a core item in the situational list', () => {
    const adRules = parseRules({
      version: 1,
      archetypes,
      rules: [
        {
          id: 'ad',
          when: [{ metric: 'enemies', atLeast: 1 }],
          anyOf: ['ad'],
          weight: 3,
          reason: 'AD threat.',
        },
      ],
      coreByClass: {},
    })

    const result = runWith(aatrox, [jinx], adRules, {
      prior: { games: 3, build: [{ name: 'Warrior Blade', games: 3 }] },
    })

    expect(names(result.core)).toContain('Warrior Blade')
    expect(names(result.items)).not.toContain('Warrior Blade')
    expect(result.items.length).toBeGreaterThan(0)
  })
})

describe('boots', () => {
  const bootsRules = parseRules({
    version: 1,
    archetypes,
    rules: [
      {
        id: 'boots-armor',
        slot: 'boots',
        when: [
          { metric: 'enemies', atLeast: 3 },
          { metric: 'adShare', atLeast: 0.6 },
        ],
        anyOf: ['armor'],
        weight: 3,
        reason: 'Physical threat.',
      },
      {
        id: 'boots-ap',
        slot: 'boots',
        when: [{ metric: 'enemies', atLeast: 1 }],
        myDamage: 'ap',
        anyOf: ['magicPen'],
        weight: 2,
        reason: 'Magic damage.',
      },
      {
        id: 'boots-marksman',
        slot: 'boots',
        archetypes: ['marksman'],
        when: [{ metric: 'enemies', atLeast: 1 }],
        anyOf: ['attackSpeed'],
        weight: 2,
        reason: 'AS boots.',
      },
    ],
    coreByClass: {},
  })

  it('recommends no boots when nothing triggers', () => {
    expect(runWith(aatrox, [jinx], bootsRules).boots).toEqual([])
  })

  it('recommends armor boots against a physical team', () => {
    expect(names(runWith(aatrox, [jinx, zed, darius], bootsRules).boots)).toEqual(['Armor Boots'])
  })

  it('recommends magic penetration boots for an AP champion', () => {
    expect(names(runWith(ahri, [jinx], bootsRules).boots)).toEqual(['Sorcerer Shoes'])
  })

  it('recommends attack speed boots for marksmen', () => {
    expect(names(runWith(jinx, [jinx], bootsRules).boots)).toEqual(['Attack Speed Boots'])
  })

  it('honours bootsAllowlist', () => {
    const allowlisted = parseRules({
      version: 1,
      archetypes,
      bootsAllowlist: ['Armor Boots'],
      rules: bootsRules.rules,
      coreByClass: {},
    })

    expect(runWith(ahri, [jinx], allowlisted).boots).toEqual([])
    expect(names(runWith(aatrox, [jinx, zed, darius], allowlisted).boots)).toEqual(['Armor Boots'])
  })
})

describe('generalization (REC-001)', () => {
  const genRules = parseRules({
    version: 1,
    archetypes,
    groups: [
      { id: 'antiheal', trait: 'antiheal', max: 1 },
      { id: 'armorPen', trait: 'armorPen', max: 1 },
      { id: 'magicPen', trait: 'magicPen', max: 1 },
      { id: 'tenacity', trait: 'tenacity', max: 1 },
    ],
    rules: [
      {
        id: 'heal',
        when: [{ metric: 'healers', atLeast: 1 }],
        anyOf: ['antiheal'],
        weight: 4,
        reason: 'Healing threats.',
      },
      {
        id: 'armor',
        when: [
          { metric: 'enemies', atLeast: 3 },
          { metric: 'adShare', atLeast: 0.5 },
        ],
        anyOf: ['armor'],
        weight: 3,
        reason: 'Physical threats.',
      },
    ],
    coreByClass: {
      Fighter: { traits: ['ad', 'health', 'abilityHaste'], reason: 'Fighter core.' },
      Mage: { traits: ['ap', 'abilityHaste', 'mana', 'magicPen'], reason: 'Mage core.' },
      Marksman: { traits: ['ad', 'attackSpeed', 'crit'], reason: 'Marksman core.' },
    },
  })

  const enemies = [soraka, vladimir, ornn, jinx, zed]

  it('produces sane results for three different archetypes', () => {
    const bruiserResult = runWith(aatrox, enemies, genRules)
    const mageResult = runWith(ahri, enemies, genRules)
    const marksmanResult = runWith(jinx, enemies, genRules)

    for (const result of [bruiserResult, mageResult, marksmanResult]) {
      expect(result.core.length + result.items.length).toBeGreaterThan(0)
    }

    expect(names(bruiserResult.core)).not.toContain('Tank Plate')
    expect(names(bruiserResult.core)).not.toContain('Thornmail')

    for (const item of mageResult.items) {
      const traits = traitsByName.get(item.name) ?? []
      expect(traits.includes('ap') || traits.includes('adaptive')).toBe(true)
    }

    for (const result of [bruiserResult, mageResult, marksmanResult]) {
      for (const group of genRules.groups) {
        const count = result.items.filter((item) =>
          (traitsByName.get(item.name) ?? []).includes(group.trait),
        ).length
        expect(count).toBeLessThanOrEqual(group.max)
      }
    }

    const marksmanItems = [...marksmanResult.core, ...marksmanResult.items]
    expect(
      marksmanItems.some((item) => {
        const traits = traitsByName.get(item.name) ?? []
        return traits.includes('ad') || traits.includes('crit')
      }),
    ).toBe(true)
  })
})

describe('damageClass', () => {
  it('uses explicit tags, then info', () => {
    const t = parseChampionTags({ version: 1, champions: { Kayle: { damage: 'mixed' } } })
    expect(damageClass(champ('Kayle', [], 8, 1), t)).toBe('mixed')
    expect(damageClass(garen, tags)).toBe('ad')
    expect(damageClass(ahri, tags)).toBe('ap')
  })
})
