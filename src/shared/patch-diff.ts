import type { Item } from './ddragon'
import type { ChampionDetail } from './ddragon-detail'
import { plainText } from './item-traits'
import { toPatch } from './riot'

export interface Change {
  label: string
  before: string
  after: string
}

export type EntityStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface EntityChanges {
  id: string
  name: string
  status: EntityStatus
  changes: Change[]
}

export interface PatchChangesRequest {
  from?: string
  to?: string
  allItems?: boolean
  poolOnly?: boolean
}

export interface PatchAbilityProgress {
  loaded: number
  total: number
  running: boolean
  errors: number
}

export interface PatchAbilityStatus {
  from: string | null
  to: string | null
  progress: PatchAbilityProgress
  changes: Record<string, Change[]>
}

export interface PatchChangesSummary {
  championsChanged: number
  itemsChanged: number
  added: number
  removed: number
}

export interface PatchChangesResponse {
  from: string | null
  to: string | null
  versions: string[]
  pool: { id: string; name: string; games: number }[]
  champions: EntityChanges[]
  items: EntityChanges[]
  summary: PatchChangesSummary
  abilityProgress: PatchAbilityProgress
  notes: string[]
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const SPELL_LETTERS = ['Q', 'W', 'E', 'R'] as const
const DESCRIPTION_LIMIT = 240

export function previousPatchVersion(
  versions: readonly string[],
  current: string,
): string | null {
  const currentPatch = toPatch(current)
  for (const version of versions) {
    if (!VERSION_PATTERN.test(version)) continue
    if (toPatch(version) !== currentPatch) return version
  }
  return null
}

/** Newest first Data Dragon versions usable in the from/to selectors. */
export function recentVersions(versions: readonly string[], limit = 12): string[] {
  return versions.filter((version) => VERSION_PATTERN.test(version)).slice(0, limit)
}

export function diffStats(
  before: Record<string, number>,
  after: Record<string, number>,
): Change[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) =>
    a.localeCompare(b),
  )
  const changes: Change[] = []
  for (const key of keys) {
    const beforeValue = before[key]
    const afterValue = after[key]
    if (beforeValue === undefined || afterValue === undefined) continue
    if (beforeValue === afterValue) continue
    changes.push({
      label: key,
      before: String(beforeValue),
      after: String(afterValue),
    })
  }
  return changes
}

export interface ItemStatLine {
  label: string
  value: string
}

/** Values + labels from the description <stats> block; legacy item.stats is deliberately ignored. */
export function itemStatLines(description: string): ItemStatLine[] {
  const block = /<stats>([\s\S]*?)<\/stats>/i.exec(description)?.[1]
  if (!block) return []
  const lines: ItemStatLine[] = []
  for (const segment of block.split(/<br\s*\/?>/i)) {
    const match = /<attention>([^<]+)<\/attention>\s*([\s\S]*)$/i.exec(segment)
    if (!match?.[1] || !match[2]) continue
    const label = plainText(match[2]).trim()
    const value = plainText(match[1]).trim()
    if (label && value) lines.push({ label, value })
  }
  return lines
}

function statLineChanges(before: Item, after: Item): Change[] {
  const beforeLines = new Map(itemStatLines(before.description).map((line) => [line.label, line.value]))
  const afterLines = new Map(itemStatLines(after.description).map((line) => [line.label, line.value]))
  const changes: Change[] = []
  for (const [label, beforeValue] of beforeLines) {
    const afterValue = afterLines.get(label)
    if (afterValue === undefined || afterValue === beforeValue) continue
    changes.push({
      label: `Stat: ${label}`,
      before: beforeValue,
      after: afterValue,
    })
  }
  return changes
}

export function diffItem(before: Item, after: Item): Change[] {
  const changes: Change[] = []
  if (before.goldTotal !== after.goldTotal) {
    changes.push({
      label: 'Total cost',
      before: String(before.goldTotal),
      after: String(after.goldTotal),
    })
  }
  changes.push(...statLineChanges(before, after))

  const beforeText = plainText(before.description)
  const afterText = plainText(after.description)
  if (beforeText !== afterText) {
    changes.push({
      label: 'Description text changed',
      before: beforeText.slice(0, DESCRIPTION_LIMIT),
      after: afterText.slice(0, DESCRIPTION_LIMIT),
    })
  }
  return changes
}

export function lowestIdByName(items: readonly Item[]): Map<string, Item> {
  const byName = new Map<string, Item>()
  for (const item of items) {
    const existing = byName.get(item.name)
    if (!existing || item.id < existing.id) byName.set(item.name, item)
  }
  return byName
}

/** Shop-complete Summoner's Rift items, deduplicated by name keeping the lowest id. */
export function shopItems(items: readonly Item[]): Item[] {
  return [...lowestIdByName(items).values()].filter(
    (item) =>
      item.maps['11'] === true &&
      item.purchasable &&
      item.inStore &&
      item.requiredAlly === null &&
      item.requiredChampion === null,
  )
}

function renderArray(values: readonly number[]): string {
  return values.length === 0 ? '—' : values.join('/')
}

function arrayChange(
  label: string,
  before: readonly number[] | undefined,
  after: readonly number[] | undefined,
): Change | null {
  const beforeValues = before ?? []
  const afterValues = after ?? []
  const same =
    beforeValues.length === afterValues.length &&
    beforeValues.every((value, index) => value === afterValues[index])
  if (same) return null
  return { label, before: renderArray(beforeValues), after: renderArray(afterValues) }
}

/** Ability/detail diff. Base stats are diffed separately from champion.json. */
export function diffChampion(before: ChampionDetail, after: ChampionDetail): Change[] {
  const changes = diffStats(before.stats, after.stats)

  if (before.passiveName !== after.passiveName) {
    changes.push({ label: 'Passive name', before: before.passiveName, after: after.passiveName })
  }

  for (let index = 0; index < SPELL_LETTERS.length; index += 1) {
    const letter = SPELL_LETTERS[index] ?? '?'
    const beforeSpell = before.spells[index]
    const afterSpell = after.spells[index]
    if (!beforeSpell && !afterSpell) continue

    const name = afterSpell?.name ?? beforeSpell?.name ?? ''
    if ((beforeSpell?.name ?? '') !== (afterSpell?.name ?? '')) {
      changes.push({
        label: `${letter} (${name}) name`,
        before: beforeSpell?.name ?? '—',
        after: afterSpell?.name ?? '—',
      })
    }

    for (const field of ['cooldown', 'cost', 'range'] as const) {
      const change = arrayChange(
        `${letter} (${name}) ${field}`,
        beforeSpell?.[field],
        afterSpell?.[field],
      )
      if (change) changes.push(change)
    }

    const effectCount = Math.max(beforeSpell?.effects.length ?? 0, afterSpell?.effects.length ?? 0)
    for (let effectIndex = 0; effectIndex < effectCount; effectIndex += 1) {
      const change = arrayChange(
        `${letter} (${name}) effect ${effectIndex + 1}`,
        beforeSpell?.effects[effectIndex],
        afterSpell?.effects[effectIndex],
      )
      if (change) changes.push(change)
    }
  }

  return changes
}
