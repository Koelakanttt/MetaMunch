import { z } from 'zod'

const TimelineEventSchema = z
  .object({
    timestamp: z.number(),
    type: z.string(),
    participantId: z.number().optional(),
    itemId: z.number().optional(),
    skillSlot: z.number().optional(),
    level: z.number().optional(),
  })
  .passthrough()

const TimelineSchema = z.object({
  info: z.object({
    frames: z
      .array(
        z.object({
          events: z.array(TimelineEventSchema).default([]),
        }),
      )
      .default([]),
  }),
})

export interface TimelineEvent {
  timestamp: number
  type: string
  participantId: number
  itemId: number | null
  skillSlot: number | null
  level: number | null
}

export function parseTimeline(json: unknown): TimelineEvent[] {
  const timeline = TimelineSchema.parse(json)
  const events: TimelineEvent[] = []
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
      })
    }
  }
  return events
}

export interface PurchaseOrderItem {
  itemId: number
  name: string
  games: number
  averageSeconds: number
}

export interface PurchaseOrderResponse {
  championId: string
  championName: string | null
  sampleMatches: number
  items: PurchaseOrderItem[]
  hasTimeline: boolean
}

export interface TimelineBackfillResult {
  requested: number
  saved: number
  failed: number
}

