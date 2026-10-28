import { describe, expect, it } from 'vitest'
import type { GeneralStatsResponse } from '../../src/shared/general-stats'
import { StatsCoordinator } from '../../src/main/services/stats-coordinator'

function response(over: Partial<GeneralStatsResponse> = {}): GeneralStatsResponse {
  return {
    sample: { matches: 0, picks: 0 },
    patches: [],
    champions: [],
    items: [],
    hasStaticData: true,
    source: 'own',
    note: null,
    ...over,
  }
}

describe('StatsCoordinator', () => {
  it('uses the own sample when the external flag is off', async () => {
    let externalCalls = 0
    const coordinator = new StatsCoordinator({
      own: { run: () => response({ sample: { matches: 1, picks: 2 } }) },
      external: {
        run: () => {
          externalCalls += 1
          return response({ source: 'external' })
        },
      },
      isExternalEnabled: () => false,
    })

    const result = await coordinator.run()

    expect(result.source).toBe('own')
    expect(result.sample).toEqual({ matches: 1, picks: 2 })
    expect(externalCalls).toBe(0)
  })

  it('falls back with a note when the flag is on but no source is configured', async () => {
    const coordinator = new StatsCoordinator({
      own: { run: () => response() },
      isExternalEnabled: () => true,
    })

    const result = await coordinator.run()

    expect(result.source).toBe('own')
    expect(result.note).toContain('not configured')
  })

  it('uses the external source when it is enabled and available', async () => {
    const coordinator = new StatsCoordinator({
      own: { run: () => response() },
      external: { run: () => response({ source: 'external', sample: { matches: 9, picks: 90 } }) },
      isExternalEnabled: () => true,
    })

    const result = await coordinator.run()

    expect(result.source).toBe('external')
    expect(result.sample).toEqual({ matches: 9, picks: 90 })
    expect(result.note).toBeNull()
  })

  it('falls back when the external source fails', async () => {
    const coordinator = new StatsCoordinator({
      own: { run: () => response() },
      external: {
        run: () => {
          throw new Error('blocked')
        },
      },
      isExternalEnabled: () => true,
    })

    const result = await coordinator.run()

    expect(result.source).toBe('own')
    expect(result.note).toContain('unavailable')
  })
})
