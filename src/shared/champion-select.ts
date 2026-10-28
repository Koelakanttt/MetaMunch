export interface DetectedChampion {
  championKey: number
  /** Data Dragon id when static data knows the key; otherwise null. */
  championId: string | null
  name: string | null
  position: string
}

export type ChampionSelectStatus =
  | { state: 'not-found'; message: string }
  | { state: 'idle'; phase: string }
  | {
      state: 'champ-select'
      phase: string
      me: DetectedChampion | null
      enemies: DetectedChampion[]
      hiddenEnemies: number
    }
  | { state: 'error'; message: string }
