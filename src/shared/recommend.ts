import type { Champion, Item } from './ddragon'
import type { EvidenceBundle, ItemEvidence } from './evidence'
import type { ResearchBuildSample, ResearchItemSample } from './research'
import { buildItemPool, itemTraits, type Trait } from './item-traits'
import type {
  Archetype,
  ArchetypeProfile,
  ChampionTags,
  Metric,
  Role,
  Rule,
  Rules,
} from './rules'

export type { Archetype } from './rules'
export { ARCHETYPES } from './rules'

export type Damage = 'ad' | 'ap' | 'mixed'

export interface EnemyProfile {
  metrics: Record<Metric, number>
  names: {
    healers: string[]
    hardCc: string[]
    tanks: string[]
    assassins: string[]
    marksmen: string[]
    mages: string[]
  }
}

export interface Recommendation {
  itemId: number
  name: string
  slot: 'item' | 'boots'
  source: 'rules' | 'core' | 'personal' | 'research'
  reasons: string[]
  ruleIds: string[]
  score: number
  evidence?: ItemEvidence
}

export interface RecommendResult {
  level: 'rules' | 'core'
  core: Recommendation[]
  profile: EnemyProfile
  items: Recommendation[]
  boots: Recommendation[]
}

export interface RecommendInput {
  me: Champion
  role: Role
  enemies: readonly Champion[]
  items: readonly Item[]
  tags: ChampionTags
  rules: Rules
  prior?: { games: number; build: { name: string; games: number }[] }
  evidence?: EvidenceBundle
  research?: ResearchBuildSample
}

export const MAX_ITEMS = 6
export const MAX_BOOTS = 2
export const CORE_TARGET = 4
/** Rule matches below this score are only tie-breakers: they never form a recommendation on their own. */
export const MIN_RULE_SCORE = 2
const MAX_REASONS = 2
/** A Data Dragon "Tank" champion counts as a real tank only with this much defense rating. */
export const TANK_MIN_DEFENSE = 7

const TRAIT_WORDS: Record<Trait, string> = {
  ad: 'attack damage',
  ap: 'ability power',
  health: 'health',
  armor: 'armor',
  mr: 'magic resist',
  abilityHaste: 'ability haste',
  armorPen: 'armor penetration',
  magicPen: 'magic penetration',
  crit: 'critical strike chance',
  attackSpeed: 'attack speed',
  mana: 'mana',
  healShieldPower: 'heal and shield power',
  onHit: 'on-hit effects',
  lifesteal: 'life steal',
  omnivamp: 'omnivamp',
  tenacity: 'tenacity',
  moveSpeed: 'move speed',
  antiheal: 'Grievous Wounds',
  adaptive: 'adaptive force',
  boots: 'boots',
}

const TAG_PRIORITY: readonly (readonly [string, Archetype])[] = [
  ['Marksman', 'marksman'],
  ['Assassin', 'assassin'],
  ['Mage', 'mage'],
  ['Fighter', 'bruiser'],
  ['Tank', 'bruiser'],
  ['Support', 'enchanter'],
]

const NO_NAMES: ReadonlySet<string> = new Set()

export function isTank(champion: Champion, tags: ChampionTags): boolean {
  const override = tags.champions[champion.id]?.tank
  if (override !== undefined) return override
  return champion.tags.includes('Tank') && champion.info.defense >= TANK_MIN_DEFENSE
}

export function archetypeOf(champion: Champion, tags: ChampionTags): Archetype {
  const explicit = tags.champions[champion.id]?.archetype
  if (explicit) return explicit
  if (isTank(champion, tags)) return 'tank'
  for (const [tag, archetype] of TAG_PRIORITY) {
    if (champion.tags.includes(tag)) return archetype
  }
  return 'bruiser'
}

export function damageClass(champion: Champion, tags: ChampionTags): Damage {
  const explicit = tags.champions[champion.id]?.damage
  if (explicit) return explicit
  const diff = champion.info.magic - champion.info.attack
  if (diff >= 2) return 'ap'
  if (diff <= -2) return 'ad'
  return 'mixed'
}

export function buildEnemyProfile(enemies: readonly Champion[], tags: ChampionTags): EnemyProfile {
  const names = {
    healers: [] as string[],
    hardCc: [] as string[],
    tanks: [] as string[],
    assassins: [] as string[],
    marksmen: [] as string[],
    mages: [] as string[],
  }
  let ap = 0
  let ad = 0
  for (const champion of enemies) {
    const damage = damageClass(champion, tags)
    if (damage === 'ap') ap += 1
    else if (damage === 'ad') ad += 1
    else {
      ap += 0.5
      ad += 0.5
    }
    const tag = tags.champions[champion.id]
    const archetype = archetypeOf(champion, tags)
    if (tag?.healing) names.healers.push(champion.name)
    if (tag?.cc === 'hard') names.hardCc.push(champion.name)
    if (archetype === 'tank') names.tanks.push(champion.name)
    if (archetype === 'assassin') names.assassins.push(champion.name)
    if (archetype === 'marksman') names.marksmen.push(champion.name)
    if (archetype === 'mage') names.mages.push(champion.name)
  }
  const n = enemies.length
  return {
    metrics: {
      enemies: n,
      apShare: n === 0 ? 0 : ap / n,
      adShare: n === 0 ? 0 : ad / n,
      healers: names.healers.length,
      hardCc: names.hardCc.length,
      tanks: names.tanks.length,
      assassins: names.assassins.length,
      marksmen: names.marksmen.length,
      mages: names.mages.length,
    },
    names,
  }
}

const SHARES: ReadonlySet<Metric> = new Set<Metric>(['apShare', 'adShare'])

export function formatReason(template: string, profile: EnemyProfile): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (key in profile.metrics) {
      const value = profile.metrics[key as Metric]
      return SHARES.has(key as Metric) ? `${Math.round(value * 100)}%` : String(value)
    }
    if (key.endsWith('Names')) {
      const list = profile.names[key.slice(0, -'Names'.length) as keyof EnemyProfile['names']]
      if (list) return list.join(', ')
    }
    return whole
  })
}

function profileFor(rules: Rules, archetype: Archetype): ArchetypeProfile {
  return rules.archetypes[archetype] ?? { label: archetype, prefer: [], avoid: [] }
}

interface Fit {
  score: number
  matched: Trait[]
  avoided: Trait[]
}

function fitOf(profile: ArchetypeProfile, traits: readonly Trait[]): Fit {
  const matched = profile.prefer.filter((trait) => traits.includes(trait))
  const avoided = profile.avoid.filter((trait) => traits.includes(trait))
  return { score: 0.5 * matched.length - avoided.length, matched, avoided }
}

function fitSentence(profile: ArchetypeProfile, matched: readonly Trait[]): string {
  if (matched.length === 0) return `Not a typical pick for ${profile.label}.`
  return `Fits ${profile.label}: ${matched.map((trait) => TRAIT_WORDS[trait]).join(', ')}.`
}

function ruleApplies(
  rule: Rule,
  slot: 'item' | 'boots',
  role: Role,
  myDamage: Damage,
  archetype: Archetype,
  profile: EnemyProfile,
): boolean {
  if (rule.slot !== slot) return false
  if (rule.roles && !rule.roles.includes(role)) return false
  if (rule.archetypes && !rule.archetypes.includes(archetype)) return false
  if (rule.myDamage && rule.myDamage !== myDamage) return false
  return rule.when.every((c) => {
    const value = profile.metrics[c.metric]
    return (
      (c.atLeast === undefined || value >= c.atLeast) &&
      (c.atMost === undefined || value <= c.atMost)
    )
  })
}

const DEFENSIVE_CLASSES = ['Tank', 'Fighter', 'Support']

/** Tanks, fighters and supports may buy purely defensive items; squishy damage dealers may not. */
function allowsDefensiveItems(me: Champion): boolean {
  return me.tags.some((t) => DEFENSIVE_CLASSES.includes(t))
}

function hasDamageStat(traits: readonly Trait[], myDamage: Damage): boolean {
  if (traits.includes('adaptive')) return true
  if (myDamage !== 'ap' && traits.includes('ad')) return true
  if (myDamage !== 'ad' && traits.includes('ap')) return true
  return false
}

function compatible(
  traits: readonly Trait[],
  me: Champion,
  myDamage: Damage,
  slot: 'item' | 'boots',
): boolean {
  // Hybrid items (both AD and AP) and adaptive items suit everyone; pure items only their own damage type.
  if (!traits.includes('adaptive')) {
    if (myDamage === 'ad' && traits.includes('ap') && !traits.includes('ad')) return false
    if (myDamage === 'ap' && traits.includes('ad') && !traits.includes('ap')) return false
  }
  if (me.stats['mp'] === 0 && traits.includes('mana')) return false
  if (slot === 'item' && !allowsDefensiveItems(me) && !hasDamageStat(traits, myDamage)) return false
  return true
}

interface Scored {
  item: Item
  ruleScore: number
  data?: ItemEvidence
  reasons: { weight: number; text: string }[]
  ruleIds: string[]
}

interface Ranked extends Scored {
  fit: Fit
  score: number
}

function evidenceBonus(evidence: ItemEvidence | undefined): number {
  if (!evidence || evidence.games < 5) return 0
  return evidence.deltaWinRate * 100
}

function byRank(a: Ranked, b: Ranked): number {
  return b.score - a.score || b.item.goldTotal - a.item.goldTotal || a.item.id - b.item.id
}

function pickSituational(
  slot: 'item' | 'boots',
  pool: readonly Item[],
  traitsOf: ReadonlyMap<number, Trait[]>,
  evidenceOf: ReadonlyMap<number, ItemEvidence>,
  input: RecommendInput,
  myDamage: Damage,
  archetype: Archetype,
  profile: ArchetypeProfile,
  enemyProfile: EnemyProfile,
  limit: number,
  excludeNames: ReadonlySet<string>,
): Recommendation[] {
  const rules = input.rules.rules.filter((rule) =>
    ruleApplies(rule, slot, input.role, myDamage, archetype, enemyProfile),
  )
  const scored = new Map<number, Scored>()
  for (const rule of rules) {
    const text = formatReason(rule.reason, enemyProfile)
    for (const item of pool) {
      if (slot === 'boots') {
        const allowlist = input.rules.bootsAllowlist
        if (allowlist.length > 0 && !allowlist.includes(item.name)) continue
      }
      if (excludeNames.has(item.name)) continue
      const traits = traitsOf.get(item.id) ?? []
      if (!compatible(traits, input.me, myDamage, slot)) continue
      if (!rule.allOf.every((t) => traits.includes(t))) continue
      const matched = rule.anyOf.filter((t) => traits.includes(t)).length
      if (rule.anyOf.length > 0 && matched === 0) continue
      const bonus = rule.anyOf.length > 1 ? 0.5 * (matched - 1) : 0
      const entry = scored.get(item.id) ?? {
        item,
        ruleScore: 0,
        data: evidenceOf.get(item.id),
        reasons: [],
        ruleIds: [],
      }
      entry.ruleScore += rule.weight + bonus
      entry.reasons.push({ weight: rule.weight, text })
      entry.ruleIds.push(rule.id)
      scored.set(item.id, entry)
    }
  }

  const ranked: Ranked[] = []
  for (const entry of scored.values()) {
    if (entry.ruleScore < MIN_RULE_SCORE) continue
    const fit = fitOf(profile, traitsOf.get(entry.item.id) ?? [])
    if (fit.avoided.length > 0 && fit.matched.length === 0) continue
    ranked.push({
      ...entry,
      fit,
      score: entry.ruleScore + fit.score + evidenceBonus(entry.data),
    })
  }
  ranked.sort(byRank)

  const groupCounts = new Map<string, number>()
  const picked: Recommendation[] = []
  for (const entry of ranked) {
    const traits = traitsOf.get(entry.item.id) ?? []
    const blocked = input.rules.groups.some(
      (group) =>
        traits.includes(group.trait) && (groupCounts.get(group.trait) ?? 0) >= group.max,
    )
    if (blocked) continue

    for (const group of input.rules.groups) {
      if (traits.includes(group.trait)) {
        groupCounts.set(group.trait, (groupCounts.get(group.trait) ?? 0) + 1)
      }
    }

    const reasons = entry.reasons
      .sort((a, b) => b.weight - a.weight)
      .map((reason) => reason.text)
      .slice(0, MAX_REASONS)
    if (slot === 'item') reasons.push(fitSentence(profile, entry.fit.matched))

    picked.push({
      itemId: entry.item.id,
      name: entry.item.name,
      slot,
      source: 'rules',
      reasons,
      ruleIds: entry.ruleIds,
      score: entry.score,
      evidence: entry.data,
    })
    if (picked.length >= limit) break
  }

  return picked
}

interface ClassCore {
  key: string
  traits: Trait[]
  reason: string
}

function findClassCore(input: RecommendInput, myDamage: Damage): ClassCore | null {
  // A key like "Assassin:ap" (class + damage type) wins over the plain class key.
  for (const tag of input.me.tags) {
    const specific = input.rules.coreByClass[`${tag}:${myDamage}`]
    const plain = input.rules.coreByClass[tag]
    if (specific) return { key: `${tag}:${myDamage}`, ...specific }
    if (plain) return { key: tag, ...plain }
  }
  return null
}

function classCore(
  pool: readonly Item[],
  traitsOf: ReadonlyMap<number, Trait[]>,
  evidenceOf: ReadonlyMap<number, ItemEvidence>,
  input: RecommendInput,
  myDamage: Damage,
  profile: ArchetypeProfile,
): Recommendation[] {
  const spec = findClassCore(input, myDamage)
  if (!spec) return []

  const scored: { item: Item; matched: number; data?: ItemEvidence }[] = []
  for (const item of pool) {
    const traits = traitsOf.get(item.id) ?? []
    if (!compatible(traits, input.me, myDamage, 'item')) continue
    const matched = spec.traits.filter((trait) => traits.includes(trait)).length
    if (matched < 2) continue
    scored.push({ item, matched, data: evidenceOf.get(item.id) })
  }

  return scored
    .sort(
      (a, b) =>
        b.matched - a.matched ||
        evidenceBonus(b.data) - evidenceBonus(a.data) ||
        b.item.goldTotal - a.item.goldTotal ||
        a.item.id - b.item.id,
    )
    .slice(0, CORE_TARGET)
    .map(({ item, matched, data }) => {
      const fit = fitOf(profile, traitsOf.get(item.id) ?? [])
      return {
        itemId: item.id,
        name: item.name,
        slot: 'item' as const,
        source: 'core' as const,
        reasons: [`${spec.reason} ${fitSentence(profile, fit.matched)}`],
        ruleIds: [`core:${spec.key}`],
        score: matched,
        evidence: data,
      }
    })
}

function personalCore(
  pool: readonly Item[],
  traitsOf: ReadonlyMap<number, Trait[]>,
  input: RecommendInput,
  myDamage: Damage,
): Recommendation[] {
  const prior = input.prior
  if (!prior || prior.games < 5) return []

  const byName = new Map(pool.map((item) => [item.name, item]))
  const core: Recommendation[] = []
  for (const entry of prior.build) {
    if (core.length >= CORE_TARGET) break
    if (entry.games < 5) continue
    const item = byName.get(entry.name)
    if (!item) continue
    if (core.some((picked) => picked.name === item.name)) continue
    if (!compatible(traitsOf.get(item.id) ?? [], input.me, myDamage, 'item')) continue
    core.push({
      itemId: item.id,
      name: item.name,
      slot: 'item',
      source: 'personal',
      reasons: [`In your usual build (${entry.games} of ${prior.games} games).`],
      ruleIds: [],
      score: entry.games,
    })
  }
  return core
}

function confidenceFor(games: number): ItemEvidence['confidence'] {
  if (games >= 200) return 'high'
  if (games >= 50) return 'medium'
  return 'low'
}

function researchEvidence(
  sample: ResearchItemSample,
  championGames: number,
  championWins: number,
): ItemEvidence {
  const prior = championGames === 0 ? 0 : championWins / championGames
  const smoothed = (sample.wins + 50 * prior) / (sample.games + 50)
  return {
    itemId: sample.itemId,
    games: sample.games,
    wins: sample.wins,
    winRate: sample.winRate,
    smoothedWinRate: smoothed,
    deltaWinRate: smoothed - prior,
    pickRate: sample.pickRate,
    confidence: confidenceFor(sample.games),
  }
}

/** Core from the research sample: slot-wise final items, never a recorded path. */
function researchCore(
  research: ResearchBuildSample,
  itemsById: ReadonlyMap<number, Item>,
  role: Role,
): Recommendation[] {
  const seen = new Set<number>()
  const core: Recommendation[] = []
  for (const sample of research.items) {
    if (core.length >= CORE_TARGET) break
    if (sample.games < 30 || seen.has(sample.itemId)) continue
    const item = itemsById.get(sample.itemId)
    if (!item) continue
    seen.add(sample.itemId)
    core.push({
      itemId: item.id,
      name: item.name,
      slot: 'item',
      source: 'research',
      reasons: [
        `Picked in ${Math.round(sample.pickRate * 100)}% of ${research.games} ${role} games (${Math.round(sample.winRate * 100)}% WR).`,
      ],
      ruleIds: [`research:slot:${sample.slot}`],
      score: sample.pickRate,
      evidence: researchEvidence(sample, research.games, research.wins),
    })
  }
  return core
}

function researchBoots(
  research: ResearchBuildSample,
  itemsById: ReadonlyMap<number, Item>,
  role: Role,
): Recommendation[] {
  const sample = research.boots
  if (!sample || sample.games < 30) return []
  const item = itemsById.get(sample.itemId)
  if (!item) return []
  return [
    {
      itemId: item.id,
      name: item.name,
      slot: 'boots',
      source: 'research',
      reasons: [
        `Most-picked boots in ${research.games} ${role} games (${Math.round(sample.pickRate * 100)}% pick, ${Math.round(sample.winRate * 100)}% WR).`,
      ],
      ruleIds: ['research:boots'],
      score: sample.pickRate,
      evidence: researchEvidence(sample, research.games, research.wins),
    },
  ]
}

export function recommend(input: RecommendInput): RecommendResult {
  const enemyProfile = buildEnemyProfile(input.enemies, input.tags)
  const myDamage = damageClass(input.me, input.tags)
  const archetype = archetypeOf(input.me, input.tags)
  const profile = profileFor(input.rules, archetype)
  const excluded = [
    ...input.rules.excludeItems,
    ...(input.rules.excludeItemsByRole[input.role] ?? []),
  ]
  const pool = buildItemPool(input.items, excluded)
  const traitsOf = new Map<number, Trait[]>()
  for (const item of [...pool.items, ...pool.boots]) {
    traitsOf.set(item.id, itemTraits(item))
  }
  const evidenceOf = input.evidence?.items ?? new Map<number, ItemEvidence>()

  const hasPrior = input.prior !== undefined && input.prior.games >= 5
  const allItemsById = new Map<number, Item>(input.items.map((item) => [item.id, item]))
  const sampleCore = input.research
    ? researchCore(input.research, allItemsById, input.role)
    : []
  const core = sampleCore.length > 0
    ? sampleCore
    : hasPrior
      ? personalCore(pool.items, traitsOf, input, myDamage)
      : classCore(pool.items, traitsOf, evidenceOf, input, myDamage, profile)
  const coreNames = new Set(core.map((item) => item.name))

  const items = pickSituational(
    'item',
    pool.items,
    traitsOf,
    evidenceOf,
    input,
    myDamage,
    archetype,
    profile,
    enemyProfile,
    MAX_ITEMS,
    coreNames,
  )
  const sampleBoots = input.research
    ? researchBoots(input.research, allItemsById, input.role)
    : []
  const boots = sampleBoots.length > 0
    ? sampleBoots
    : pickSituational(
        'boots',
        pool.boots,
        traitsOf,
        evidenceOf,
        input,
        myDamage,
        archetype,
        profile,
        enemyProfile,
        MAX_BOOTS,
        NO_NAMES,
      )

  return {
    level: items.length > 0 || boots.length > 0 ? 'rules' : 'core',
    core,
    profile: enemyProfile,
    items,
    boots,
  }
}
