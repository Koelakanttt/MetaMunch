import { describe, expect, it } from 'vitest'
import type { Champion, Item } from '../../src/shared/ddragon'
import { loadChampionTags, loadRules } from '../../src/main/data/rules-data'
import { RecommendationService, type PersonalStatsProvider, type StaticDataSource } from '../../src/main/services/recommendation-service'
import { mkItem, stats } from '../helpers/items'

function champ(id: string, name: string, tags: string[], attack: number, magic: number, defense = 5, mp = 300): Champion {
  return { key: 1, id, name, tags, info: { attack, defense, magic, difficulty: 5 }, stats: { mp } }
}

const champions: Champion[] = [
  champ('Garen', 'Garen', ['Fighter', 'Tank'], 7, 1, 7, 0),
  champ('MonkeyKing', 'Wukong', ['Fighter', 'Tank'], 8, 2, 5),
  champ('Soraka', 'Soraka', ['Support', 'Mage'], 2, 7),
  champ('Vladimir', 'Vladimir', ['Mage', 'Tank'], 2, 8, 6),
  champ('Ahri', 'Ahri', ['Mage', 'Assassin'], 3, 8),
  champ('Syndra', 'Syndra', ['Mage'], 2, 9),
  champ('Leona', 'Leona', ['Tank', 'Support'], 4, 3, 8),
]

const items: Item[] = [
  mkItem(1, 'Thornmail', { tags: ['Armor'], description: stats([60, 'Armor']) + 'applies 40% Wounds', goldTotal: 2450 }),
  mkItem(2, 'Mortal Reminder', { tags: ['Damage', 'ArmorPenetration'], description: stats([35, 'Attack Damage']) + 'applies 40% Wounds', goldTotal: 3000 }),
  mkItem(3, 'Force of Nature', { tags: ['SpellBlock'], description: stats([70, 'Magic Resist']), goldTotal: 2800 }),
  mkItem(4, 'Black Cleaver', { tags: ['Damage', 'Health'], description: stats([40, 'Attack Damage'], [400, 'Health'], [20, 'Ability Haste']), goldTotal: 3000 }),
  mkItem(5, 'Chainlaced Crushers', { tags: ['Boots', 'SpellBlock'], description: stats([25, 'Magic Resist']), goldTotal: 1250 }),
]

function service(version: string | null = '16.21.1', personal?: PersonalStatsProvider) {
  const source: StaticDataSource = {
    latestVersion: () => version,
    champions: () => champions,
    items: () => items,
  }
  return new RecommendationService({ source, rules: loadRules(), tags: loadChampionTags(), ...(personal ? { personal } : {}) })
}

describe('data loaders', () => {
  it('bundle and validate the real rules and champion tags', () => {
    expect(loadRules().rules.length).toBeGreaterThan(5)
    expect(Object.keys(loadChampionTags().champions).length).toBeGreaterThan(30)
  })
})

describe('RecommendationService.listChampions', () => {
  it('returns champions sorted by display name', () => {
    const list = service().listChampions()
    expect(list.version).toBe('16.21.1')
    expect(list.champions.map((c) => c.name)).toEqual(['Ahri', 'Garen', 'Leona', 'Soraka', 'Syndra', 'Vladimir', 'Wukong'])
    expect(list.champions.find((c) => c.name === 'Wukong')?.id).toBe('MonkeyKing')
  })
  it('is empty without static data', () => {
    expect(service(null).listChampions()).toEqual({ version: null, champions: [] })
  })
})

describe('RecommendationService.run', () => {
  const request = { meId: 'Garen', role: 'TOP', enemyIds: ['Soraka', 'Vladimir', 'Ahri', 'Syndra', 'Leona'] }

  it('returns a serializable response with profile and reasons', () => {
    const r = service().run(request)
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
    expect(r.version).toBe('16.21.1')
    expect(r.level).toBe('rules')
    expect(r.me).toEqual({ id: 'Garen', name: 'Garen', damage: 'ad' })
    expect(r.profile.names.healers).toEqual(['Soraka', 'Vladimir'])
    expect(r.profile.metrics.enemies).toBe(5)
    expect(r.items.map((i) => i.name).slice(0, 2).sort()).toEqual(['Mortal Reminder', 'Thornmail'])
    expect(r.items[0]?.reasons[0]).toContain('Soraka, Vladimir')
    expect(r.items[0]?.source).toBe('rules')
    expect(r.boots.map((b) => b.name)).toContain('Chainlaced Crushers')
  })
  it('uses display data of the right champion for ids that differ from names', () => {
    const r = service().run({ meId: 'MonkeyKing', role: 'TOP', enemyIds: [] })
    expect(r.me.name).toBe('Wukong')
    expect(r.level).toBe('core')
  })
  it('works with fewer than five enemies', () => {
    expect(service().run({ meId: 'Garen', role: 'TOP', enemyIds: ['Soraka'] }).profile.metrics.enemies).toBe(1)
  })
  it('rejects bad input with readable messages', () => {
    const s = service()
    expect(() => s.run({ ...request, role: 'MIDLANE' })).toThrow('Invalid request')
    expect(() => s.run({ ...request, enemyIds: ['a', 'b', 'c', 'd', 'e', 'f'] })).toThrow('Invalid request')
    expect(() => s.run({ meId: '', role: 'TOP', enemyIds: [] })).toThrow('Invalid request')
    expect(() => s.run(null)).toThrow('Invalid request')
    expect(() => s.run({ ...request, meId: 'Nobody' })).toThrow('Unknown champion: Nobody')
    expect(() => s.run({ ...request, enemyIds: ['Soraka', 'Nobody'] })).toThrow('Unknown champion: Nobody')
    expect(() => s.run({ ...request, enemyIds: ['Soraka', 'Soraka'] })).toThrow('Duplicate enemy champion')
  })
  it('has no personal section without a provider and passes the provider result through', () => {
    expect(service().run(request).personal).toBeNull()
    const fake: PersonalStatsProvider = {
      forChampion: (me, enemies) => ({ account: 'x#1', games: me.id === 'Garen' ? enemies.length : 0, wins: 0, lowSample: true, build: [], vs: [] }),
    }
    expect(service('16.21.1', fake).run(request).personal?.games).toBe(5)
  })
  it('asks to update the data when nothing is stored', () => {
    expect(() => service(null).run(request)).toThrow('Update data')
  })
})
