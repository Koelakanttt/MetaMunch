import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../../src/main/providers/rate-limiter'
import { RiotApiError } from '../../src/main/providers/riot-api'
import {
  HttpRiotApiProvider,
  type HttpRiotApiOptions,
} from '../../src/main/providers/http-riot-api'

const TEST_KEY = 'test-key'
const ACCOUNT_URL =
  'https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/%D0%91%D0%B8%D0%B3%D0%B1%D1%83%D0%BB%D0%B8/22222'
const IDS_URL =
  'https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/puuid-me-0001/ids?queue=420&start=0&count=5'
const MATCH_URL = 'https://europe.api.riotgames.com/lol/match/v5/matches/EUW1_7000000001'

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8')
}

function makeProvider(
  handler: (url: string) => Response,
  extra: { maxRetries429?: number } = {},
) {
  const calls: { url: string; token: string | null; userAgent: string | null }[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({ url, token: headers.get('X-Riot-Token'), userAgent: headers.get('User-Agent') })
    return handler(url)
  }
  const limiter = new RateLimiter([{ limit: 1000, windowMs: 1000 }], { margin: 0 })
  const options: HttpRiotApiOptions = { apiKey: TEST_KEY, fetchFn, limiter }
  if (extra.maxRetries429 !== undefined) options.maxRetries429 = extra.maxRetries429
  return { provider: new HttpRiotApiProvider(options), calls }
}

function defaultHandler(url: string): Response {
  if (url === ACCOUNT_URL) return new Response(fixture('account.json'))
  if (url === IDS_URL) return new Response(fixture('match-ids.json'))
  if (url === MATCH_URL) return new Response(fixture('match.json'))
  return new Response('missing', { status: 404 })
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the call to reject')
}

describe('HttpRiotApiProvider', () => {
  it('builds the default URLs, sends headers and parses responses', async () => {
    const { provider, calls } = makeProvider(defaultHandler)

    const account = await provider.getAccountByRiotId('Бигбули', '22222')
    expect(account.puuid).toBe('puuid-me-0001')

    const ids = await provider.getMatchIds('puuid-me-0001', { queue: 420, start: 0, count: 5 })
    expect(ids).toHaveLength(3)

    const match = await provider.getMatch('EUW1_7000000001')
    expect(match.participants).toHaveLength(10)

    expect(calls[0]?.url).toBe(ACCOUNT_URL)
    expect(calls[0]?.token).toBe(TEST_KEY)
    expect(calls[0]?.userAgent).toBe('MetaMunch (personal project)')
    expect(calls[1]?.url).toBe(IDS_URL)
    expect(calls[2]?.url).toBe(MATCH_URL)
  })

  it('rejects 401 without leaking the key', async () => {
    const { provider } = makeProvider(() => new Response('no', { status: 401 }))

    const error = await captureError(provider.getAccountByRiotId('a', 'b'))

    expect(error).toBeInstanceOf(RiotApiError)
    if (error instanceof RiotApiError) {
      expect(error.status).toBe(401)
      expect(error.message).toContain('expired')
      expect(error.message).not.toContain(TEST_KEY)
    }
  })

  it('maps 404 to RiotApiError', async () => {
    const { provider } = makeProvider(() => new Response('no', { status: 404 }))

    const error = await captureError(provider.getAccountByRiotId('a', 'b'))

    expect(error).toBeInstanceOf(RiotApiError)
    if (error instanceof RiotApiError) expect(error.status).toBe(404)
  })

  it('retries a 429 once and then succeeds', async () => {
    let attempts = 0
    const { provider, calls } = makeProvider((url) => {
      attempts += 1
      if (attempts === 1) {
        return new Response('slow down', { status: 429, headers: { 'Retry-After': '0' } })
      }
      return defaultHandler(url)
    })

    const account = await provider.getAccountByRiotId('Бигбули', '22222')

    expect(account.puuid).toBe('puuid-me-0001')
    expect(calls).toHaveLength(2)
  })

  it('throws 429 after maxRetries429 retries', async () => {
    const { provider, calls } = makeProvider(
      () => new Response('slow down', { status: 429, headers: { 'Retry-After': '0' } }),
      { maxRetries429: 2 },
    )

    const error = await captureError(provider.getAccountByRiotId('a', 'b'))

    expect(error).toBeInstanceOf(RiotApiError)
    if (error instanceof RiotApiError) expect(error.status).toBe(429)
    expect(calls).toHaveLength(3)
  })

  it('maps other non-2xx statuses to RiotApiError', async () => {
    const { provider } = makeProvider(() => new Response('boom', { status: 500 }))

    const error = await captureError(provider.getAccountByRiotId('a', 'b'))

    expect(error).toBeInstanceOf(RiotApiError)
    if (error instanceof RiotApiError) expect(error.status).toBe(500)
  })
})
