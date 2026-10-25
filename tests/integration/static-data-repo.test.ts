import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import {
  getLatestPatch,
  hasPatch,
  listChampions,
  listItems,
  savePatch,
} from '../../src/main/db/static-data-repo'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values
const items = parseItemList(fixture('item.json')).values

function migratedDb() {
  const db = openDb(':memory:')
  runMigrations(db, migrations)
  return db
}

describe('static data repo', () => {
  it('saves and reads a patch', () => {
    const db = migratedDb()

    savePatch(db, '16.3.1', champions, items, 123)

    expect(hasPatch(db, '16.3.1')).toBe(true)
    expect(hasPatch(db, '15.1.1')).toBe(false)
    expect(getLatestPatch(db)).toEqual({
      version: '16.3.1',
      fetchedAt: 123,
      champions: 3,
      items: 4,
    })
    expect(listChampions(db, '16.3.1')).toEqual(champions)
    expect(listItems(db, '16.3.1')).toEqual(items)
  })

  it('throws when the same patch is saved twice', () => {
    const db = migratedDb()
    savePatch(db, '16.3.1', champions, items, 123)

    expect(() => savePatch(db, '16.3.1', champions, items, 124)).toThrow()
  })

  it('rolls back a failing save', () => {
    const db = migratedDb()
    const duplicate = champions.slice(0, 1)

    expect(() => savePatch(db, '9.9.9', [...duplicate, ...duplicate], [], 1)).toThrow()
    expect(hasPatch(db, '9.9.9')).toBe(false)
    const row = db.prepare('SELECT count(*) AS c FROM patches').get() as { c?: unknown } | undefined
    expect(Number(row?.c)).toBe(0)
  })
})
