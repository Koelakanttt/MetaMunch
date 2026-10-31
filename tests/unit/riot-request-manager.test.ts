import { afterEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from '../../src/main/providers/rate-limiter'
import {
  RiotCircuitOpenError,
  RiotRequestManager,
} from '../../src/main/providers/riot-request-manager'

function limiter(): RateLimiter {
  return new RateLimiter([{ limit: 1000, windowMs: 1000 }], { margin: 0 })
}

const URL = 'https://europe.api.riotgames.com/test'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RiotRequestManager', () => {
  it('never exceeds two concurrent requests', async () => {
    let active = 0
    let maxActive = 0
    const fetchFn: typeof fetch = async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return new Response('{}', { status: 200 })
    }
    const manager = new RiotRequestManager({ fetchFn, limiter: limiter() })

    await Promise.all(Array.from({ length: 6 }, () => manager.request(URL)))

    expect(maxActive).toBe(2)
  })

  it('retries network errors twice with 1s and 3s backoff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const sleeps: number[] = []
    let calls = 0
    const fetchFn: typeof fetch = async () => {
      calls += 1
      if (calls < 3) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
      return new Response('{}', { status: 200 })
    }
    const manager = new RiotRequestManager({
      fetchFn,
      limiter: limiter(),
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })

    await manager.request(URL)

    expect(calls).toBe(3)
    expect(sleeps).toEqual([1000, 3000])
  })

  it('waits for Retry-After on 429 and retries once', async () => {
    let calls = 0
    const sleeps: number[] = []
    const fetchFn: typeof fetch = async () => {
      calls += 1
      if (calls === 1) {
        return new Response('{}', {
          status: 429,
          headers: { 'Retry-After': '0' },
        })
      }
      return new Response('{}', { status: 200 })
    }
    const manager = new RiotRequestManager({
      fetchFn,
      limiter: limiter(),
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })

    const result = await manager.request(URL)

    expect(result.response.status).toBe(200)
    expect(calls).toBe(2)
    expect(sleeps).toEqual([0])
  })

  it('does not retry 401', async () => {
    let calls = 0
    const fetchFn: typeof fetch = async () => {
      calls += 1
      return new Response('{}', { status: 401 })
    }
    const manager = new RiotRequestManager({ fetchFn, limiter: limiter() })

    const result = await manager.request(URL)

    expect(result.response.status).toBe(401)
    expect(calls).toBe(1)
  })

  it('uses Chromium only after a network-level Node failure', async () => {
    const node: typeof fetch = async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
    }
    const chromium: typeof fetch = async () => new Response('{}', { status: 200 })
    const manager = new RiotRequestManager({
      fetchFn: node,
      fallbackFetchFn: chromium,
      limiter: limiter(),
    })

    const result = await manager.request(URL)

    expect(result.transport).toBe('chromium')
    expect(result.attempts.map((attempt) => attempt.transport)).toEqual(['node', 'chromium'])
  })

  it('opens the circuit after five network failures and resets after retry', async () => {
    let calls = 0
    let fail = true
    const fetchFn: typeof fetch = async () => {
      calls += 1
      if (fail) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
      return new Response('{}', { status: 200 })
    }
    const manager = new RiotRequestManager({
      fetchFn,
      limiter: limiter(),
      maxNetworkRetries: 0,
      sleep: async () => {},
    })

    for (let index = 0; index < 5; index += 1) {
      await expect(manager.request(URL)).rejects.toBeInstanceOf(Error)
    }
    expect(manager.status().state).toBe('open')
    const before = calls
    await expect(manager.request(URL)).rejects.toBeInstanceOf(RiotCircuitOpenError)
    expect(calls).toBe(before)

    fail = false
    manager.resetCircuit()
    expect(manager.status().state).toBe('closed')
    await manager.request(URL)
    expect(manager.status().state).toBe('closed')
  })

  it('closes the circuit after a successful half-open probe once the cooldown passed', async () => {
    let now = 0
    let fail = true
    let calls = 0
    const fetchFn: typeof fetch = async () => {
      calls += 1
      if (fail) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
      return new Response('{}', { status: 200 })
    }
    const manager = new RiotRequestManager({
      fetchFn,
      limiter: limiter(),
      maxNetworkRetries: 0,
      circuitCooldownMs: 30_000,
      now: () => now,
      sleep: async () => {},
    })

    for (let index = 0; index < 5; index += 1) {
      await expect(manager.request(URL)).rejects.toBeInstanceOf(Error)
    }
    expect(manager.status().state).toBe('open')
    const before = calls
    await expect(manager.request(URL)).rejects.toBeInstanceOf(RiotCircuitOpenError)
    expect(calls).toBe(before)

    fail = false
    now = 30_000
    const result = await manager.request(URL)

    expect(result.response.status).toBe(200)
    expect(manager.status().state).toBe('closed')
  })

  it('never logs or returns the Riot token', async () => {
    const logs: string[] = []
    const fetchFn: typeof fetch = async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
    }
    const manager = new RiotRequestManager({
      fetchFn,
      limiter: limiter(),
      maxNetworkRetries: 0,
      logger: (event) => logs.push(JSON.stringify(event)),
    })

    const error = await manager
      .request(URL, { headers: { 'X-Riot-Token': 'RGAPI-SECRET' } })
      .catch((reason: unknown) => reason)

    expect(String(error)).not.toContain('RGAPI-SECRET')
    expect(logs.join('\n')).not.toContain('RGAPI-SECRET')
  })
})
