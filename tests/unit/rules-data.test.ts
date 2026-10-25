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
  })
  it('champion-tags.json is valid and uses Data Dragon style ids', () => {
    const tags = parseChampionTags(data('champion-tags.json'))
    const ids = Object.keys(tags.champions)
    expect(ids.length).toBeGreaterThan(30)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z]+$/)
    expect(tags.champions['Soraka']?.healing).toBe(true)
    expect(tags.champions['Leona']?.cc).toBe('hard')
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
})
