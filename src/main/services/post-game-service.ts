import type { DatabaseSync } from 'node:sqlite'
import type { Champion } from '@shared/ddragon'
import type { Change } from '@shared/patch-diff'
import type { PostGameChange, PostGameResult, PostGameReview } from '@shared/post-game'
import { ROLES, type Role } from '@shared/rules'
import { latestMatchForPlayer, matchParticipants } from '../db/post-game-repo'
import type { TrackedAccount } from './personal-stats-service'
import type { RecommendationService } from './recommendation-service'
import type { StaticDataSource } from './recommendation-service'

function roleFor(position: string): Role {
  return ROLES.includes(position as Role) ? (position as Role) : 'TOP'
}

export interface PostGameDeps {
  db: DatabaseSync
  getAccount: () => TrackedAccount | null
  source: StaticDataSource
  recommendation: RecommendationService
  championChanges?: (championId: string) => Promise<Change[] | null>
}

/** Compares the last stored game with the recommendations regenerated for its composition. */
export class PostGameService {
  private readonly db: DatabaseSync
  private readonly getAccount: () => TrackedAccount | null
  private readonly source: StaticDataSource
  private readonly recommendation: RecommendationService
  private readonly championChanges:
    | ((championId: string) => Promise<Change[] | null>)
    | undefined

  constructor(deps: PostGameDeps) {
    this.db = deps.db
    this.getAccount = deps.getAccount
    this.source = deps.source
    this.recommendation = deps.recommendation
    this.championChanges = deps.championChanges
  }

  async review(): Promise<PostGameResult> {
    const account = this.getAccount()
    if (!account) return { state: 'no-account' }

    const latest = latestMatchForPlayer(this.db, account.puuid)
    if (!latest) return { state: 'no-matches' }

    const version = this.source.latestVersion()
    const champions = version === null ? [] : this.source.champions(version)
    const items = version === null ? [] : this.source.items(version)
    const byKey = new Map(champions.map((champion) => [champion.key, champion]))
    const itemNames = new Map(items.map((item) => [item.id, item.name]))

    const me = byKey.get(latest.championKey)
    const purchased = latest.items
      .filter((id) => id > 0)
      .map((id) => itemNames.get(id) ?? `Item ${id}`)
    const purchasedNames = new Set(purchased)

    let recommended: { name: string; source: string }[] = []
    if (me) {
      const enemies = matchParticipants(this.db, latest.matchId)
        .filter((participant) => participant.teamId !== latest.teamId)
        .map((participant) => byKey.get(participant.championKey))
        .filter((champion): champion is Champion => champion !== undefined)
        .slice(0, 5)
      if (enemies.length > 0) {
        const result = this.recommendation.run({
          meId: me.id,
          role: roleFor(latest.position),
          enemyIds: enemies.map((enemy) => enemy.id),
        })
        const unique = new Map<string, { name: string; source: string }>()
        for (const entry of [...result.core, ...result.items, ...result.boots]) {
          unique.set(entry.name, { name: entry.name, source: entry.source })
        }
        recommended = [...unique.values()]
      }
    }

    const missed = recommended
      .map((entry) => entry.name)
      .filter((name) => !purchasedNames.has(name))

    let patchChanges: PostGameChange[] | null = null
    if (me && this.championChanges) {
      try {
        patchChanges = await this.championChanges(me.id)
      } catch {
        patchChanges = null
      }
    }

    const review: PostGameReview = {
      match: {
        matchId: latest.matchId,
        championId: me?.id ?? null,
        championName: me?.name ?? null,
        position: latest.position,
        win: latest.win,
        queueId: latest.queueId,
        patch: latest.patch,
        gameCreation: latest.gameCreation,
        durationSec: latest.durationSec,
        items: latest.items
          .filter((id) => id > 0)
          .map((id) => ({ id, name: itemNames.get(id) ?? `Item ${id}` })),
      },
      recommended,
      missed,
      patchChanges,
    }

    return { state: 'ready', review }
  }
}
