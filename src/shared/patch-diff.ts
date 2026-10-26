import type { Item } from './ddragon'
import type { ChampionDetail } from './ddragon-detail'
import { plainText } from './item-traits'
import { toPatch } from './riot'

export interface Change {
  label: string
  before: string
  after: string
}

export interface EntityChanges {
  id: string
  name: string
  changes: Change[]
}

export interface PatchChangesResponse {
  from: string | null
  to: string | null
  pool: { id: string; name: string; games: number }[]
  champions: EntityChanges[]
  items: EntityChanges[]
  notes: string[]
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const SPELL_LETTERS = ['Q', 'W', 'E', 'R'] as const
const DESCRIPTION_LIMIT = 200

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
    if (beforeValue !== undefined && afterValue !== undefined && beforeValue === afterValue) continue
    changes.push({
      label: key,
      before: beforeValue === undefined ? '—' : String(beforeValue),
      after: afterValue === undefined ? '—' : String(afterValue),
    })
  }
  return changes
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

export function diffItem(before: Item, after: Item): Change[] {
  const changes: Change[] = []

  if (before.goldTotal !== after.goldTotal) {
    changes.push({
      label: 'Total cost',
      before: String(before.goldTotal),
      after: String(after.goldTotal),
    })
  }

  for (const change of diffStats(before.stats, after.stats)) {
    changes.push({ ...change, label: `Stat: ${change.label}` })
  }

  const beforeText = plainText(before.description)
  const afterText = plainText(after.description)
  if (beforeText !== afterText) {
    changes.push({
      label: 'Description',
      before: beforeText.slice(0, DESCRIPTION_LIMIT),
      after: afterText.slice(0, DESCRIPTION_LIMIT),
    })
  }

  return changes
}
