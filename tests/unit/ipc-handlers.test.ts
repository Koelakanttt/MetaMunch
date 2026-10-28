import { describe, expect, it } from 'vitest'
import { loadChampionTags, loadRules } from '../../src/main/data/rules-data'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import { getSetting } from '../../src/main/db/settings-repo'
import { createHandlers } from '../../src/main/ipc/handlers'
import type { DataDragonProvider } from '../../src/main/providers/data-dragon'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
import { ChampionSelectService } from '../../src/main/services/champion-select-service'
import { GeneralStatsService } from '../../src/main/services/general-stats-service'
import { LiveGameService } from '../../src/main/services/live-game-service'
import { MatchHistoryService } from '../../src/main/services/match-history-service'
import { MatchSyncService } from '../../src/main/services/match-sync-service'
import { MatchupService } from '../../src/main/services/matchup-service'
import { PatchChangesService } from '../../src/main/services/patch-changes-service'
import { PoolService } from '../../src/main/services/pool-service'
import { PostGameService } from '../../src/main/services/post-game-service'
import { RecommendationService } from '../../src/main/services/recommendation-service'
import { RuneService } from '../../src/main/services/rune-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import {
  RIOT_KEY_SETTING,
  SettingsService,
  type SettingsCrypto,
} from '../../src/main/services/settings-service'
import { StatsCoordinator } from '../../src/main/services/stats-coordinator'
import { StaticDataService } from '../../src/main/services/static-data-service'
import { SynergyService } from '../../src/main/services/synergy-service'

const dataDragonProvider: DataDragonProvider = {
  getLatestVersion: async () => '16.3.1',
  getChampions: async () => ({ values: [], skipped: [] }),
  getItems: async () => ({ values: [], skipped: [] }),
  getVersions: async () => [],
  getChampionDetail: async () => {
    throw new Error('not used')
  },
}

const riotProvider: RiotApiProvider = {
  getAccountByRiotId: async () => ({ puuid: 'puuid-test', gameName: 'Test', tagLine: 'TAG' }),
  getMatchIds: async () => [],
  getMatch: async () => {
    throw new Error('not used')
  },
}

const fakeSource: StaticDataSource = {
  latestVersion: () => null,
  champions: () => [],
  items: () => [],
}

const db = openDb(':memory:')
runMigrations(db, migrations)
const staticData = new StaticDataService({ db, provider: dataDragonProvider })
const matchSync = new MatchSyncService({ db, provider: riotProvider })
const recommendation = new RecommendationService({
  source: fakeSource,
  rules: loadRules(),
  tags: loadChampionTags(),
})
const patchChanges = new PatchChangesService({
  db,
  provider: dataDragonProvider,
  getAccount: () => null,
})
const crypto: SettingsCrypto = {
  isAvailable: () => true,
  encrypt: (text) => `enc:${Buffer.from(text, 'utf8').toString('base64')}`,
  decrypt: (encoded) => Buffer.from(encoded.replace(/^enc:/, ''), 'base64').toString('utf8'),
}
const settings = new SettingsService({ db, crypto, envKey: null })
const pool = new PoolService({ db, source: fakeSource, getAccount: () => null })
const matchHistory = new MatchHistoryService({ db, source: fakeSource, getAccount: () => null })
const generalStats = new StatsCoordinator({
  own: new GeneralStatsService({ db, source: fakeSource }),
  isExternalEnabled: () => false,
})
const championSelect = new ChampionSelectService({
  getLeaguePath: () => null,
  source: fakeSource,
  findLockfile: () => null,
})
const liveGame = new LiveGameService({ source: fakeSource, readLiveGame: async () => null })
const postGame = new PostGameService({
  db,
  getAccount: () => null,
  source: fakeSource,
  recommendation,
})
const matchups = new MatchupService({ db, source: fakeSource })
const synergies = new SynergyService({ db, source: fakeSource })
const runes = new RuneService({
  db,
  source: fakeSource,
  provider: { getRunes: async () => [] },
})
const handlers = createHandlers({
  db,
  appVersion: '0.1.0-alpha',
  staticData,
  matchSync,
  matchHistory,
  recommendation,
  patchChanges,
  pool,
  generalStats,
  championSelect,
  liveGame,
  postGame,
  matchups,
  synergies,
  runes,
  settings,
})

describe('ipc handlers', () => {
  it('answers app:ping with pong and a timestamp', async () => {
    const res = await handlers['app:ping']({ message: 'x' })

    expect(res.reply).toBe('pong: x')
    expect(typeof res.at).toBe('number')
  })

  it('reports db info', async () => {
    const res = await handlers['db:info']({})

    expect(res.schemaVersion).toBe(6)
    expect(res.sqliteVersion).toMatch(/^3\./)
    expect(res.appVersion).toBe('0.1.0-alpha')
  })

  it('lists champions without static data', () => {
    expect(handlers['champions:list']({})).toEqual({ version: null, champions: [] })
  })

  it('rejects recommendations without static data', () => {
    expect(() =>
      handlers['recommend:run']({ meId: 'Garen', role: 'TOP', enemyIds: [] }),
    ).toThrow('Update data')
  })

  it('reports patch changes without an account', async () => {
    const res = await handlers['patch:changes']({})

    expect(res.notes).toEqual(['No account set.'])
  })

  it('reports an empty pool without an account', () => {
    expect(handlers['pool:list']({})).toEqual({
      account: null,
      overall: null,
      entries: [],
      hasStaticData: false,
    })
  })

  it('reports empty match history without an account', () => {
    expect(handlers['matches:history']({})).toEqual({
      account: null,
      entries: [],
      patches: [],
      hasStaticData: false,
    })
  })

  it('reports an empty general sample', async () => {
    expect(await handlers['stats:general']({})).toEqual({
      sample: { matches: 0, picks: 0 },
      patches: [],
      champions: [],
      items: [],
      hasStaticData: false,
      source: 'own',
      note: null,
    })
  })

  it('reports settings without a Riot key', () => {
    expect(handlers['settings:get']({})).toEqual({
      hasRiotKey: false,
      keySource: null,
      region: 'EUW1',
      leaguePath: null,
      externalStatsEnabled: false,
      theme: 'pixel',
    })
  })

  it('stores the Riot key encrypted', () => {
    expect(handlers['settings:setRiotKey']({ key: 'RGAPI-test' })).toEqual({ ok: true })

    expect(handlers['settings:get']({})).toEqual({
      hasRiotKey: true,
      keySource: 'stored',
      region: 'EUW1',
      leaguePath: null,
      externalStatsEnabled: false,
      theme: 'pixel',
    })
    const stored = getSetting(db, RIOT_KEY_SETTING)
    expect(stored?.startsWith('enc:')).toBe(true)
    expect(stored).not.toContain('RGAPI-test')
  })

  it('stores a valid region', async () => {
    expect(handlers['settings:setRegion']({ region: 'NA1' })).toEqual({ ok: true })
    expect((await handlers['settings:get']({})).region).toBe('NA1')
    expect(() => handlers['settings:setRegion']({ region: 'MARS' })).toThrow('Unknown region')
  })

  it('stores a League client path', async () => {
    expect(
      handlers['settings:setLeaguePath']({ path: '  C:\\Riot Games\\League of Legends  ' }),
    ).toEqual({ ok: true })
    expect((await handlers['settings:get']({})).leaguePath).toBe(
      'C:\\Riot Games\\League of Legends',
    )
  })

  it('stores the external statistics flag', async () => {
    expect(handlers['settings:setExternalStats']({ enabled: true })).toEqual({ ok: true })
    expect((await handlers['settings:get']({})).externalStatsEnabled).toBe(true)
    expect(handlers['settings:setExternalStats']({ enabled: false })).toEqual({ ok: true })
    expect((await handlers['settings:get']({})).externalStatsEnabled).toBe(false)
  })

  it('stores the theme', async () => {
    expect(handlers['settings:setTheme']({ theme: 'slate' })).toEqual({ ok: true })
    expect((await handlers['settings:get']({})).theme).toBe('slate')
    expect(() => handlers['settings:setTheme']({ theme: 'neon' })).toThrow('Unknown theme')
  })

  it('reports no League client when the lockfile is absent', async () => {
    const status = await handlers['champSelect:status']({})
    expect(status).toMatchObject({ state: 'not-found' })
  })

  it('reports no live game', async () => {
    expect(await handlers['live:status']({})).toEqual({ state: 'not-in-game' })
  })

  it('reports no post-game review without an account', async () => {
    expect(await handlers['review:last']({})).toEqual({ state: 'no-account' })
  })

  it('reports empty matchups without static data', async () => {
    expect(await handlers['matchups:list']({ championId: 'Garen' })).toMatchObject({
      championId: 'Garen',
      championName: null,
      strong: [],
      weak: [],
    })
  })

  it('reports empty synergies without static data', async () => {
    expect(await handlers['synergies:list']({ championId: 'Garen' })).toMatchObject({
      championId: 'Garen',
      championName: null,
      best: [],
      worst: [],
      hasStaticData: false,
    })
  })

  it('reports empty rune pages without static data', async () => {
    expect(await handlers['runes:popular']({ championId: 'Garen' })).toMatchObject({
      championId: 'Garen',
      pages: [],
      hasStaticData: false,
    })
  })
})
