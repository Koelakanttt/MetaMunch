import type { TimelineMarker, TimelineSummary } from './timeline-summary'

export const SWING_THRESHOLDS = {
  goldRatio: 0.12,
  baseGold: 1500,
  perMinuteGold: 150,
}

export type SwingClassification = 'death' | 'kill' | 'objective' | 'item' | 'other'

export interface SwingPoint {
  minute: number
  goldDiff: number
  deltaGold: number
  classification: SwingClassification
  marker: TimelineMarker | null
}

export interface SwingResult {
  swings: SwingPoint[]
  decidedAt: number | null
}

export interface TimelineReviewView extends SwingResult {
  summary: TimelineSummary
}

function goldDiff(summary: TimelineSummary, index: number): number {
  const point = summary.minutes[index]
  return point ? point.blueGold - point.redGold : 0
}

function nearestMarker(summary: TimelineSummary, minute: number): TimelineMarker | null {
  const at = minute * 60_000
  let best: TimelineMarker | null = null
  let bestDistance = 45_000 + 1
  for (const marker of summary.markers) {
    const distance = Math.abs(marker.atMs - at)
    if (distance <= 45_000 && distance < bestDistance) {
      best = marker
      bestDistance = distance
    }
  }
  return best
}

function classify(marker: TimelineMarker | null): SwingClassification {
  if (!marker) return 'other'
  if (marker.type === 'ELITE_MONSTER_KILL' || marker.type === 'BUILDING_KILL') return 'objective'
  if (marker.type === 'ITEM_PURCHASED') return 'item'
  if (marker.type === 'CHAMPION_KILL') return marker.teamId === 200 ? 'death' : 'kill'
  return 'other'
}

export function detectSwings(summary: TimelineSummary, count = 3): SwingPoint[] {
  const points: SwingPoint[] = []
  for (let index = 1; index < summary.minutes.length; index += 1) {
    const point = summary.minutes[index]
    if (!point) continue
    const delta = goldDiff(summary, index) - goldDiff(summary, index - 1)
    const marker = nearestMarker(summary, point.minute)
    points.push({
      minute: point.minute,
      goldDiff: goldDiff(summary, index),
      deltaGold: delta,
      classification: classify(marker),
      marker,
    })
  }
  return points
    .sort((a, b) => Math.abs(b.deltaGold) - Math.abs(a.deltaGold) || a.minute - b.minute)
    .slice(0, Math.max(0, count))
}

export function decidedAt(
  summary: TimelineSummary,
  thresholds = SWING_THRESHOLDS,
): number | null {
  for (const point of summary.minutes) {
    if (point.minute < 5) continue
    const diff = Math.abs(point.blueGold - point.redGold)
    const total = Math.max(1, point.blueGold + point.redGold)
    const ratio = diff / total
    const threshold = thresholds.baseGold + thresholds.perMinuteGold * point.minute
    if (ratio >= thresholds.goldRatio || diff >= threshold) return point.minute
  }
  return null
}

export function buildSwingResult(summary: TimelineSummary, count = 3): SwingResult {
  return { swings: detectSwings(summary, count), decidedAt: decidedAt(summary) }
}
