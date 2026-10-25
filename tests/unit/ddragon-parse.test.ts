import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseChampionList, parseItemList, parseRealmVersion } from '../../src/shared/ddragon'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

describe('parseRealmVersion', () => {
  it('returns the realm version', () => {
    expect(parseRealmVersion(fixture('realm-euw.json'))).toBe('16.3.1')
  })
  it('throws on a malformed version', () => {
    expect(() => parseRealmVersion({ v: 'abc' })).toThrow()
  })
})

describe('parseChampionList', () => {
  it('parses valid champions sorted by key and skips invalid ones', () => {
    const { values, skipped } = parseChampionList(fixture('champion.json'))
    expect(values.map((c) => c.key)).toEqual([62, 86, 103])
    expect(skipped).toEqual(['Broken'])
  })
  it('keeps the Data Dragon id separate from the display name', () => {
    const { values } = parseChampionList(fixture('champion.json'))
    const wukong = values.find((c) => c.key === 62)
    expect(wukong?.id).toBe('MonkeyKing')
    expect(wukong?.name).toBe('Wukong')
    expect(wukong?.tags).toEqual(['Fighter', 'Tank'])
    expect(wukong?.info.attack).toBe(8)
    expect(wukong?.stats['hp']).toBe(700)
  })
  it('throws when the file is malformed or has no valid entries', () => {
    expect(() => parseChampionList({})).toThrow()
    expect(() => parseChampionList({ data: { x: {} } })).toThrow()
  })
})

describe('parseItemList', () => {
  it('parses valid items sorted by id and skips invalid ones', () => {
    const { values, skipped } = parseItemList(fixture('item.json'))
    expect(values.map((i) => i.id)).toEqual([1001, 1036, 2003, 3033])
    expect(skipped.sort()).toEqual(['9999', 'abc'])
  })
  it('converts relations to numbers and maps gold fields', () => {
    const { values } = parseItemList(fixture('item.json'))
    const boots = values.find((i) => i.id === 1001)
    expect(boots?.into).toEqual([3006, 3009])
    expect(boots?.from).toEqual([])
    expect(boots?.goldTotal).toBe(300)
    expect(boots?.purchasable).toBe(true)
    expect(boots?.maps['11']).toBe(true)
    expect(boots?.stats['FlatMovementSpeedMod']).toBe(25)
    const mr = values.find((i) => i.id === 3033)
    expect(mr?.from).toEqual([1036, 1018])
    expect(mr?.tags).toContain('ArmorPenetration')
  })
  it('fills defaults for missing optional fields', () => {
    const { values } = parseItemList(fixture('item.json'))
    const potion = values.find((i) => i.id === 2003)
    expect(potion?.plaintext).toBe('')
    expect(potion?.tags).toEqual([])
    expect(potion?.stats).toEqual({})
    expect(potion?.into).toEqual([])
  })
  it('throws when nothing is valid', () => {
    expect(() => parseItemList({ data: { '1': {} } })).toThrow()
  })
  it('reads availability fields with safe defaults', () => {
    const gold = { total: 3000, purchasable: true }
    const { values } = parseItemList({
      data: {
        '1': { name: 'Ornn upgrade', gold, inStore: false, requiredAlly: 'Ornn' },
        '2': { name: 'Locked', gold, requiredChampion: 'Viktor' },
        '3': { name: 'Plain', gold, requiredAlly: '' },
      },
    })
    const byId = new Map(values.map((i) => [i.id, i]))
    expect(byId.get(1)).toMatchObject({ inStore: false, requiredAlly: 'Ornn', requiredChampion: null })
    expect(byId.get(2)).toMatchObject({ inStore: true, requiredAlly: null, requiredChampion: 'Viktor' })
    expect(byId.get(3)).toMatchObject({ inStore: true, requiredAlly: null, requiredChampion: null })
  })
})
