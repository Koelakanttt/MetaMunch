import { describe, expect, it } from 'vitest'
import type { Champion } from '../../src/shared/ddragon'
import { listMyGames, matchupRecord, accountRecord } from '../../src/main/db/personal-stats-repo'
import { PersonalStatsService } from '../../src/main/services/personal-stats-service'
import { insertMatch, memoryDb } from '../helpers/db'
import { mkItem } from '../helpers/items'

const GAREN = 86
const AHRI = 103
const SORAKA = 16
const ME = 'puuid-me'

function seed() {
  const db = memoryDb()
  const enemies = (a: number, b: number) => [
    { team: 200 as const, champion: a, win: false },
    { team: 200 as const, champion: b, win: false },
  ]
  // 1: flex win vs Ahri + Soraka
  insertMatch(db, { id: 'EUW1_1', queue: 440, creation: 1000, participants: [{ team: 100, champion: GAREN, win: true, puuid: ME, items: [3075, 3071, 0, 0, 0, 0] }, ...enemies(AHRI, SORAKA)] })
  // 2: normal draft loss vs Ahri
  insertMatch(db, { id: 'EUW1_2', queue: 400, creation: 2000, participants: [{ team: 100, champion: GAREN, win: false, puuid: ME, items: [3075, 0, 0, 0, 0, 0] }, ...enemies(AHRI, 1)] })
  // 3: ARAM, must be ignored
  insertMatch(db, { id: 'EUW1_3', queue: 450, creation: 3000, participants: [{ team: 100, champion: GAREN, win: true, puuid: ME }, ...enemies(AHRI, SORAKA)] })
  // 4: remake, must be ignored
  insertMatch(db, { id: 'EUW1_4', queue: 420, creation: 4000, remake: true, participants: [{ team: 100, champion: GAREN, win: false, puuid: ME }, ...enemies(AHRI, SORAKA)] })
  // 5: a game on another champion
  insertMatch(db, { id: 'EUW1_5', queue: 420, creation: 5000, participants: [{ team: 100, champion: AHRI, win: true, puuid: ME }, ...enemies(GAREN, SORAKA)] })
  // 6: Garen on the OTHER team (an enemy of mine), not my game
  insertMatch(db, { id: 'EUW1_6', queue: 420, creation: 6000, participants: [{ team: 100, champion: SORAKA, win: true, puuid: ME }, { team: 200, champion: GAREN, win: false }] })
  return db
}

function champ(id: string, key: number): Champion {
  return { key, id, name: id, tags: [], info: { attack: 1, defense: 1, magic: 1, difficulty: 1 }, stats: {} }
}

describe('personal stats repo', () => {
  const db = seed()
  it('lists my games on a champion, newest first, without other queues, remakes or enemy appearances', () => {
    const games = listMyGames(db, ME, GAREN)
    expect(games.map((g) => g.matchId)).toEqual(['EUW1_2', 'EUW1_1'])
    expect(games.map((g) => g.win)).toEqual([false, true])
    expect(games[1]?.items).toEqual([3075, 3071, 0, 0, 0, 0])
    expect(listMyGames(db, 'someone-else', GAREN)).toEqual([])
  })
  it('counts matchups against the other team only', () => {
    expect(matchupRecord(db, ME, GAREN, AHRI)).toEqual({ games: 2, wins: 1 })
    expect(matchupRecord(db, ME, GAREN, SORAKA)).toEqual({ games: 1, wins: 1 })
    expect(matchupRecord(db, ME, GAREN, 999)).toEqual({ games: 0, wins: 0 })
  })
  it('respects a custom queue list', () => {
    expect(listMyGames(db, ME, GAREN, [450]).map((g) => g.matchId)).toEqual(['EUW1_3'])
  })
  it('counts the overall account record without remakes, ARAM or enemy appearances', () => {
    expect(accountRecord(db, ME)).toEqual({ games: 4, wins: 3 })
    expect(accountRecord(db, 'someone-else')).toEqual({ games: 0, wins: 0 })
  })
})

describe('PersonalStatsService', () => {
  const db = seed()
  const items = [mkItem(3075, 'Thornmail'), mkItem(3071, 'Black Cleaver')]
  const service = new PersonalStatsService({ db, getAccount: () => ({ puuid: ME, gameName: 'Бигбули', tagLine: '22222' }) })

  it('builds the summary for a champion', () => {
    const stats = service.forChampion(champ('Garen', GAREN), [champ('Ahri', AHRI), champ('Soraka', SORAKA), champ('Zed', 238)], items)
    expect(stats).not.toBeNull()
    expect(stats?.account).toBe('Бигбули#22222')
    expect(stats?.games).toBe(2)
    expect(stats?.wins).toBe(1)
    expect(stats?.lowSample).toBe(true)
    expect(stats?.adjustedWinRate).toBeCloseTo((1 + 5 * 0.75) / 7)
    expect(stats?.build).toEqual([
      { itemId: 3075, name: 'Thornmail', games: 2 },
      { itemId: 3071, name: 'Black Cleaver', games: 1 },
    ])
    expect(stats?.vs).toEqual([
      { enemyId: 'Ahri', enemyName: 'Ahri', games: 2, wins: 1, lowSample: true },
      { enemyId: 'Soraka', enemyName: 'Soraka', games: 1, wins: 1, lowSample: true },
      { enemyId: 'Zed', enemyName: 'Zed', games: 0, wins: 0, lowSample: true },
    ])
  })
  it('returns zeros for a champion never played', () => {
    const stats = service.forChampion(champ('Yasuo', 157), [], items)
    expect(stats?.games).toBe(0)
    expect(stats?.adjustedWinRate).toBeCloseTo(0.75)
    expect(stats?.build).toEqual([])
  })
  it('returns null without a tracked account', () => {
    const none = new PersonalStatsService({ db, getAccount: () => null })
    expect(none.forChampion(champ('Garen', GAREN), [], items)).toBeNull()
  })
})
