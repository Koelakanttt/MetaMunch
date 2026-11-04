import { describe, expect, it } from 'vitest'
import { memoryDb, insertMatch } from '../helpers/db'
import { GameSessionWatcher, POST_GAME_DELAYS_MS } from '../../src/main/services/game-session-watcher'

const ME = 'puuid-me'

function setup() {
  const db = memoryDb()
  insertMatch(db, {
    id: 'EUW1_old',
    queue: 420,
    creation: 1,
    participants: [{ team: 100, champion: 86, win: true, puuid: ME, position: 'TOP' }],
  })
  let live = true
  const delays: number[] = []
  let synced = 0
  const watcher = new GameSessionWatcher({
    db,
    getAccount: () => ({ puuid: ME, gameName: 'Me', tagLine: '1' }),
    readLiveGame: async () => (live ? {} : null),
    sync: async () => {
      synced += 1
      insertMatch(db, {
        id: 'EUW1_new',
        queue: 420,
        creation: 2,
        participants: [{ team: 100, champion: 86, win: true, puuid: ME, position: 'TOP' }],
      })
    },
    sleep: async (ms) => {
      delays.push(ms)
    },
  })
  return {
    watcher,
    setLive: (value: boolean) => {
      live = value
    },
    delays,
    getSynced: () => synced,
  }
}

describe('GameSessionWatcher', () => {
  it('does not sync while the game is live', async () => {
    const { watcher, getSynced } = setup()
    await watcher.check()
    expect(getSynced()).toBe(0)
  })

  it('syncs after a live -> not-live transition and stops after a new match', async () => {
    const { watcher, setLive, delays, getSynced } = setup()
    await watcher.check()
    setLive(false)
    await watcher.check()
    expect(delays[0]).toBe(POST_GAME_DELAYS_MS[0])
    expect(getSynced()).toBe(1)
  })

  it('uses the delayed attempts in order', async () => {
    const { watcher } = setup()
    await watcher.runAttempts()
    expect(POST_GAME_DELAYS_MS).toEqual([45000, 90000, 180000])
  })
})
