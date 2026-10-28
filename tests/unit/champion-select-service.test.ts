import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LcuConnection } from '../../src/main/providers/lcu-client'
import {
  ChampionSelectService,
  parseChampionSelectSession,
} from '../../src/main/services/champion-select-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values
const items = parseItemList(fixture('item.json')).values

function source(version: string | null): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => items,
  }
}

const SESSION = {
  localPlayerCellId: 1,
  myTeam: [{ cellId: 1, championId: 86, assignedPosition: 'top' }],
  theirTeam: [
    { cellId: 6, championId: 103, assignedPosition: 'middle' },
    { cellId: 7, championId: 0, assignedPosition: 'bottom' },
  ],
}

function makeService(options: {
  lockfile?: string | null
  phase?: string
  session?: unknown
  error?: Error
  version?: string | null
}): ChampionSelectService {
  const connection: LcuConnection = {
    phase: async () => {
      if (options.error) throw options.error
      return options.phase ?? 'ChampSelect'
    },
    session: async () => options.session ?? SESSION,
  }
  return new ChampionSelectService({
    getLeaguePath: () => null,
    source: source(options.version === undefined ? '16.3.1' : options.version),
    findLockfile: () => (options.lockfile === undefined ? 'C:\\fake\\lockfile' : options.lockfile),
    connect: () => connection,
  })
}

describe('ChampionSelectService', () => {
  it('reports a missing League client', async () => {
    const status = await makeService({ lockfile: null }).status()

    expect(status.state).toBe('not-found')
  })

  it('reports an idle client phase', async () => {
    expect(await makeService({ phase: 'Lobby' }).status()).toEqual({
      state: 'idle',
      phase: 'Lobby',
    })
  })

  it('maps the champion select session', async () => {
    const status = await makeService({}).status()

    expect(status).toEqual({
      state: 'champ-select',
      phase: 'ChampSelect',
      me: { championKey: 86, championId: 'Garen', name: 'Garen', position: 'TOP' },
      enemies: [{ championKey: 103, championId: 'Ahri', name: 'Ahri', position: 'MIDDLE' }],
      hiddenEnemies: 1,
    })
  })

  it('keeps numeric ids without static data', async () => {
    const status = await makeService({ version: null }).status()

    expect(status.state).toBe('champ-select')
    if (status.state !== 'champ-select') return
    expect(status.me?.championId).toBeNull()
    expect(status.enemies[0]?.championId).toBeNull()
  })

  it('turns client errors into a readable state', async () => {
    const status = await makeService({ error: new Error('League client HTTP 500') }).status()

    expect(status).toEqual({ state: 'error', message: 'League client HTTP 500' })
  })
})

describe('parseChampionSelectSession', () => {
  it('defaults missing teams', () => {
    expect(parseChampionSelectSession({ localPlayerCellId: 1 })).toEqual({
      localPlayerCellId: 1,
      myTeam: [],
      theirTeam: [],
    })
  })

  it('rejects a malformed session', () => {
    expect(() => parseChampionSelectSession({ nope: true })).toThrow()
  })
})
