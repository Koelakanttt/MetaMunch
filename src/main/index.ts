import { join } from 'node:path'
import { setDefaultResultOrder } from 'node:dns'
import { app, BrowserWindow, dialog, net, protocol, safeStorage } from 'electron'
import { regionInfo } from '@shared/region'
import { loadChampionTags, loadRules } from './data/rules-data'
import { backupDatabase } from './db/backup'
import { getAccount } from './db/matches-repo'
import { migrations } from './db/migrations'
import { getSchemaVersion, runMigrations } from './db/migrate'
import { openDb } from './db/open'
import { createDbSource } from './db/static-data-source'
import { getLatestPatch } from './db/static-data-repo'
import { getRiotApiKey, loadEnv } from './env'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { DdragonAssetProvider } from './providers/ddragon-assets'
import { HttpDataDragonProvider } from './providers/http-data-dragon'
import { HttpRiotApiProvider } from './providers/http-riot-api'
import { MissingKeyRiotApiProvider } from './providers/missing-key-riot-api'
import { NetworkDiagnosticsProvider } from './providers/network-diagnostics'
import { networkFetch } from './providers/network-fetch'
import { RateLimiter } from './providers/rate-limiter'
import { riotFetch } from './providers/riot-fetch'
import type { RiotApiProvider } from './providers/riot-api'
import { RiotApiProxy } from './providers/riot-api-proxy'
import { RiotRequestManager } from './providers/riot-request-manager'
import { HttpRuneDataProvider } from './providers/rune-data'
import { ChampionSelectService } from './services/champion-select-service'
import { GameSessionWatcher } from './services/game-session-watcher'
import { GeneralStatsService } from './services/general-stats-service'
import { LiveGameService } from './services/live-game-service'
import { LpService } from './services/lp-service'
import { MatchHistoryService } from './services/match-history-service'
import { MatchReviewService } from './services/match-review-service'
import { MatchSyncService } from './services/match-sync-service'
import { MatchTimelineService } from './services/match-timeline-service'
import { MatchupService } from './services/matchup-service'
import { PatchChangesService } from './services/patch-changes-service'
import { PersonalStatsService } from './services/personal-stats-service'
import { PoolService } from './services/pool-service'
import { PostGameService } from './services/post-game-service'
import { PurchaseOrderService } from './services/purchase-order-service'
import { RecommendationService } from './services/recommendation-service'
import { ResearchEvidenceProvider } from './services/research-evidence-provider'
import { ResearchService } from './services/research-service'
import { ResearchBuildService } from './services/research-build-service'
import { RuneService } from './services/rune-service'
import type { SettingsCrypto } from './services/settings-service'
import { SettingsService } from './services/settings-service'
import { SkillOrderService } from './services/skill-order-service'
import { StatsCoordinator } from './services/stats-coordinator'
import { StaticDataService } from './services/static-data-service'
import { SynergyService } from './services/synergy-service'
import { TimelineBackfillService } from './services/timeline-backfill-service'
import { TimelineSummaryService } from './services/timeline-summary-service'

loadEnv(app.getAppPath())
setDefaultResultOrder('ipv4first')
// Chromium otherwise sends a Kyber/post-quantum ClientHello that the same DPI path drops.
app.commandLine.appendSwitch('disable-features', 'Kyber')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mm-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

process.on('uncaughtException', (error) => {
  dialog.showErrorBox('MetaMunch error', error instanceof Error ? error.message : String(error))
})

const chromiumFetch: typeof fetch = (input, init) =>
  net.fetch(input instanceof URL ? input.toString() : input, init)

const riotManager = new RiotRequestManager({
  fetchFn: riotFetch,
  fallbackFetchFn: chromiumFetch,
  limiter: new RateLimiter([
    { limit: 20, windowMs: 1000 },
    { limit: 60, windowMs: 120000 },
  ]),
  logger: (event) => console.info(JSON.stringify(event)),
})

function createRiotProvider(
  key: string | null,
  platform: string,
  manager: RiotRequestManager,
): RiotApiProvider {
  if (!key) return new MissingKeyRiotApiProvider()
  return new HttpRiotApiProvider({
    apiKey: key,
    region: regionInfo(platform).cluster,
    platform,
    manager,
  })
}

const secureStorage: SettingsCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
  decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64')),
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 750,
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function notifyStaticDataUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('staticData:updated')
  }
}

void app.whenReady().then(() => {
  const db = openDb(join(app.getPath('userData'), 'metamunch.db'))
  const backupDir = join(app.getPath('userData'), 'backups')
  const schemaVersion = getSchemaVersion(db)
  if (schemaVersion > 0 && schemaVersion < 15) {
    try {
      backupDatabase(db, backupDir)
    } catch (error) {
      console.error('Pre-migration backup failed', error)
    }
  }
  runMigrations(db, migrations)

  const assets = new DdragonAssetProvider({ fetchFn: networkFetch })
  protocol.handle('mm-asset', async (request) => {
    try {
      const parsed = new URL(request.url)
      const kind = parsed.hostname
      const id = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
      if (!id) return new Response(null, { status: 404 })

      if (kind === 'rune') {
        const asset = await assets.getRune(id)
        if (!asset) return new Response(null, { status: 404 })
        return new Response(new Uint8Array(asset.data), {
          headers: {
            'Content-Type': asset.contentType,
            'Cache-Control': 'public, max-age=86400',
          },
        })
      }

      if (kind !== 'champion' && kind !== 'item') {
        return new Response(null, { status: 404 })
      }
      const version = getLatestPatch(db)?.version ?? null
      if (!version) return new Response(null, { status: 404 })

      const asset = await assets.get(kind, version, id)
      if (!asset) return new Response(null, { status: 404 })
      return new Response(new Uint8Array(asset.data), {
        headers: {
          'Content-Type': asset.contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      return new Response(null, { status: 500 })
    }
  })

  const riotProxy = new RiotApiProxy(new MissingKeyRiotApiProvider())
  let applyRiotProvider: () => void = () => {}
  const settings = new SettingsService({
    db,
    crypto: secureStorage,
    envKey: getRiotApiKey(),
    onKeyChanged: () => applyRiotProvider(),
    onRegionChanged: () => applyRiotProvider(),
  })
  applyRiotProvider = () => {
    riotProxy.setProvider(createRiotProvider(settings.getKey(), settings.region(), riotManager))
  }
  applyRiotProvider()

  const dataDragon = new HttpDataDragonProvider({ fetchFn: networkFetch })
  const diagnostics = new NetworkDiagnosticsProvider({
    fetchFn: networkFetch,
    riot: riotManager,
  })
  const staticData = new StaticDataService({ db, provider: dataDragon })
  const matchSync = new MatchSyncService({
    db,
    provider: riotProxy,
    getPlatform: () => settings.region(),
  })
  const getTrackedAccount = () => {
    const account = getAccount(db)
    return account
      ? { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine }
      : null
  }
  const personal = new PersonalStatsService({ db, getAccount: getTrackedAccount })
  const lp = new LpService({ db, provider: () => riotProxy, getAccount: getTrackedAccount })
  const source = createDbSource(db)
  const timelineSummary = new TimelineSummaryService({
    db,
    source,
    provider: () => riotProxy,
    getAccount: getTrackedAccount,
  })
  const matchReview = new MatchReviewService({
    db,
    source,
    timelineSummary,
    getAccount: getTrackedAccount,
  })
  const gameSessionWatcher = new GameSessionWatcher({
    db,
    getAccount: getTrackedAccount,
    isEnabled: () => settings.labsEnabled(),
    sync: async () => {
      await matchSync.sync({ maxNewMatches: 3 })
      await timelineSummary.ensureRecent(5)
    },
  })
  gameSessionWatcher.start()
  const evidence = new ResearchEvidenceProvider({ db, source })
  const recommendation = new RecommendationService({
    source,
    rules: loadRules(),
    tags: loadChampionTags(),
    personal,
    evidence,
  })
  const patchChanges = new PatchChangesService({
    db,
    provider: dataDragon,
    getAccount: getTrackedAccount,
  })
  const pool = new PoolService({ db, source, getAccount: getTrackedAccount })
  const matchHistory = new MatchHistoryService({ db, source, getAccount: getTrackedAccount })
  const matchTimeline = new MatchTimelineService({ db, source, getAccount: getTrackedAccount })
  const research = new ResearchService({
    db,
    provider: riotProxy,
    source,
    getPatch: () => staticData.status()?.version ?? null,
    getRegion: () => settings.region(),
    getTimelineMode: () => settings.researchTimelineMode(),
  })
  const researchBuild = new ResearchBuildService({ db, source })
  const generalStats = new StatsCoordinator({
    own: new GeneralStatsService({ db, source, getAccount: getTrackedAccount }),
    isExternalEnabled: () => settings.externalStatsEnabled(),
  })
  const championSelect = new ChampionSelectService({
    getLeaguePath: () => settings.leaguePath(),
    source,
  })
  const liveGame = new LiveGameService({ source })
  const matchups = new MatchupService({ db, source })
  const synergies = new SynergyService({ db, source })
  const runes = new RuneService({
    db,
    source,
    provider: new HttpRuneDataProvider({ fetchFn: networkFetch }),
  })
  const purchaseOrder = new PurchaseOrderService({ db, source, getAccount: getTrackedAccount })
  const skillOrder = new SkillOrderService({ db, source, getAccount: getTrackedAccount })
  const timelineBackfill = new TimelineBackfillService({
    db,
    provider: riotProxy,
    getAccount: getTrackedAccount,
  })
  const postGame = new PostGameService({
    db,
    getAccount: getTrackedAccount,
    source,
    recommendation,
    championChanges: async (championId) => {
      const response = await patchChanges.run()
      const champion = response.champions.find((entry) => entry.id === championId)
      return champion ? champion.changes : null
    },
  })

  registerIpc(
    createHandlers({
      db,
      appVersion: app.getVersion(),
      dataPath: app.getPath('userData'),
      backupDir,
      staticData,
      matchSync,
      matchHistory,
      matchTimeline,
      matchReview,
      research,
      researchBuild,
      recommendation,
      patchChanges,
      pool,
      generalStats,
      championSelect,
      liveGame,
      lp,
      postGame,
      matchups,
      synergies,
      runes,
      purchaseOrder,
      skillOrder,
      timelineBackfill,
      timelineSummary,
      settings,
      diagnostics,
      riot: riotManager,
    }),
  )
  createWindow()

  // Startup patch check: pull Data Dragon only when the stored patch is outdated.
  void staticData
    .refresh()
    .then(() => notifyStaticDataUpdated())
    .catch(() => {})
  void lp.snapshot()
  void timelineSummary.ensureRecent()
  const lpTimer = setInterval(() => {
    void lp.snapshot()
  }, 60 * 60 * 1000)

  app.on('will-quit', () => {
    clearInterval(lpTimer)
    gameSessionWatcher.stop()
    db.close()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
