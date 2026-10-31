import type { Champion, Item } from '@shared/ddragon'
import { archetypeOf, damageClass, recommend, type Recommendation } from '@shared/recommend'
import {
  parseRecommendRequest,
  type ChampionListResponse,
  type RecommendRequest,
  type RecommendResponse,
  type RecommendationView,
} from '@shared/recommend-api'
import type { PersonalStats } from '@shared/personal'
import type { ChampionTags, Rules } from '@shared/rules'
import type { EvidenceProvider } from './research-evidence-provider'

/** Read access to the stored static data of the latest patch. */
export interface StaticDataSource {
  latestVersion(): string | null
  champions(version: string): Champion[]
  items(version: string): Item[]
}

/** Personal statistics of the tracked account (optional part of the response). */
export interface PersonalStatsProvider {
  forChampion(me: Champion, enemies: readonly Champion[], items: readonly Item[]): PersonalStats | null
}

export interface RecommendationServiceDeps {
  source: StaticDataSource
  rules: Rules
  tags: ChampionTags
  personal?: PersonalStatsProvider
  evidence?: EvidenceProvider
}

function view(r: Recommendation, items: ReadonlyMap<number, Item>): RecommendationView {
  const item = items.get(r.itemId)
  return {
    itemId: r.itemId,
    name: r.name,
    source: r.source,
    reasons: r.reasons,
    ruleIds: r.ruleIds,
    score: r.score,
    gold: item?.goldTotal ?? 0,
    plaintext: item?.plaintext ?? '',
    stats: item?.stats ?? {},
    evidence: r.evidence ?? null,
  }
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

    const items = source.items(version)
    const itemsById = new Map(items.map((item) => [item.id, item]))
    const personal = this.deps.personal?.forChampion(me, enemies, items) ?? null
    const prior = personal
      ? { games: personal.games, build: personal.build.map((b) => ({ name: b.name, games: b.games })) }
      : undefined
    const evidence = this.deps.evidence?.forChampion(
      me,
      request.role,
      items,
      enemies[0],
    ) ?? null

    const result = recommend({
      me,
      role: request.role,
      enemies,
      items,
      tags,
      rules,
      prior,
      ...(evidence ? { evidence } : {}),
      ...(evidence?.research ? { research: evidence.research } : {}),
    })

    const missingResearch =
      !evidence?.research || evidence.research.items.length === 0
        ? `No research sample for ${me.name} ${request.role} yet: start the research crawl on the Research page.`
        : null

    return {
      version,
      level: result.level,
      me: {
        id: me.id,
        name: me.name,
        damage: damageClass(me, tags),
        archetype: archetypeOf(me, tags),
      },
      profile: { metrics: result.profile.metrics, names: result.profile.names },
      core: result.core.map((item) => view(item, itemsById)),
      items: result.items.map((item) => view(item, itemsById)),
      boots: result.boots.map((item) => view(item, itemsById)),
      personal,
      evidence: evidence?.scope ?? null,
      laneEvidence: evidence?.lane ?? null,
      researchNote: missingResearch,
    }
  }
}
