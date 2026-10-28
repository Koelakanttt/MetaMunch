export interface LiveItem {
  id: number
  name: string
}

export interface LiveChampion {
  championId: string | null
  name: string | null
  position: string
}

export interface LiveMe extends LiveChampion {
  items: LiveItem[]
}

export type LiveGameStatus =
  | { state: 'not-in-game' }
  | {
      state: 'live'
      gameTime: number
      gameMode: string
      mapName: string
      me: LiveMe
      enemies: LiveChampion[]
    }
  | { state: 'error'; message: string }
