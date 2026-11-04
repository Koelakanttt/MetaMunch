import { z } from 'zod'
import type { Item } from './ddragon'
import { buildItemPool } from './item-traits'

export const STARTING_WINDOW_MS = 90_000
export const MAX_PURCHASE_ORDER = 7
export const MAX_SKILL_ORDER = 18

const EventSchema = z
  .object({
    timestamp: z.number(),
    type: z.string(),
    participantId: z.number().optional(),
    itemId: z.number().optional(),
    skillSlot: z.number().optional(),
    level: z.number().optional(),
    levelUpType: z.string().optional(),
    beforeId: z.number().optional(),
    afterId: z.number().optional(),
  })
  .passthrough()

const TimelineSchema = z.object({
  info: z.object({
    frames: z
      .array(z.object({ events: z.array(EventSchema).default([]) }))
      .default([]),
  }),
})

export interface ResearchTimelineEvent {
  timestamp: number
  type: string
  participantId: number
  itemId: number | null
  skillSlot: number | null
  level: number | null
  levelUpType: string | null
  beforeId: number | null
  afterId: number | null
}

/**
 * Minimal event shape the compactor needs. The personal timeline parser produces a
 * compatible subset (no undo/sell ids), so research data degrades gracefully there.
 */
export interface ResearchTimelineEventLike {
  timestamp: number
  type: string
  participantId: number
  itemId: number | null
  skillSlot: number | null
  level: number | null
  levelUpType?: string | null
  beforeId?: number | null
  afterId?: number | null
}

/** Parses a raw match-v5 timeline into the fields research timelines keep. */
export function parseResearchTimeline(json: unknown): ResearchTimelineEvent[] {
  const timeline = TimelineSchema.parse(json)
  const events: ResearchTimelineEvent[] = []
  for (const frame of timeline.info.frames) {
    for (const event of frame.events) {
      if (event.participantId === undefined) continue
      events.push({
        timestamp: event.timestamp,
        type: event.type,
        participantId: event.participantId,
        itemId: event.itemId ?? null,
        skillSlot: event.skillSlot ?? null,
        level: event.level ?? null,
        levelUpType: event.levelUpType ?? null,
        beforeId: event.beforeId ?? null,
        afterId: event.afterId ?? null,
      })
    }
  }
  return events
}

export interface CompactedTimeline {
  /** Completed items and boots in purchase order, merged by name, at most 7. */
  purchaseOrder: number[]
  /** Purchases before 90 seconds, including consumables. */
  startingItems: number[]
  /** Q/W/E/R level-up sequence, level 1-18. */
  skillOrder: string
}

/** Lowest id per item name over every item, so mode variants merge by name. */
function canonicalByName(items: readonly Item[]): Map<number, number> {
  const byName = new Map<string, number>()
  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    if (!byName.has(item.name)) byName.set(item.name, item.id)
  }
  const map = new Map<number, number>()
  for (const item of items) {
    const id = byName.get(item.name)
    if (id !== undefined) map.set(item.id, id)
  }
  return map
}

/** Completed-item and boots ids, merged by name; components, consumables and wards stay out. */
function completedCanonicalIds(items: readonly Item[]): Map<number, number> {
  const pool = buildItemPool(items)
  const byName = new Map<string, number>()
  for (const item of [...pool.items, ...pool.boots].sort((a, b) => a.id - b.id)) {
    if (!byName.has(item.name)) byName.set(item.name, item.id)
  }
  const map = new Map<number, number>()
  for (const item of items) {
    const id = byName.get(item.name)
    if (id !== undefined) map.set(item.id, id)
  }
  return map
}

function skillName(slot: number | null): string | null {
  if (slot === 1) return 'Q'
  if (slot === 2) return 'W'
  if (slot === 3) return 'E'
  if (slot === 4) return 'R'
  return null
}

/** Compacts one participant's timeline events into the stored research summary. */
export function compactTimeline(
  events: readonly ResearchTimelineEventLike[],
  participantId: number,
  items: readonly Item[],
): CompactedTimeline {
  const completed = completedCanonicalIds(items)
  const everyItem = canonicalByName(items)
  const purchaseOrder: number[] = []
  const startingItems: number[] = []
  const skills: string[] = []
  const mine = events
    .filter((event) => event.participantId === participantId)
    .sort((a, b) => a.timestamp - b.timestamp)

  for (const event of mine) {
    if (event.type === 'ITEM_PURCHASED' && event.itemId !== null) {
      const completedId = completed.get(event.itemId)
      if (
        completedId !== undefined &&
        purchaseOrder.length < MAX_PURCHASE_ORDER &&
        !purchaseOrder.includes(completedId)
      ) {
        purchaseOrder.push(completedId)
      }
      if (event.timestamp < STARTING_WINDOW_MS) {
        const bought = everyItem.get(event.itemId) ?? event.itemId
        if (bought > 0) startingItems.push(bought)
      }
    } else if (event.type === 'ITEM_UNDO') {
      const undone =
        event.beforeId === undefined || event.beforeId === null
          ? undefined
          : completed.get(event.beforeId)
      if (undone !== undefined) {
        const index = purchaseOrder.lastIndexOf(undone)
        if (index >= 0) purchaseOrder.splice(index, 1)
      }
    } else if (event.type === 'ITEM_SOLD' && event.itemId !== null) {
      const sold = completed.get(event.itemId)
      if (sold !== undefined) {
        for (let index = purchaseOrder.length - 1; index >= 0; index -= 1) {
          if (purchaseOrder[index] === sold) purchaseOrder.splice(index, 1)
        }
      }
    } else if (event.type === 'SKILL_LEVEL_UP' && skills.length < MAX_SKILL_ORDER) {
      if (event.levelUpType !== undefined && event.levelUpType !== null && event.levelUpType !== 'NORMAL') {
        continue
      }
      const name = skillName(event.skillSlot)
      if (name !== null) skills.push(name)
    }
  }

  return { purchaseOrder, startingItems, skillOrder: skills.join('') }
}
