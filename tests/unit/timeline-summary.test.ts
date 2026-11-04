import { describe, expect, it } from 'vitest'
import { parseTimelineSummary, type TimelineSummaryParticipant } from '../../src/shared/timeline-summary'

const participants: TimelineSummaryParticipant[] = [
  { participantId: 1, teamId: 100, championId: 1, role: 'TOP', roleSource: 'riot' },
  { participantId: 2, teamId: 100, championId: 2, role: 'JUNGLE', roleSource: 'riot' },
  { participantId: 3, teamId: 100, championId: 3, role: 'MIDDLE', roleSource: 'riot' },
  { participantId: 4, teamId: 100, championId: 4, role: 'BOTTOM', roleSource: 'riot' },
  { participantId: 5, teamId: 100, championId: 5, role: 'UTILITY', roleSource: 'riot' },
  { participantId: 6, teamId: 200, championId: 6, role: 'TOP', roleSource: 'riot' },
  { participantId: 7, teamId: 200, championId: 7, role: 'JUNGLE', roleSource: 'riot' },
  { participantId: 8, teamId: 200, championId: 8, role: 'MIDDLE', roleSource: 'riot' },
  { participantId: 9, teamId: 200, championId: 9, role: 'BOTTOM', roleSource: 'riot' },
  { participantId: 10, teamId: 200, championId: 10, role: 'UTILITY', roleSource: 'riot' },
]

function frame(timestamp: number, blueGold: number, redGold: number) {
  const participantFrames: Record<string, unknown> = {}
  for (const participant of participants) {
    participantFrames[String(participant.participantId)] = {
      totalGold: participant.teamId === 100 ? blueGold / 5 : redGold / 5,
      xp: participant.teamId === 100 ? 1000 : 900,
      minionsKilled: participant.teamId === 100 ? 10 : 8,
      jungleMinionsKilled: 0,
    }
  }
  return { timestamp, participantFrames }
}

describe('timeline summary', () => {
  it('sums gold, xp and cs and keeps only completed item purchases', () => {
    const summary = parseTimelineSummary(
      {
        info: {
          frames: [frame(0, 2500, 2500), frame(60000, 10000, 8000)],
          events: [
            { timestamp: 30000, type: 'CHAMPION_KILL', teamId: 100, killerId: 1, victimId: 6 },
            { timestamp: 35000, type: 'ITEM_PURCHASED', participantId: 1, itemId: 6655 },
            { timestamp: 36000, type: 'ITEM_PURCHASED', participantId: 1, itemId: 1001 },
          ],
        },
      },
      { matchId: 'EUW1_1', durationSec: 60, participants, completedItemIds: new Set([6655]) },
    )

    expect(summary.minutes).toHaveLength(2)
    expect(summary.minutes[0]).toMatchObject({ blueGold: 2500, redGold: 2500 })
    expect(summary.minutes[1]).toMatchObject({
      blueGold: 10000,
      redGold: 8000,
      blueXp: 5000,
      redXp: 4500,
      blueCs: 50,
      redCs: 40,
    })
    expect(summary.markers).toHaveLength(2)
    expect(summary.markers.some((marker) => marker.itemId === 1001)).toBe(false)
  })

  it('bounds a long summary below 20 KB', () => {
    const frames = Array.from({ length: 40 }, (_, index) =>
      frame(index * 60000, 2500 + index * 100, 2500 + index * 50),
    )
    const summary = parseTimelineSummary(
      { info: { frames, events: [] } },
      { matchId: 'EUW1_2', durationSec: 2400, participants, completedItemIds: new Set() },
    )
    expect(JSON.stringify(summary).length).toBeLessThan(20_000)
  })
})
