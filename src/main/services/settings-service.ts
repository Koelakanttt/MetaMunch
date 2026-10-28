import type { RegionPlatform } from '@shared/region'
import { DEFAULT_REGION, isRegionPlatform } from '@shared/region'
import { DEFAULT_THEME, isThemeId, type ThemeId } from '@shared/theme'
import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from '../db/settings-repo'

export const RIOT_KEY_SETTING = 'riot_api_key'
export const REGION_SETTING = 'region'
export const LEAGUE_PATH_SETTING = 'league_path'
export const EXTERNAL_STATS_SETTING = 'external_stats'
export const THEME_SETTING = 'theme'

/** Platform secure storage (Electron safeStorage in the app, a fake in tests). */
export interface SettingsCrypto {
  isAvailable(): boolean
  encrypt(text: string): string
  decrypt(encoded: string): string
}

export interface SettingsStatus {
  hasRiotKey: boolean
  keySource: 'stored' | 'env' | null
}

export interface SettingsServiceDeps {
  db: DatabaseSync
  crypto: SettingsCrypto
  envKey: string | null
  onKeyChanged?: (key: string | null) => void
  onRegionChanged?: (region: RegionPlatform) => void
}

/** Stores the Riot API key encrypted in the local settings table. Never keeps plaintext. */
export class SettingsService {
  private readonly db: DatabaseSync
  private readonly crypto: SettingsCrypto
  private readonly envKey: string | null
  private readonly onKeyChanged: (key: string | null) => void
  private readonly onRegionChanged: (region: RegionPlatform) => void

  constructor(deps: SettingsServiceDeps) {
    this.db = deps.db
    this.crypto = deps.crypto
    this.envKey = deps.envKey
    this.onKeyChanged = deps.onKeyChanged ?? (() => {})
    this.onRegionChanged = deps.onRegionChanged ?? (() => {})
  }

  status(): SettingsStatus {
    if (this.storedKey() !== null) return { hasRiotKey: true, keySource: 'stored' }
    if (this.envKey) return { hasRiotKey: true, keySource: 'env' }
    return { hasRiotKey: false, keySource: null }
  }

  region(): RegionPlatform {
    const stored = getSetting(this.db, REGION_SETTING)
    return stored !== null && isRegionPlatform(stored) ? stored : DEFAULT_REGION
  }

  saveRegion(region: string): void {
    if (!isRegionPlatform(region)) throw new Error(`Unknown region: ${region}`)
    setSetting(this.db, REGION_SETTING, region)
    this.onRegionChanged(region)
  }

  /** Optional League of Legends folder; empty means auto-detect. */
  leaguePath(): string | null {
    const stored = getSetting(this.db, LEAGUE_PATH_SETTING)?.trim()
    return stored ? stored : null
  }

  saveLeaguePath(path: string): void {
    setSetting(this.db, LEAGUE_PATH_SETTING, path.trim())
  }

  externalStatsEnabled(): boolean {
    return getSetting(this.db, EXTERNAL_STATS_SETTING) === '1'
  }

  saveExternalStats(enabled: boolean): void {
    setSetting(this.db, EXTERNAL_STATS_SETTING, enabled ? '1' : '0')
  }

  theme(): ThemeId {
    const stored = getSetting(this.db, THEME_SETTING)
    return stored !== null && isThemeId(stored) ? stored : DEFAULT_THEME
  }

  saveTheme(theme: string): void {
    if (!isThemeId(theme)) throw new Error(`Unknown theme: ${theme}`)
    setSetting(this.db, THEME_SETTING, theme)
  }

  getKey(): string | null {
    return this.storedKey() ?? this.envKey
  }

  saveRiotKey(key: string): void {
    const trimmed = key.trim()
    if (!trimmed) throw new Error('Riot API key is empty.')
    if (!this.crypto.isAvailable()) {
      throw new Error('Secure storage is unavailable on this system, so the key was not saved.')
    }
    setSetting(this.db, RIOT_KEY_SETTING, this.crypto.encrypt(trimmed))
    this.onKeyChanged(trimmed)
  }

  private storedKey(): string | null {
    const encoded = getSetting(this.db, RIOT_KEY_SETTING)
    if (encoded === null) return null
    try {
      const key = this.crypto.decrypt(encoded).trim()
      return key.length > 0 ? key : null
    } catch {
      return null
    }
  }
}
