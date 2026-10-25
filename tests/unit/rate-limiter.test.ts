import { describe, expect, it } from 'vitest'
import {
  RateLimiter,
  parseRateLimitHeader,
  parseRetryAfterMs,
  type RateLimit,
} from '../../src/main/providers/rate-limiter'

function setup(limits: RateLimit[], margin = 0) {
  const clock = { t: 0 }
  const limiter = new RateLimiter(limits, {
    margin,
    now: () => clock.t,
    // yield once so callers resumed by an earlier grant observe the clock before it jumps
    sleep: async (ms) => {
      await Promise.resolve()
      clock.t += ms
    },
  })
  const times: number[] = []
  const run = (n: number) =>
    Promise.all(
      Array.from({ length: n }, async (_, i) => {
        await limiter.acquire()
        times.push(clock.t)
        return i
      }),
    )
  return { clock, limiter, times, run }
}

describe('RateLimiter', () => {
  it('delays requests beyond a single window limit', async () => {
    const { times, run } = setup([{ limit: 2, windowMs: 1000 }])
    await run(3)
    expect(times).toEqual([0, 0, 1000])
  })
  it('respects several windows at once', async () => {
    const { times, run } = setup([
      { limit: 2, windowMs: 1000 },
      { limit: 3, windowMs: 5000 },
    ])
    await run(5)
    expect(times).toEqual([0, 0, 1000, 5000, 5000])
  })
  it('keeps a safety margin', async () => {
    const { times, run } = setup([{ limit: 3, windowMs: 1000 }], 1)
    await run(3)
    expect(times).toEqual([0, 0, 1000])
  })
  it('serves callers in FIFO order', async () => {
    const { run } = setup([{ limit: 1, windowMs: 100 }])
    expect(await run(4)).toEqual([0, 1, 2, 3])
  })
  it('blocks everything after penalize()', async () => {
    const { limiter, times, run } = setup([{ limit: 10, windowMs: 1000 }])
    limiter.penalize(500)
    await run(2)
    expect(times).toEqual([500, 500])
  })
  it('applies limits updated with setLimits()', async () => {
    const { limiter, times, run } = setup([{ limit: 10, windowMs: 1000 }])
    limiter.setLimits([{ limit: 1, windowMs: 1000 }])
    await run(2)
    expect(times).toEqual([0, 1000])
  })
})

describe('header parsing', () => {
  it('parses X-App-Rate-Limit', () => {
    expect(parseRateLimitHeader('20:1,100:120')).toEqual([
      { limit: 20, windowMs: 1000 },
      { limit: 100, windowMs: 120000 },
    ])
  })
  it('returns [] for missing or malformed values', () => {
    expect(parseRateLimitHeader(null)).toEqual([])
    expect(parseRateLimitHeader('')).toEqual([])
    expect(parseRateLimitHeader('abc')).toEqual([])
    expect(parseRateLimitHeader('20:0')).toEqual([])
  })
  it('parses Retry-After in seconds', () => {
    expect(parseRetryAfterMs('3')).toBe(3000)
    expect(parseRetryAfterMs('0')).toBe(0)
    expect(parseRetryAfterMs(null)).toBeNull()
    expect(parseRetryAfterMs('soon')).toBeNull()
  })
})
