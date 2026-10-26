import type { DatabaseSync } from 'node:sqlite'
import type { Champion, Item } from '@shared/ddragon'
import { isLowSample, summarizeBuild, type PersonalStats } from '@shared/personal'
import { listMyGames, matchupRecord } from '../db/personal-stats-repo'

export interface TrackedAccount {
  puuid: string
  gameName: string
  tagLine: string
}

export interface PersonalStatsDeps {
  db: DatabaseSync
  getAccount: () => TrackedAccount | null
}

export class PersonalStatsService {
  constructor(private readonly deps: PersonalStatsDeps) {}

  /** Null when no account is tracked yet. */
  forChampion(me: Champion, enemies: readonly Champion[], items: readonly Item[]): PersonalStats | null {
    const account = this.deps.getAccount()
    if (!account) return null
    const games = listMyGames(this.deps.db, account.puuid, me.key)
    const wins = games.filter((g) => g.win).length
    return {
      account: `${account.gameName}#${account.tagLine}`,
      games: games.length,
      wins,
      lowSample: isLowSample(games.length),
      build: summarizeBuild(games, items),
      vs: enemies.map((enemy) => {
        const record = matchupRecord(this.deps.db, account.puuid, me.key, enemy.key)
        return {
          enemyId: enemy.id,
          enemyName: enemy.name,
          games: record.games,
          wins: record.wins,
          lowSample: isLowSample(record.games),
        }
      }),
    }
  }
}
