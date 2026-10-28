import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LiveGameService } from '../../src/main/services/live-game-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values
const items = parseItemList(fixture('item.json')).values

function source(version: string | null = '16.3.1'): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => items,
  }
}

function payload(championName = 'Garen', summonerName = 'Me') {
  return {
    activePlayer: { summonerName, championName },
    allPlayers: [
      {
        championName,
        summonerName,
        team: 'ORDER',
        position: 'TOP',
        items: [
          { itemID: 3033, count: 1 },
          { itemID: 0, count: 0 },
        ],
      },
      {
        championName: 'Ahri',
        summonerName: 'Enemy',
        team: 'CHAOS',
        position: 'MIDDLE',
        items: [{ itemID: 1001, count: 1 }],
      },
    ],
    gameData: { gameTime: 605, gameMode: 'CLASSIC', mapName: "Summoner's Rift" },
  }
}

describe('LiveGameService', () => {
  it('maps my champion, items and enemies', async () => {
    const service = new LiveGameService({
      source: source(),
      readLiveGame: async () => payload(),
    })

    const status = await service.status()

    expect(status).toEqual({
      state: 'live',
      gameTime: 605,
      gameMode: 'CLASSIC',
      mapName: "Summoner's Rift",
      me: {
        championId: 'Garen',
        name: 'Garen',
        position: 'TOP',
        items: [{ id: 3033, name: 'Mortal Reminder' }],
      },
      enemies: [{ championId: 'Ahri', name: 'Ahri', position: 'MIDDLE' }],
    })
  })

  it('reports not being in a game', async () => {
    const service = new LiveGameService({
      source: source(),
      readLiveGame: async () => null,
    })

    expect(await service.status()).toEqual({ state: 'not-in-game' })
  })

  it('reports a client error', async () => {
    const service = new LiveGameService({
      source: source(),
      readLiveGame: async () => {
        throw new Error('boom')
      },
    })

    expect(await service.status()).toEqual({ state: 'error', message: 'boom' })
  })

  it('errors when my player cannot be found', async () => {
    const data = payload()
    data.activePlayer.summonerName = 'Ghost'
    data.activePlayer.championName = 'GhostChamp'

    const service = new LiveGameService({ source: source(), readLiveGame: async () => data })

    expect((await service.status()).state).toBe('error')
  })

  it('keeps unknown champions without static data', async () => {
    const service = new LiveGameService({
      source: source(null),
      readLiveGame: async () => payload('NewChamp'),
    })

    const status = await service.status()

    expect(status.state).toBe('live')
    if (status.state !== 'live') return
    expect(status.me.championId).toBeNull()
    expect(status.me.name).toBe('NewChamp')
    expect(status.me.items[0]?.name).toBe('Item 3033')
  })
})
