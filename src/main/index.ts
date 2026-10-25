import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { migrations } from './db/migrations'
import { runMigrations } from './db/migrate'
import { openDb } from './db/open'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { HttpDataDragonProvider } from './providers/http-data-dragon'
import { StaticDataService } from './services/static-data-service'

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
  const staticData = new StaticDataService({ db, provider: new HttpDataDragonProvider() })
  registerIpc(createHandlers({ db, staticData }))
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
