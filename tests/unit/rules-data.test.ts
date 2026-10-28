import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseChampionTags, parseRules } from '../../src/shared/rules'

function data(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', name), 'utf8'))
}

describe('data files', () => {
  it('rules.json is valid', () => {
    const rules = parseRules(data('rules.json'))
    expect(rules.rules.length).toBeGreaterThan(5)
    expect(rules.rules.some((r) => r.slot === 'boots')).toBe(true)
    expect(Object.keys(rules.coreByClass)).toContain('Fighter')
    expect(rules.excludeItemsByRole.TOP?.length).toBeGreaterThan(5)
    expect(Object.keys(rules.archetypes)).toHaveLength(6)
    expect(rules.archetypes.bruiser?.label).toBe('bruisers')
    expect(rules.groups.map((group) => group.id)).toEqual([
      'antiheal',
      'armorPen',
      'magicPen',
      'tenacity',
    ])
    expect(rules.groups.every((group) => group.max === 1)).toBe(true)
    expect(rules.bootsAllowlist).toEqual([])
    expect(rules.rules.some((rule) => rule.id === 'boots-haste-default')).toBe(false)
    expect(rules.rules.find((rule) => rule.id === 'boots-attack-speed-marksman')?.archetypes).toEqual([
      'marksman',
    ])
  })
  it('champion-tags.json is valid and uses Data Dragon style ids', () => {
    const tags = parseChampionTags(data('champion-tags.json'))
    const ids = Object.keys(tags.champions)
    expect(ids.length).toBeGreaterThan(30)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z]+$/)
    expect(tags.champions['Soraka']?.healing).toBe(true)
    expect(tags.champions['Leona']?.cc).toBe('hard')
    expect(tags.champions['Ahri']?.cc).toBe('hard')
    expect(tags.champions['Aatrox']?.archetype).toBe('bruiser')
    expect(tags.champions['Briar']?.archetype).toBe('bruiser')
  })
})

describe('rules validation', () => {
  const base = {
    version: 1,
    rules: [
      {
        id: 'r1',
        when: [{ metric: 'healers', atLeast: 1 }],
        anyOf: ['antiheal'],
        weight: 1,
        reason: 'x {healers}',
      },
    ],
  }
  it('accepts a minimal file and applies defaults', () => {
    const r = parseRules(base)
    expect(r.excludeItems).toEqual([])
    expect(r.rules[0]?.slot).toBe('item')
    expect(r.coreByClass).toEqual({})
  })
  it('rejects an unknown trait, placeholder, metric or a condition without bounds', () => {
    const withRule = (patch: Record<string, unknown>) => ({
      ...base,
      rules: [{ ...base.rules[0], ...patch }],
    })
    expect(() => parseRules(withRule({ anyOf: ['nonsense'] }))).toThrow()
    expect(() => parseRules(withRule({ reason: 'see {bogus}' }))).toThrow()
    expect(() => parseRules(withRule({ when: [{ metric: 'bogus', atLeast: 1 }] }))).toThrow()
    expect(() => parseRules(withRule({ when: [{ metric: 'healers' }] }))).toThrow()
    expect(() => parseRules(withRule({ anyOf: [], allOf: [] }))).toThrow()
  })
  it('validates role keys of excludeItemsByRole', () => {
    expect(parseRules({ ...base, excludeItemsByRole: { TOP: ['x'] } }).excludeItemsByRole.TOP).toEqual(['x'])
    expect(() => parseRules({ ...base, excludeItemsByRole: { MIDLANE: ['x'] } })).toThrow()
  })
  it('rejects duplicate rule ids and a wrong version', () => {
    expect(() => parseRules({ ...base, rules: [base.rules[0], base.rules[0]] })).toThrow()
    expect(() => parseRules({ ...base, version: 2 })).toThrow()
  })
  it('validates archetypes, groups, bootsAllowlist and rule archetypes', () => {
    expect(
      parseRules({
        ...base,
        archetypes: { bruiser: { label: 'bruisers', prefer: ['ad'], avoid: ['mana'] } },
      }).archetypes.bruiser?.label,
    ).toBe('bruisers')
    expect(() =>
      parseRules({
        ...base,
        archetypes: { wizard: { label: 'wizards', prefer: [], avoid: [] } },
      }),
    ).toThrow()
    expect(() =>
      parseRules({
        ...base,
        archetypes: { bruiser: { label: 'bruisers', prefer: ['nonsense'], avoid: [] } },
      }),
    ).toThrow()
    expect(() => parseRules({ ...base, groups: [{ id: 'g', trait: 'antiheal', max: 0 }] })).toThrow()
    expect(() =>
      parseRules({
        ...base,
        rules: [{ ...base.rules[0], archetypes: ['wizard'] }],
      }),
    ).toThrow()

    const rules = parseRules({
      ...base,
      rules: [{ ...base.rules[0], archetypes: ['mage'] }],
    })
    expect(rules.rules[0]?.archetypes).toEqual(['mage'])
  })
  it('validates champion archetypes', () => {
    expect(() =>
      parseChampionTags({ version: 1, champions: { Ahri: { archetype: 'wizard' } } }),
    ).toThrow()
  })
})
