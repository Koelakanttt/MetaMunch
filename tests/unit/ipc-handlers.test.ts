import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import { createHandlers } from '../../src/main/ipc/handlers'

const db = openDb(':memory:')
runMigrations(db, migrations)
const handlers = createHandlers({ db })

describe('ipc handlers', () => {
  it('answers app:ping with pong and a timestamp', async () => {
    const res = await handlers['app:ping']({ message: 'x' })

    expect(res.reply).toBe('pong: x')
    expect(typeof res.at).toBe('number')
  })

  it('reports db info', async () => {
    const res = await handlers['db:info']({})

    expect(res.schemaVersion).toBe(1)
    expect(res.sqliteVersion).toMatch(/^3\./)
  })
})
