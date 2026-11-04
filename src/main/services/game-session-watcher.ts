import type { DatabaseSync } from 'node:sqlite'
import { latestPersonalMatchId } from '../db/review-repo'
import { readLiveGame as defaultReadLiveGame } from '../providers/live-client'
import type { TrackedAccount } from './personal-stats-service'

export const POST_GAME_DELAYS_MS = [45_000, 90_000, 180_000] as const

export interface GameSessionWatcherDeps {
  db: DatabaseSync
  getAccount: () => TrackedAccount | null
  sync: () => Promise<unknown>
  readLiveGame?: () => Promise<unknown | null>
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  isEnabled?: () => boolean
}

/**
 * Watches the local game client and kicks a delayed match sync after the game process disappears.
 * LiveClientData has no end event, so a live -> not-live transition is the signal.
 */
export class GameSessionWatcher {
  private readonly db: DatabaseSync
  private readonly getAccount: () => TrackedAccount | null
  private readonly sync: () => Promise<unknown>
  private readonly readLiveGame: () => Promise<unknown | null>
  private readonly intervalMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly isEnabled: () => boolean
  private timer: ReturnType<typeof setInterval> | null = null
  private wasLive = false
  private syncing = false

  constructor(deps: GameSessionWatcherDeps) {
    this.db = deps.db
    this.getAccount = deps.getAccount
    this.sync = deps.sync
    this.readLiveGame = deps.readLiveGame ?? defaultReadLiveGame
    this.intervalMs = deps.intervalMs ?? 10_000
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.isEnabled = deps.isEnabled ?? (() => true)
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.check()
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Visible for tests; a normal app uses start(). */
  async check(): Promise<void> {
    if (!this.isEnabled()) return
    const payload = await this.readLiveGame().catch(() => null)
    const live = payload !== null
    if (live && !this.wasLive) {
      this.wasLive = true
      return
    }
    if (!live && this.wasLive) {
      this.wasLive = false
      await this.runAttempts()
    }
  }

  async runAttempts(): Promise<void> {
    if (this.syncing) return
    const account = this.getAccount()
    if (!account) return
    this.syncing = true
    try {
      for (const delay of POST_GAME_DELAYS_MS) {
        await this.sleep(delay)
        const before = latestPersonalMatchId(this.db, account.puuid)
        try {
          await this.sync()
        } catch {
          continue
        }
        const after = latestPersonalMatchId(this.db, account.puuid)
        if (after && after !== before) return
      }
    } finally {
      this.syncing = false
    }
  }
}
