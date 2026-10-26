import { describe, expect, it } from 'vitest'
import { isLowSample, summarizeBuild, type MyGame } from '../../src/shared/personal'
import { mkItem } from '../helpers/items'

const catalog = [
  mkItem(3075, 'Thornmail', { goldTotal: 2450 }),
  mkItem(323075, 'Thornmail', { goldTotal: 2650 }), // mode variant of the same item
  mkItem(3071, 'Black Cleaver'),
  mkItem(3111, 'Boots of Test', { tags: ['Boots'], goldTotal: 1100 }),
  mkItem(1036, 'Long Sword', { goldTotal: 350 }), // component, not a final item
  mkItem(2003, 'Health Potion', { goldTotal: 50, tags: ['Consumable'] }),
]

function game(matchId: string, items: number[], win = true): MyGame {
  return { matchId, win, teamId: 100, items, patch: '16.21', gameCreation: 1 }
}

describe('summarizeBuild', () => {
  it('counts completed items and boots per game, merging variants by name', () => {
    const games = [
      game('a', [3075, 3071, 3111, 1036, 2003, 0]),
      game('b', [323075, 3071, 0, 0, 0, 0]),
      game('c', [3075, 3075, 0, 0, 0, 0]), // the same item twice counts once per game
    ]
    expect(summarizeBuild(games, catalog)).toEqual([
      { itemId: 3075, name: 'Thornmail', games: 3 },
      { itemId: 3071, name: 'Black Cleaver', games: 2 },
      { itemId: 3111, name: 'Boots of Test', games: 1 },
    ])
  })
  it('ignores items that no longer exist and honours the top limit', () => {
    expect(summarizeBuild([game('a', [999999, 3071])], catalog)).toEqual([{ itemId: 3071, name: 'Black Cleaver', games: 1 }])
    expect(summarizeBuild([game('a', [3075, 3071, 3111])], catalog, 2)).toHaveLength(2)
  })
  it('returns [] without games', () => {
    expect(summarizeBuild([], catalog)).toEqual([])
  })
})

describe('isLowSample', () => {
  it('flags fewer than 5 games', () => {
    expect(isLowSample(4)).toBe(true)
    expect(isLowSample(5)).toBe(false)
  })
})
