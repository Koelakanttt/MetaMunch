export interface RateLimit {
  limit: number
  windowMs: number
}

export interface RateLimiterOptions {
  /** Requests kept free in every window as a safety buffer. Default 1. */
  margin?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** Riot development key limits: 20 requests / 1 s and 100 requests / 2 min. */
export const DEV_KEY_LIMITS: readonly RateLimit[] = [
  { limit: 20, windowMs: 1_000 },
  { limit: 100, windowMs: 120_000 },
]

/**
 * Sliding-window limiter. acquire() resolves, in FIFO order, once a request may be sent
 * without exceeding any of the configured limits.
 */
export class RateLimiter {
  private limits: RateLimit[]
  private readonly margin: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly stamps: number[] = []
  private readonly queue: Array<() => void> = []
  private pumping = false
  private blockedUntil = 0

  constructor(limits: readonly RateLimit[] = DEV_KEY_LIMITS, options: RateLimiterOptions = {}) {
    this.limits = [...limits]
    this.margin = options.margin ?? 1
    this.now = options.now ?? (() => Date.now())
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  setLimits(limits: readonly RateLimit[]): void {
    this.limits = [...limits]
  }

  /** Blocks every acquisition for the next `ms` milliseconds (e.g. after HTTP 429 with Retry-After). */
  penalize(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms)
  }

  acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
      void this.pump()
    })
  }

  private waitTime(): number {
    const now = this.now()
    let wait = Math.max(0, this.blockedUntil - now)
    for (const { limit, windowMs } of this.limits) {
      const max = Math.max(1, limit - this.margin)
      const inWindow = this.stamps.filter((t) => t > now - windowMs)
      if (inWindow.length >= max) {
        const oldestToExpire = inWindow[inWindow.length - max] as number
        wait = Math.max(wait, oldestToExpire + windowMs - now)
      }
    }
    return wait
  }

  private prune(): void {
    const longest = Math.max(0, ...this.limits.map((l) => l.windowMs))
    const cutoff = this.now() - longest
    while (this.stamps.length > 0 && (this.stamps[0] as number) <= cutoff) this.stamps.shift()
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.queue.length > 0) {
        const wait = this.waitTime()
        if (wait > 0) {
          await this.sleep(wait)
          continue
        }
        const grant = this.queue.shift()
        this.stamps.push(this.now())
        this.prune()
        grant?.()
      }
    } finally {
      this.pumping = false
    }
  }
}

/** Parses "20:1,100:120" (X-App-Rate-Limit) into limits. Returns [] for missing or malformed input. */
export function parseRateLimitHeader(value: string | null): RateLimit[] {
  if (!value) return []
  const limits: RateLimit[] = []
  for (const part of value.split(',')) {
    const [limit, seconds] = part.split(':').map(Number)
    if (limit === undefined || seconds === undefined) return []
    if (!Number.isFinite(limit) || !Number.isFinite(seconds) || limit <= 0 || seconds <= 0) return []
    limits.push({ limit, windowMs: seconds * 1000 })
  }
  return limits
}

/** Retry-After header (seconds) -> milliseconds, or null when absent or invalid. */
export function parseRetryAfterMs(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
}
