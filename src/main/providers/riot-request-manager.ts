import { RiotApiError } from './riot-api'
import type { RateLimit } from './rate-limiter'
import { parseRateLimitHeader, RateLimiter } from './rate-limiter'

export interface RiotAttempt {
  transport: 'node' | 'chromium'
  ms: number
  status: number | null
  error: string | null
}

export interface RiotResult {
  response: Response
  transport: 'node' | 'chromium'
  attempts: RiotAttempt[]
}

export interface RiotCircuitStatus {
  state: 'closed' | 'open' | 'half-open'
  consecutiveNetworkErrors: number
  active: number
  maxConcurrent: number
}

export interface RiotRequestOptions {
  timeoutMs?: number
  maxNetworkRetries?: number
  maxRateLimitRetries?: number
}

export interface RiotRequestManagerOptions {
  fetchFn?: typeof fetch
  fallbackFetchFn?: typeof fetch
  limiter?: RateLimiter
  maxConcurrent?: number
  maxNetworkRetries?: number
  maxRateLimitRetries?: number
  timeoutMs?: number
  circuitCooldownMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  logger?: (event: Record<string, unknown>) => void
}

export class RiotCircuitOpenError extends Error {
  constructor() {
    super('Riot API unreachable, background jobs paused. Retry when the connection is back.')
    this.name = 'RiotCircuitOpenError'
  }
}

export function isRiotCircuitOpen(error: unknown): error is RiotCircuitOpenError {
  return error instanceof RiotCircuitOpenError
}

function networkDetail(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : null
  const message =
    cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error)
  return `${code ? `${code}: ` : ''}${message}`
}

function jitter(ms: number): number {
  return Math.round(ms * (0.85 + Math.random() * 0.3))
}

function mergeLimits(...groups: RateLimit[][]): RateLimit[] {
  const byWindow = new Map<number, RateLimit>()
  for (const group of groups) {
    for (const limit of group) {
      const existing = byWindow.get(limit.windowMs)
      if (!existing || limit.limit < existing.limit) byWindow.set(limit.windowMs, limit)
    }
  }
  return [...byWindow.values()]
}

/**
 * The only path to the Riot API. One limiter and one queue are shared by sync,
 * timelines, research and diagnostics; at most `maxConcurrent` requests are in flight.
 */
export class RiotRequestManager {
  private readonly fetchFn: typeof fetch
  private readonly fallbackFetchFn: typeof fetch | null
  private readonly limiter: RateLimiter
  private readonly maxConcurrent: number
  private readonly maxNetworkRetries: number
  private readonly maxRateLimitRetries: number
  private readonly timeoutMs: number
  private readonly circuitCooldownMs: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly logger: (event: Record<string, unknown>) => void
  private readonly listeners = new Set<(status: RiotCircuitStatus) => void>()
  private active = 0
  private waiters: Array<() => void> = []
  private consecutiveNetworkErrors = 0
  private circuitOpen = false
  private circuitOpenedAt = 0
  private halfOpenProbe = false

  constructor(options: RiotRequestManagerOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch
    this.fallbackFetchFn = options.fallbackFetchFn ?? null
    this.limiter = options.limiter ?? new RateLimiter()
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2)
    this.maxNetworkRetries = Math.max(0, options.maxNetworkRetries ?? 2)
    this.maxRateLimitRetries = Math.max(0, options.maxRateLimitRetries ?? 3)
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.circuitCooldownMs = Math.max(0, options.circuitCooldownMs ?? 30_000)
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.logger = options.logger ?? (() => {})
  }

  status(): RiotCircuitStatus {
    return {
      state: this.circuitOpen ? (this.halfOpenProbe ? 'half-open' : 'open') : 'closed',
      consecutiveNetworkErrors: this.consecutiveNetworkErrors,
      active: this.active,
      maxConcurrent: this.maxConcurrent,
    }
  }

  onStatus(listener: (status: RiotCircuitStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  resetCircuit(): void {
    this.circuitOpen = false
    this.circuitOpenedAt = 0
    this.halfOpenProbe = false
    this.consecutiveNetworkErrors = 0
    this.notify()
  }

  async request(
    url: string,
    init: RequestInit = {},
    options: RiotRequestOptions = {},
  ): Promise<RiotResult> {
    if (this.circuitOpen) {
      const cooledDown = this.now() - this.circuitOpenedAt >= this.circuitCooldownMs
      if (!cooledDown || this.halfOpenProbe) throw new RiotCircuitOpenError()
      this.halfOpenProbe = true
      this.notify()
    }

    const timeoutMs = options.timeoutMs ?? this.timeoutMs
    const maxNetworkRetries = options.maxNetworkRetries ?? this.maxNetworkRetries
    const maxRateLimitRetries = options.maxRateLimitRetries ?? this.maxRateLimitRetries
    const history: RiotAttempt[] = []
    for (let networkAttempt = 0; ; networkAttempt += 1) {
      for (let rateAttempt = 0; ; rateAttempt += 1) {
        await this.limiter.acquire()
        await this.acquireSlot()
        const result = await this.executeAttempt(url, init, timeoutMs)
        this.releaseSlot()
        history.push(...result.attempts)

        if (!result.response) {
          this.recordNetworkFailure(result.attempts)
          if (this.circuitOpen) throw new RiotCircuitOpenError()
          if (networkAttempt >= maxNetworkRetries) {
            const error = new RiotApiError(
              0,
              `Riot API network error: ${history.map((a) => `${a.transport}: ${a.error}`).join('; ')}`,
            )
            error.attempts = history
            throw error
          }
          await this.sleep(jitter(networkAttempt === 0 ? 1_000 : 3_000))
          break
        }

        const response = result.response
        this.closeCircuit()
        this.applyLimits(response)

        if (response.status === 429 && rateAttempt < maxRateLimitRetries) {
          const retryAfter = Number(response.headers.get('Retry-After'))
          const wait = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 1000
          this.limiter.penalize(wait)
          await this.sleep(wait)
          continue
        }

        this.logger({
          event: 'riot_request',
          host: new URL(url).host,
          transport: result.transport,
          status: response.status,
          attempts: history,
        })
        return { ...result, response, attempts: history }
      }
    }
  }

  private async executeAttempt(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<{ response: Response | null; transport: 'node' | 'chromium'; attempts: RiotAttempt[] }> {
    const attempts: RiotAttempt[] = []
    const nodeStarted = this.now()
    try {
      const response = await this.fetchFn(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
      attempts.push({
        transport: 'node',
        ms: this.now() - nodeStarted,
        status: response.status,
        error: null,
      })
      return { response, transport: 'node', attempts }
    } catch (error) {
      attempts.push({
        transport: 'node',
        ms: this.now() - nodeStarted,
        status: null,
        error: networkDetail(error),
      })
    }

    if (!this.fallbackFetchFn) {
      return { response: null, transport: 'node', attempts }
    }

    const fallbackStarted = this.now()
    try {
      const response = await this.fallbackFetchFn(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
      attempts.push({
        transport: 'chromium',
        ms: this.now() - fallbackStarted,
        status: response.status,
        error: null,
      })
      return { response, transport: 'chromium', attempts }
    } catch (error) {
      attempts.push({
        transport: 'chromium',
        ms: this.now() - fallbackStarted,
        status: null,
        error: networkDetail(error),
      })
      return { response: null, transport: 'chromium', attempts }
    }
  }

  private recordNetworkFailure(attempts: RiotAttempt[]): void {
    const wasHalfOpen = this.halfOpenProbe
    this.halfOpenProbe = false
    this.consecutiveNetworkErrors += 1
    this.logger({
      event: 'riot_network_error',
      consecutive: this.consecutiveNetworkErrors,
      attempts,
    })
    if (wasHalfOpen || this.consecutiveNetworkErrors >= 5) {
      this.circuitOpen = true
      this.circuitOpenedAt = this.now()
    }
    this.notify()
  }

  private closeCircuit(): void {
    this.circuitOpen = false
    this.circuitOpenedAt = 0
    this.halfOpenProbe = false
    this.consecutiveNetworkErrors = 0
    this.notify()
  }

  private applyLimits(response: Response): void {
    const app = parseRateLimitHeader(response.headers.get('X-App-Rate-Limit'))
    const method = parseRateLimitHeader(response.headers.get('X-Method-Rate-Limit'))
    const limits = mergeLimits(app, method)
    if (limits.length > 0) this.limiter.setLimits(limits)
  }

  private acquireSlot(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1
      this.notify()
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active += 1
        this.notify()
        resolve()
      })
    })
  }

  private releaseSlot(): void {
    this.active = Math.max(0, this.active - 1)
    const next = this.waiters.shift()
    if (next) next()
    this.notify()
  }

  private notify(): void {
    const status = this.status()
    for (const listener of this.listeners) listener(status)
  }
}
