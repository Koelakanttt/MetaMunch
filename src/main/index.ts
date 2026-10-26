import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { loadChampionTags, loadRules } from './data/rules-data'
import { getAccount } from './db/matches-repo'
import { migrations } from './db/migrations'
import { runMigrations } from './db/migrate'
import { openDb } from './db/open'
import { createDbSource } from './db/static-data-source'
import { getRiotApiKey, loadEnv } from './env'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { HttpDataDragonProvider } from './providers/http-data-dragon'
import { HttpRiotApiProvider } from './providers/http-riot-api'
import { MissingKeyRiotApiProvider } from './providers/missing-key-riot-api'
import { MatchSyncService } from './services/match-sync-service'
import { PatchChangesService } from './services/patch-changes-service'
import { PersonalStatsService } from './services/personal-stats-service'
import { RecommendationService } from './services/recommendation-service'
import { StaticDataService } from './services/static-data-service'

loadEnv(app.getAppPath())

const riotApiKey = getRiotApiKey()
const riotProvider = riotApiKey
  ? new HttpRiotApiProvider({ apiKey: riotApiKey })
  : new MissingKeyRiotApiProvider()

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 750,
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

void app.whenReady().then(() => {
  const db = openDb(join(app.getPath('userData'), 'metamunch.db'))
  runMigrations(db, migrations)
  const dataDragon = new HttpDataDragonProvider()
  const staticData = new StaticDataService({ db, provider: dataDragon })
  const matchSync = new MatchSyncService({ db, provider: riotProvider })
  const getTrackedAccount = () => {
    const account = getAccount(db)
    return account
      ? { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine }
      : null
  }
  const personal = new PersonalStatsService({ db, getAccount: getTrackedAccount })
  const recommendation = new RecommendationService({
    source: createDbSource(db),
    rules: loadRules(),
    tags: loadChampionTags(),
    personal,
  })
  const patchChanges = new PatchChangesService({
    db,
    provider: dataDragon,
    getAccount: getTrackedAccount,
  })
  registerIpc(createHandlers({ db, staticData, matchSync, recommendation, patchChanges }))
  createWindow()

  app.on('will-quit', () => {
    db.close()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
