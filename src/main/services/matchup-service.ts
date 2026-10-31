import type { DatabaseSync } from 'node:sqlite'
import type { MatchupEntry, MatchupsResponse } from '@shared/matchups'
import { matchupTotals } from '../db/matchup-repo'
import type { StaticDataSource } from './recommendation-service'

const MIN_GAMES = 5
const MAX_LISTS = 5

export interface MatchupDeps {
  db: DatabaseSync
  source: StaticDataSource
}

/** Own-sample lane matchups for the selected champion, with icons rendered by the UI. */
export class MatchupService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource

  constructor(deps: MatchupDeps) {
    this.db = deps.db
    this.source = deps.source
  }

  forChampion(championId: string): MatchupsResponse {
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const byKey = new Map(champions.map((champion) => [champion.key, champion]))
    const me = champions.find((champion) => champion.id === championId)

    if (!me) {
      return {
        championId,
        championName: null,
        strong: [],
        weak: [],
        all: [],
        hasStaticData: version !== null,
      }
    }

    const entries: MatchupEntry[] = matchupTotals(this.db, me.key)
      .map((row) => {
        const enemy = byKey.get(row.championKey)
        if (!enemy) return null
        const winRate = row.games === 0 ? 0 : row.wins / row.games
        return {
          championId: enemy.id,
          name: enemy.name,
          games: row.games,
          wins: row.wins,
          winRate,
          lowSample: row.games < MIN_GAMES,
        }
      })
      .filter((entry): entry is MatchupEntry => entry !== null)

    return {
      championId,
      championName: me.name,
      strong: entries
        .filter((entry) => entry.games >= MIN_GAMES && entry.winRate >= 0.55)
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, MAX_LISTS),
      weak: entries
        .filter((entry) => entry.games >= MIN_GAMES && entry.winRate <= 0.45)
        .sort((a, b) => a.winRate - b.winRate)
        .slice(0, MAX_LISTS),
      all: entries,
      hasStaticData: true,
    }
  }
}
