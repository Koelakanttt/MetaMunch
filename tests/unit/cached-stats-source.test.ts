import { describe, expect, it } from 'vitest'
import type { GeneralStatsResponse } from '../../src/shared/general-stats'
import { CachedStatsSource } from '../../src/main/services/cached-stats-source'
import type { StatsSource } from '../../src/main/services/stats-coordinator'

function response(matches: number): GeneralStatsResponse {
  return {
    sample: { matches, picks: matches * 10 },
    patches: [],
    champions: [],
    items: [],
    hasStaticData: true,
    source: 'external',
    note: null,
  }
}

describe('CachedStatsSource', () => {
  it('caches per filters and clears on patch change', async () => {
    let patch = '16.21'
    let calls = 0
    const source: StatsSource = {
      run: async () => {
        calls += 1
        return response(calls)
      },
    }
    const cached = new CachedStatsSource({ source, getPatch: () => patch })

    const first = await cached.run({ queue: 420 })
    const second = await cached.run({ queue: 420 })
    expect(second).toBe(first)
    expect(calls).toBe(1)

    await cached.run({ queue: 440 })
    expect(calls).toBe(2)

    patch = '16.20'
    await cached.run({ queue: 420 })
    expect(calls).toBe(3)
  })
})
