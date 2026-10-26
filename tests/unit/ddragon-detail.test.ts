import { describe, expect, it } from 'vitest'
import { parseChampionDetail } from '../../src/shared/ddragon-detail'

describe('parseChampionDetail', () => {
  it('parses the real shape and turns null effects into empty arrays', () => {
    const json = {
      type: 'champion',
      data: {
        Camille: {
          id: 'Camille',
          name: 'Camille',
          stats: { hp: 650, armor: 35 },
          passive: { name: 'Adaptive Defenses', description: 'ignored' },
          spells: [
            {
              id: 'CamilleQ',
              name: 'Precision Protocol',
              cooldown: [9, 8.5, 8],
              cost: [25],
              range: [175],
              effect: [null, [1, 2, 3]],
            },
          ],
          extra: 'ignored',
        },
      },
    }

    const detail = parseChampionDetail(json, 'Camille')

    expect(detail.id).toBe('Camille')
    expect(detail.name).toBe('Camille')
    expect(detail.stats).toEqual({ hp: 650, armor: 35 })
    expect(detail.passiveName).toBe('Adaptive Defenses')
    expect(detail.spells).toHaveLength(1)
    expect(detail.spells[0]?.cooldown).toEqual([9, 8.5, 8])
    expect(detail.spells[0]?.effects).toEqual([[], [1, 2, 3]])
  })

  it('defaults missing arrays', () => {
    const json = { data: { Camille: { id: 'Camille', name: 'Camille', spells: [{ id: 'Q', name: 'Q' }] } } }

    const detail = parseChampionDetail(json, 'Camille')

    expect(detail.stats).toEqual({})
    expect(detail.passiveName).toBe('')
    expect(detail.spells[0]?.cooldown).toEqual([])
    expect(detail.spells[0]?.cost).toEqual([])
    expect(detail.spells[0]?.range).toEqual([])
    expect(detail.spells[0]?.effects).toEqual([])
  })

  it('throws when the champion entry is missing', () => {
    expect(() => parseChampionDetail({ data: {} }, 'Camille')).toThrow('Camille')
  })

  it('throws on a malformed payload', () => {
    expect(() => parseChampionDetail(null, 'Camille')).toThrow()
  })
})
