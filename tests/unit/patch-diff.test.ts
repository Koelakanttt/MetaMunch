import { describe, expect, it } from 'vitest'
import type { Item } from '../../src/shared/ddragon'
import type { ChampionDetail, SpellDetail } from '../../src/shared/ddragon-detail'
import {
  diffChampion,
  diffItem,
  diffStats,
  previousPatchVersion,
} from '../../src/shared/patch-diff'

function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: 'Item',
    plaintext: '',
    description: '',
    tags: [],
    stats: {},
    goldTotal: 1000,
    purchasable: true,
    from: [],
    into: [],
    maps: { '11': true },
    inStore: true,
    requiredAlly: null,
    requiredChampion: null,
    ...over,
  }
}

function makeSpell(over: Partial<SpellDetail> = {}): SpellDetail {
  return { id: 'Q', name: 'Precision Protocol', cooldown: [], cost: [], range: [], effects: [], ...over }
}

function makeDetail(over: Partial<ChampionDetail> = {}): ChampionDetail {
  return {
    id: 'Camille',
    name: 'Camille',
    stats: {},
    passiveName: 'Adaptive Defenses',
    spells: [],
    ...over,
  }
}

describe('previousPatchVersion', () => {
  it('picks the first version from an older patch', () => {
    expect(previousPatchVersion(['16.21.2', '16.21.1', '16.20.1'], '16.21.2')).toBe('16.20.1')
  })

  it('works when the current version is not in the list', () => {
    expect(previousPatchVersion(['16.20.5', '16.19.1'], '16.21.1')).toBe('16.20.5')
  })

  it('ignores junk entries', () => {
    expect(previousPatchVersion(['junk', '1.2', '16.20.1'], '16.21.1')).toBe('16.20.1')
  })

  it('returns null when no older patch is found', () => {
    expect(previousPatchVersion(['16.21.1', '16.21.0'], '16.21.1')).toBeNull()
    expect(previousPatchVersion(['junk'], '16.21.1')).toBeNull()
  })
})

describe('diffStats', () => {
  it('reports changed and one-sided keys sorted by name', () => {
    expect(diffStats({ hp: 590, armor: 21 }, { hp: 600, armor: 21, mp: 400 })).toEqual([
      { label: 'hp', before: '590', after: '600' },
      { label: 'mp', before: '—', after: '400' },
    ])
  })

  it('returns no changes for equal stats', () => {
    expect(diffStats({ hp: 590 }, { hp: 590 })).toEqual([])
  })
})

describe('diffChampion', () => {
  it('diffs stats, cooldowns, ranges and effect arrays', () => {
    const before = makeDetail({
      stats: { hp: 690 },
      spells: [
        makeSpell({ cooldown: [9, 8.5, 8], cost: [25], range: [175], effects: [[1, 2], [3]] }),
      ],
    })
    const after = makeDetail({
      stats: { hp: 700 },
      spells: [
        makeSpell({ cooldown: [8, 7.5, 7], cost: [30], range: [180], effects: [[1, 2], [4]] }),
      ],
    })

    const changes = diffChampion(before, after)

    expect(changes.map((change) => change.label)).toEqual([
      'hp',
      'Q (Precision Protocol) cooldown',
      'Q (Precision Protocol) cost',
      'Q (Precision Protocol) range',
      'Q (Precision Protocol) effect 2',
    ])
    expect(changes[1]).toEqual({
      label: 'Q (Precision Protocol) cooldown',
      before: '9/8.5/8',
      after: '8/7.5/7',
    })
  })

  it('reports passive and spell name changes', () => {
    const before = makeDetail({ passiveName: 'Old passive', spells: [makeSpell({ name: 'Old name' })] })
    const after = makeDetail({ passiveName: 'New passive', spells: [makeSpell({ name: 'New name' })] })

    const labels = diffChampion(before, after).map((change) => change.label)

    expect(labels).toEqual(['Passive name', 'Q (New name) name'])
  })
})

describe('diffItem', () => {
  it('diffs cost, stats and the plain description', () => {
    const before = makeItem({
      goldTotal: 3000,
      stats: { FlatPhysicalDamageMod: 35 },
      description: `<mainText>${'x'.repeat(300)}</mainText>`,
    })
    const after = makeItem({
      goldTotal: 3100,
      stats: { FlatPhysicalDamageMod: 40, FlatCritChanceMod: 0.25 },
      description: `<mainText>${'y'.repeat(300)}</mainText>`,
    })

    const changes = diffItem(before, after)

    expect(changes.map((change) => change.label)).toEqual([
      'Total cost',
      'Stat: FlatCritChanceMod',
      'Stat: FlatPhysicalDamageMod',
      'Description',
    ])
    expect(changes[3]?.before).toHaveLength(200)
    expect(changes[3]?.after).toHaveLength(200)
  })

  it('returns no changes for equal items', () => {
    const item = makeItem()

    expect(diffItem(item, item)).toEqual([])
  })
})
