import type { DatabaseSync } from 'node:sqlite'
import type { SynergiesResponse, SynergyEntry } from '@shared/synergies'
import { synergyTotals } from '../db/synergy-repo'
import type { StaticDataSource } from './recommendation-service'

const MIN_GAMES = 3
const MAX_LISTS = 5

export interface SynergyDeps {
  db: DatabaseSync
  source: StaticDataSource
}

/** Same-team synergies for the selected champion from the stored sample. */
export class SynergyService {
  private readonly db: DatabaseSync
  private readonly source: StaticDataSource

  constructor(deps: SynergyDeps) {
    this.db = deps.db
    this.source = deps.source
  }

  forChampion(championId: string): SynergiesResponse {
    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const byKey = new Map(champions.map((champion) => [champion.key, champion]))
    const me = champions.find((champion) => champion.id === championId)

    if (!me) {
      return {
        championId,
        championName: null,
        best: [],
        worst: [],
        all: [],
        hasStaticData: version !== null,
      }
    }

    const entries: SynergyEntry[] = synergyTotals(this.db, me.key)
      .map((row) => {
        const ally = byKey.get(row.championKey)
        if (!ally) return null
        return {
          championId: ally.id,
          name: ally.name,
          games: row.games,
          wins: row.wins,
          winRate: row.games === 0 ? 0 : row.wins / row.games,
          lowSample: row.games < MIN_GAMES,
        }
      })
      .filter((entry): entry is SynergyEntry => entry !== null)

    return {
      championId,
      championName: me.name,
      best: entries
        .filter((entry) => entry.games >= MIN_GAMES && entry.winRate >= 0.55)
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, MAX_LISTS),
      worst: entries
        .filter((entry) => entry.games >= MIN_GAMES && entry.winRate <= 0.45)
        .sort((a, b) => a.winRate - b.winRate)
        .slice(0, MAX_LISTS),
      all: entries.slice(0, 10),
      hasStaticData: true,
    }
  }
}
