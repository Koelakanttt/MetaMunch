import { z } from 'zod'
import type { Champion } from '@shared/ddragon'
import type { LiveChampion, LiveGameStatus, LiveMe } from '@shared/live-game'
import { readLiveGame as defaultReadLiveGame } from '../providers/live-client'
import type { StaticDataSource } from './recommendation-service'

const PlayerSchema = z.object({
  championName: z.string().default(''),
  summonerName: z.string().default(''),
  team: z.string().default(''),
  position: z.string().default(''),
  items: z
    .array(z.object({ itemID: z.number(), count: z.number().default(1) }))
    .default([]),
})

const LiveSchema = z.object({
  activePlayer: z.object({
    summonerName: z.string().default(''),
    championName: z.string().default(''),
  }),
  allPlayers: z.array(PlayerSchema).default([]),
  gameData: z.object({
    gameTime: z.number().default(0),
    gameMode: z.string().default(''),
    mapName: z.string().default(''),
  }),
})

export interface LiveGamePayload {
  activePlayer: { summonerName: string; championName: string }
  allPlayers: {
    championName: string
    summonerName: string
    team: string
    position: string
    items: { itemID: number; count: number }[]
  }[]
  gameData: { gameTime: number; gameMode: string; mapName: string }
}

export function parseLiveGame(json: unknown): LiveGamePayload {
  return LiveSchema.parse(json)
}

export interface LiveGameDeps {
  source: StaticDataSource
  readLiveGame?: () => Promise<unknown | null>
}

/** Read-only live game status: my champion, my items and the visible enemy team. */
export class LiveGameService {
  private readonly source: StaticDataSource
  private readonly readLiveGame: () => Promise<unknown | null>

  constructor(deps: LiveGameDeps) {
    this.source = deps.source
    this.readLiveGame = deps.readLiveGame ?? defaultReadLiveGame
  }

  async status(): Promise<LiveGameStatus> {
    let payload: unknown | null
    try {
      payload = await this.readLiveGame()
    } catch (error) {
      return {
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    if (payload === null) return { state: 'not-in-game' }

    try {
      const live = parseLiveGame(payload)
      const mePlayer =
        live.allPlayers.find(
          (player) => player.summonerName === live.activePlayer.summonerName,
        ) ??
        live.allPlayers.find(
          (player) => player.championName === live.activePlayer.championName,
        )
      if (!mePlayer) {
        return { state: 'error', message: 'Could not identify your player in the live game.' }
      }

      const version = this.source.latestVersion()
      const champions = version === null ? [] : this.source.champions(version)
      const items = version === null ? [] : this.source.items(version)
      const byChampion = new Map<string, Champion>()
      for (const champion of champions) {
        byChampion.set(champion.id, champion)
        byChampion.set(champion.name, champion)
      }
      const itemNames = new Map(items.map((item) => [item.id, item.name]))

      const resolve = (championName: string, position: string): LiveChampion => {
        const champion = byChampion.get(championName)
        return {
          championId: champion?.id ?? null,
          name: champion?.name ?? (championName || null),
          position: position.toUpperCase(),
        }
      }

      const me: LiveMe = {
        ...resolve(mePlayer.championName, mePlayer.position),
        items: mePlayer.items
          .filter((item) => item.itemID > 0)
          .map((item) => ({ id: item.itemID, name: itemNames.get(item.itemID) ?? `Item ${item.itemID}` })),
      }

      const enemies = live.allPlayers
        .filter((player) => player.team !== mePlayer.team && player.team !== '')
        .map((player) => resolve(player.championName, player.position))

      return {
        state: 'live',
        gameTime: live.gameData.gameTime,
        gameMode: live.gameData.gameMode,
        mapName: live.gameData.mapName,
        me,
        enemies,
      }
    } catch (error) {
      return {
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
