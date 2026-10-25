import type { Champion, Item } from '@shared/ddragon'
import { damageClass, recommend, type Recommendation } from '@shared/recommend'
import {
  parseRecommendRequest,
  type ChampionListResponse,
  type RecommendRequest,
  type RecommendResponse,
  type RecommendationView,
} from '@shared/recommend-api'
import type { ChampionTags, Rules } from '@shared/rules'

/** Read access to the stored static data of the latest patch. */
export interface StaticDataSource {
  latestVersion(): string | null
  champions(version: string): Champion[]
  items(version: string): Item[]
}

export interface RecommendationServiceDeps {
  source: StaticDataSource
  rules: Rules
  tags: ChampionTags
}

function view(r: Recommendation): RecommendationView {
  return { itemId: r.itemId, name: r.name, source: r.source, reasons: r.reasons, ruleIds: r.ruleIds, score: r.score }
}

export class RecommendationService {
  constructor(private readonly deps: RecommendationServiceDeps) {}

  listChampions(): ChampionListResponse {
    const version = this.deps.source.latestVersion()
    if (version === null) return { version: null, champions: [] }
    const champions = this.deps.source
      .champions(version)
      .map((c) => ({ id: c.id, name: c.name, tags: c.tags }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { version, champions }
  }

  run(input: unknown): RecommendResponse {
    const request: RecommendRequest = parseRecommendRequest(input)
    const { source, rules, tags } = this.deps
    const version = source.latestVersion()
    if (version === null) throw new Error('No static data yet. Press "Update data" first.')

    const champions = source.champions(version)
    const byId = new Map(champions.map((c) => [c.id, c]))
    const me = byId.get(request.meId)
    if (!me) throw new Error(`Unknown champion: ${request.meId}`)
    if (new Set(request.enemyIds).size !== request.enemyIds.length) {
      throw new Error('Duplicate enemy champion')
    }
    const enemies = request.enemyIds.map((id) => {
      const champion = byId.get(id)
      if (!champion) throw new Error(`Unknown champion: ${id}`)
      return champion
    })

    const result = recommend({ me, role: request.role, enemies, items: source.items(version), tags, rules })
    return {
      version,
      level: result.level,
      me: { id: me.id, name: me.name, damage: damageClass(me, tags) },
      profile: { metrics: result.profile.metrics, names: result.profile.names },
      items: result.items.map(view),
      boots: result.boots.map(view),
    }
  }
}
