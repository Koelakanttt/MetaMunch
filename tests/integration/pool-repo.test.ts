import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { listPool } from '../../src/main/db/pool-repo'
import { insertMatch, memoryDb } from '../helpers/db'

const ME = 'puuid-me'

function seed(db: DatabaseSync): void {
  const add = (id: string, queue: number, champion: number, creation: number, remake = false): void => {
    insertMatch(db, {
      id,
      queue,
      creation,
      remake,
      participants: [{ team: 100, champion, win: true, puuid: ME }],
    })
  }

  add('EUW1_1', 420, 103, 1)
  add('EUW1_2', 440, 103, 2)
  add('EUW1_3', 400, 103, 3)
  add('EUW1_4', 420, 86, 4)
  add('EUW1_5', 420, 86, 5)
  add('EUW1_6', 420, 103, 6, true)
  add('EUW1_7', 450, 103, 7)
}

describe('listPool', () => {
  it('counts personal-queue games, skips remakes and other queues', () => {
    const db = memoryDb()
    seed(db)

    expect(listPool(db, ME)).toEqual([{ championKey: 103, games: 3 }])
  })

  it('honours minGames and limit', () => {
    const db = memoryDb()
    seed(db)

    expect(listPool(db, ME, 8, 1)).toEqual([
      { championKey: 103, games: 3 },
      { championKey: 86, games: 2 },
    ])
    expect(listPool(db, ME, 1, 1)).toEqual([{ championKey: 103, games: 3 }])
  })

  it('returns nothing for an unknown account', () => {
    const db = memoryDb()
    seed(db)

    expect(listPool(db, 'puuid-nobody')).toEqual([])
  })
})
