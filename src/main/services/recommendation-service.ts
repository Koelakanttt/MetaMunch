import type { Champion, Item } from '@shared/ddragon'
import { buildItemPool } from '@shared/item-traits'
import { itemMath, optimizeBuild, type ThreatMetrics } from '@shared/item-value'
import { archetypeOf, damageClass, recommend, type Recommendation } from '@shared/recommend'
import {
  parseRecommendRequest,
  type ChampionListResponse,
  type MathBuildView,
  type RecommendRequest,
  type RecommendResponse,
  type RecommendationView,
} from '@shared/recommend-api'
import type { PersonalStats } from '@shared/personal'
import type { ChampionTags, Rules } from '@shared/rules'
import { DEFAULT_RESEARCH_FILTERS } from '@shared/research'
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

function itemView(
  item: Item | undefined,
  itemId: number,
  name: string,
  source: RecommendationView['source'],
  reasons: string[],
  ruleIds: string[],
  score: number,
  evidence: RecommendationView['evidence'],
): RecommendationView {
  return {
    itemId,
    name,
    source,
    reasons,
    ruleIds,
    score,
    gold: item?.goldTotal ?? 0,
    plaintext: item?.plaintext ?? '',
    stats: item?.stats ?? {},
    evidence,
  }
}

function view(r: Recommendation, items: ReadonlyMap<number, Item>): RecommendationView {
  const item = items.get(r.itemId)
  return itemView(item, r.itemId, r.name, r.source, r.reasons, r.ruleIds, r.score, r.evidence ?? null)
}

function mathView(
  item: Item | undefined,
  itemId: number,
  name: string,
  reasons: string[],
  ruleIds: string[],
  score: number,
): RecommendationView {
  return itemView(item, itemId, name, 'math', reasons, ruleIds, score, null)
}

function buildMathBuild(
  items: readonly Item[],
  rules: Rules,
  role: RecommendRequest['role'],
  damage: 'ad' | 'ap' | 'mixed',
  archetype: ReturnType<typeof archetypeOf>,
  metrics: ThreatMetrics,
  sample: { games: number; samplePatch: string } | null,
): MathBuildView | null {
  if (!sample) return null
  const excluded = [
    ...rules.excludeItems,
    ...(rules.excludeItemsByRole[role] ?? []),
  ]
  const pool = buildItemPool(items, excluded, role)
  const best = optimizeBuild(pool.items, pool.boots, damage, archetype, metrics, {
    groups: rules.groups,
    requireBoots: true,
  })
  if (!best) return null
  const utility = (item: Item): number =>
    itemMath(item, damage, archetype, metrics).utility
  return {
    items: best.items.map((item) =>
      mathView(
        item,
        item.id,
        item.name,
        ['Formula prior: stat/gold utility, not a win-rate model.'],
        ['math:item'],
        utility(item),
      ),
    ),
    boots: best.boots
      ? [
          mathView(
            best.boots,
            best.boots.id,
            best.boots.name,
            ['Formula prior: stat/gold utility, not a win-rate model.'],
            ['math:boots'],
            utility(best.boots),
          ),
        ]
      : [],
    score: best.score,
    gold: best.gold,
    note: `Formula-only second view. Research sample: ${sample.games} games, patch ${sample.samplePatch}; math breaks ties only.`,
    sampleGames: sample.games,
    samplePatch: sample.samplePatch,
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
    const dataSource = request.source ?? 'combined'
    const personal = this.deps.personal?.forChampion(me, enemies, items) ?? null
    const prior = personal
      ? { games: personal.games, build: personal.build.map((b) => ({ name: b.name, games: b.games })) }
      : undefined
    const evidence =
      dataSource === 'personal'
        ? null
        : (this.deps.evidence?.forChampion(
            me,
            request.role,
            items,
            enemies[0],
            request.filters ?? DEFAULT_RESEARCH_FILTERS,
          ) ?? null)

    const result = recommend({
      me,
      role: request.role,
      enemies,
      items,
      tags,
      rules,
      prior,
      source: dataSource,
      ...(evidence ? { evidence } : {}),
      ...(evidence?.research ? { research: evidence.research } : {}),
    })

    const sample = evidence?.research ?? null
    const missingResearch =
      dataSource === 'personal'
        ? null
        : !sample
          ? `No research sample for ${me.name} ${request.role} yet: start the research crawl on the Research page.`
          : sample.items.length === 0
            ? `Research sample for ${me.name} ${request.role} has ${sample.games} games on patch ${sample.scope.samplePatch}; 30 are required for item and rune rankings. Showing the rule/class fallback.`
            : null
    const damage = damageClass(me, tags)
    const archetype = archetypeOf(me, tags)
    const mathBuild = buildMathBuild(
      items,
      rules,
      request.role,
      damage,
      archetype,
      result.profile.metrics,
      evidence?.research
        ? {
            games: evidence.research.games,
            samplePatch: evidence.research.scope.samplePatch,
          }
        : null,
    )

    return {
      version,
      level: result.level,
      source: dataSource,
      me: {
        id: me.id,
        name: me.name,
        damage,
        archetype,
      },
      profile: { metrics: result.profile.metrics, names: result.profile.names },
      core: result.core.map((item) => view(item, itemsById)),
      items: result.items.map((item) => view(item, itemsById)),
      boots: result.boots.map((item) => view(item, itemsById)),
      personal,
      evidence: evidence?.scope ?? null,
      laneEvidence: evidence?.lane ?? null,
      mathBuild,
      researchNote: missingResearch,
      research: evidence?.research ?? null,
    }
  }
}
