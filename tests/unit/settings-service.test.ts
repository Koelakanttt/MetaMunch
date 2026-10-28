import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import { getSetting } from '../../src/main/db/settings-repo'
import {
  REGION_SETTING,
  RIOT_KEY_SETTING,
  SettingsService,
  THEME_SETTING,
  type SettingsCrypto,
} from '../../src/main/services/settings-service'

function memoryDb() {
  const db = openDb(':memory:')
  runMigrations(db, migrations)
  return db
}

function fakeCrypto(available = true): SettingsCrypto {
  return {
    isAvailable: () => available,
    encrypt: (text) => `enc:${text}`,
    decrypt: (encoded) => {
      if (!encoded.startsWith('enc:')) throw new Error('bad payload')
      return encoded.slice('enc:'.length)
    },
  }
}

describe('SettingsService', () => {
  it('saves the key encrypted and reports it as stored', () => {
    const db = memoryDb()
    const settings = new SettingsService({ db, crypto: fakeCrypto(), envKey: null })

    settings.saveRiotKey('  RGAPI-test  ')

    expect(getSetting(db, RIOT_KEY_SETTING)).toBe('enc:RGAPI-test')
    expect(settings.getKey()).toBe('RGAPI-test')
    expect(settings.status()).toEqual({ hasRiotKey: true, keySource: 'stored' })
  })

  it('falls back to the environment key', () => {
    const settings = new SettingsService({ db: memoryDb(), crypto: fakeCrypto(), envKey: 'env-key' })

    expect(settings.getKey()).toBe('env-key')
    expect(settings.status()).toEqual({ hasRiotKey: true, keySource: 'env' })
  })

  it('prefers the stored key over the environment key', () => {
    const settings = new SettingsService({ db: memoryDb(), crypto: fakeCrypto(), envKey: 'env-key' })

    settings.saveRiotKey('stored-key')

    expect(settings.status().keySource).toBe('stored')
    expect(settings.getKey()).toBe('stored-key')
  })

  it('reports no key without storage or environment', () => {
    const settings = new SettingsService({ db: memoryDb(), crypto: fakeCrypto(), envKey: null })

    expect(settings.status()).toEqual({ hasRiotKey: false, keySource: null })
    expect(settings.getKey()).toBeNull()
  })

  it('rejects empty keys and unavailable secure storage', () => {
    const empty = new SettingsService({ db: memoryDb(), crypto: fakeCrypto(), envKey: null })
    expect(() => empty.saveRiotKey('   ')).toThrow('empty')

    const unavailable = new SettingsService({
      db: memoryDb(),
      crypto: fakeCrypto(false),
      envKey: null,
    })
    expect(() => unavailable.saveRiotKey('RGAPI-test')).toThrow('Secure storage')
  })

  it('ignores a corrupted stored payload', () => {
    const db = memoryDb()
    const settings = new SettingsService({ db, crypto: fakeCrypto(), envKey: 'env-key' })
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(RIOT_KEY_SETTING, 'garbage')

    expect(settings.getKey()).toBe('env-key')
    expect(settings.status().keySource).toBe('env')
  })

  it('notifies about a saved key', () => {
    const calls: (string | null)[] = []
    const settings = new SettingsService({
      db: memoryDb(),
      crypto: fakeCrypto(),
      envKey: null,
      onKeyChanged: (key) => calls.push(key),
    })

    settings.saveRiotKey('RGAPI-test')

    expect(calls).toEqual(['RGAPI-test'])
  })

  it('defaults to EU West and persists a valid region', () => {
    const calls: string[] = []
    const settings = new SettingsService({
      db: memoryDb(),
      crypto: fakeCrypto(),
      envKey: null,
      onRegionChanged: (region) => calls.push(region),
    })

    expect(settings.region()).toBe('EUW1')

    settings.saveRegion('NA1')

    expect(settings.region()).toBe('NA1')
    expect(calls).toEqual(['NA1'])
  })

  it('rejects unknown regions and falls back on corrupted storage', () => {
    const db = memoryDb()
    const settings = new SettingsService({ db, crypto: fakeCrypto(), envKey: null })

    expect(() => settings.saveRegion('MARS')).toThrow('Unknown region')

    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(REGION_SETTING, 'MARS')
    expect(settings.region()).toBe('EUW1')
  })

  it('stores and clears the League client path', () => {
    const settings = new SettingsService({ db: memoryDb(), crypto: fakeCrypto(), envKey: null })

    expect(settings.leaguePath()).toBeNull()

    settings.saveLeaguePath('  C:\\Riot Games\\League of Legends  ')
    expect(settings.leaguePath()).toBe('C:\\Riot Games\\League of Legends')

    settings.saveLeaguePath('   ')
    expect(settings.leaguePath()).toBeNull()
  })

  it('stores the external statistics flag', () => {
    const settings = new SettingsService({ db: memoryDb(), crypto: fakeCrypto(), envKey: null })

    expect(settings.externalStatsEnabled()).toBe(false)

    settings.saveExternalStats(true)
    expect(settings.externalStatsEnabled()).toBe(true)

    settings.saveExternalStats(false)
    expect(settings.externalStatsEnabled()).toBe(false)
  })

  it('defaults to the pixel theme and stores a valid theme', () => {
    const db = memoryDb()
    const settings = new SettingsService({ db, crypto: fakeCrypto(), envKey: null })

    expect(settings.theme()).toBe('pixel')

    settings.saveTheme('slate')
    expect(settings.theme()).toBe('slate')
    expect(() => settings.saveTheme('neon')).toThrow('Unknown theme')

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      THEME_SETTING,
      'neon',
    )
    expect(settings.theme()).toBe('pixel')
  })
})
