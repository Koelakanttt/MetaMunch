import { describe, expect, it } from 'vitest'
import { decidedAt, detectSwings, SWING_THRESHOLDS } from '../../src/shared/swing'
import type { TimelineSummary } from '../../src/shared/timeline-summary'

function summary(
  minutes: { minute: number; blueGold: number; redGold: number }[],
  markers: TimelineSummary['markers'] = [],
): TimelineSummary {
  return {
    version: 1,
    matchId: 'EUW1_1',
    durationSec: 1800,
    participants: [],
    minutes: minutes.map((point) => ({
      ...point,
      blueXp: 0,
      redXp: 0,
      blueCs: 0,
      redCs: 0,
    })),
    markers,
    truncatedMinutes: 0,
  }
}

describe('swing detection', () => {
  it('classifies a death swing', () => {
    const swings = detectSwings(
      summary(
        [
          { minute: 0, blueGold: 2500, redGold: 2500 },
          { minute: 1, blueGold: 3500, redGold: 2500 },
          { minute: 2, blueGold: 3500, redGold: 4500 },
        ],
        [{ atMs: 120000, type: 'CHAMPION_KILL', teamId: 200, participantId: null, killerId: 6, victimId: 1, itemId: null, monsterType: null, buildingType: null }],
      ),
    )
    expect(swings[0]).toMatchObject({ minute: 2, deltaGold: -2000, classification: 'death' })
  })

  it('classifies an objective and item swing', () => {
    const objective = detectSwings(
      summary(
        [
          { minute: 0, blueGold: 2500, redGold: 2500 },
          { minute: 1, blueGold: 4000, redGold: 2500 },
        ],
        [{ atMs: 60000, type: 'ELITE_MONSTER_KILL', teamId: 100, participantId: null, killerId: null, victimId: null, itemId: null, monsterType: 'DRAGON', buildingType: null }],
      ),
    )[0]
    const item = detectSwings(
      summary(
        [
          { minute: 0, blueGold: 2500, redGold: 2500 },
          { minute: 1, blueGold: 4000, redGold: 2500 },
        ],
        [{ atMs: 60000, type: 'ITEM_PURCHASED', teamId: 100, participantId: 1, killerId: null, victimId: null, itemId: 6655, monsterType: null, buildingType: null }],
      ),
    )[0]
    expect(objective?.classification).toBe('objective')
    expect(item?.classification).toBe('item')
  })

  it('does not call a game decided before minute 5 or below the threshold', () => {
    const early = summary([
      { minute: 0, blueGold: 0, redGold: 1000 },
      { minute: 1, blueGold: 0, redGold: 3000 },
      { minute: 2, blueGold: 0, redGold: 6000 },
    ])
    expect(decidedAt(early)).toBeNull()
    expect(decidedAt(early, { ...SWING_THRESHOLDS, goldRatio: 1 })).toBeNull()
  })

  it('finds the first decided minute after minute 5', () => {
    const points = Array.from({ length: 8 }, (_, minute) => ({
      minute,
      blueGold: 30000 + minute * 1000,
      redGold: 30000,
    }))
    points[6] = { minute: 6, blueGold: 30000, redGold: 90000 }
    expect(decidedAt(summary(points))).toBe(5)
  })
})
