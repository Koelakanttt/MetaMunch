import type { Role } from './rules'

export const TIMELINE_SUMMARY_VERSION = 1

export interface TimelineSummaryParticipant {
  participantId: number
  teamId: number
  championId: number
  role: string | null
  roleSource: 'riot' | 'inferred' | 'unknown'
}

export interface TimelineMinute {
  minute: number
  blueGold: number
  redGold: number
  blueXp: number
  redXp: number
  blueCs: number
  redCs: number
}

export type TimelineMarkerType =
  | 'CHAMPION_KILL'
  | 'ELITE_MONSTER_KILL'
  | 'BUILDING_KILL'
  | 'ITEM_PURCHASED'

export interface TimelineMarker {
  atMs: number
  type: TimelineMarkerType
  teamId: number | null
  participantId: number | null
  killerId: number | null
  victimId: number | null
  itemId: number | null
  monsterType: string | null
  buildingType: string | null
}

export interface TimelineSummary {
  version: number
  matchId: string
  durationSec: number
  participants: TimelineSummaryParticipant[]
  minutes: TimelineMinute[]
  markers: TimelineMarker[]
  truncatedMinutes: number
}

export interface TimelineSummaryInput {
  matchId: string
  durationSec: number
  participants: readonly TimelineSummaryParticipant[]
  completedItemIds: ReadonlySet<number>
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asRole(value: unknown): Role | null {
  return value === 'TOP' || value === 'JUNGLE' || value === 'MIDDLE' || value === 'BOTTOM' || value === 'UTILITY'
    ? value
    : null
}

/** Builds a bounded review summary from raw match-v5 timeline JSON. */
export function parseTimelineSummary(raw: unknown, input: TimelineSummaryInput): TimelineSummary {
  const info = record(record(raw)?.['info'])
  const frames = Array.isArray(info?.['frames']) ? info['frames'] : []
  const teamByParticipant = new Map(
    input.participants.map((participant) => [participant.participantId, participant.teamId]),
  )
  const minutes: TimelineMinute[] = []
  for (const frame of frames) {
    const frameRecord = record(frame)
    const at = numberValue(frameRecord?.['timestamp'])
    const participantFrames = record(frameRecord?.['participantFrames'])
    if (!participantFrames) continue
    let blueGold = 0
    let redGold = 0
    let blueXp = 0
    let redXp = 0
    let blueCs = 0
    let redCs = 0
    for (const [key, value] of Object.entries(participantFrames)) {
      const participantId = Number(key)
      const teamId = teamByParticipant.get(participantId)
      const stats = record(value)
      if (!stats || teamId === undefined) continue
      const gold = numberValue(stats['totalGold'])
      const xp = numberValue(stats['xp'])
      const cs = numberValue(stats['minionsKilled']) + numberValue(stats['jungleMinionsKilled'])
      if (teamId === 100) {
        blueGold += gold
        blueXp += xp
        blueCs += cs
      } else if (teamId === 200) {
        redGold += gold
        redXp += xp
        redCs += cs
      }
    }
    minutes.push({
      minute: Math.round(at / 60_000),
      blueGold,
      redGold,
      blueXp,
      redXp,
      blueCs,
      redCs,
    })
  }

  const events = [
    ...(Array.isArray(info?.['events']) ? info['events'] : []),
    ...frames.flatMap((frame) => {
      const frameRecord = record(frame)
      return Array.isArray(frameRecord?.['events']) ? frameRecord['events'] : []
    }),
  ]
  const markers: TimelineMarker[] = []
  for (const event of events) {
    const entry = record(event)
    const type = stringValue(entry?.['type'])
    if (
      type !== 'CHAMPION_KILL' &&
      type !== 'ELITE_MONSTER_KILL' &&
      type !== 'BUILDING_KILL' &&
      type !== 'ITEM_PURCHASED'
    ) {
      continue
    }
    const itemId = entry?.['itemId'] === undefined ? null : numberValue(entry['itemId'], 0) || null
    if (type === 'ITEM_PURCHASED' && (itemId === null || !input.completedItemIds.has(itemId))) {
      continue
    }
    markers.push({
      atMs: numberValue(entry?.['timestamp']),
      type: type as TimelineMarkerType,
      teamId:
        entry?.['teamId'] === undefined ? null : numberValue(entry['teamId'], 0) || null,
      participantId:
        entry?.['participantId'] === undefined
          ? null
          : numberValue(entry['participantId'], 0) || null,
      killerId: entry?.['killerId'] === undefined ? null : numberValue(entry['killerId'], 0) || null,
      victimId: entry?.['victimId'] === undefined ? null : numberValue(entry['victimId'], 0) || null,
      itemId,
      monsterType: stringValue(entry?.['monsterType']),
      buildingType: stringValue(entry?.['buildingType']),
    })
  }

  const summary: TimelineSummary = {
    version: TIMELINE_SUMMARY_VERSION,
    matchId: input.matchId,
    durationSec: input.durationSec,
    participants: input.participants.map((participant) => ({
      ...participant,
      role: asRole(participant.role),
    })),
    minutes,
    markers,
    truncatedMinutes: 0,
  }

  const bounded = boundSummary(summary)
  return bounded
}

function boundSummary(input: TimelineSummary): TimelineSummary {
  const summary = { ...input, minutes: [...input.minutes] }
  while (JSON.stringify(summary).length > 20_000 && summary.minutes.length > 1) {
    summary.minutes.shift()
    summary.truncatedMinutes += 1
  }
  return summary
}
