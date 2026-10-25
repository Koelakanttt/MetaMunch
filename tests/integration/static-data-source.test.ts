import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadChampionTags, loadRules } from '../../src/main/data/rules-data'
import { runMigrations } from '../../src/main/db/migrate'
import { migrations } from '../../src/main/db/migrations'
import { openDb } from '../../src/main/db/open'
import { createDbSource } from '../../src/main/db/static-data-source'
import { savePatch } from '../../src/main/db/static-data-repo'
import { RecommendationService } from '../../src/main/services/recommendation-service'
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

describe('db static data source', () => {
  it('reads the latest patch and its static data', () => {
    const db = migratedDb()
    const source = createDbSource(db)

    expect(source.latestVersion()).toBeNull()

    savePatch(db, '16.3.1', champions, items, 123)

    expect(source.latestVersion()).toBe('16.3.1')
    expect(source.champions('16.3.1')).toHaveLength(3)
    expect(source.items('16.3.1')).toHaveLength(4)
  })

  it('powers recommendations from the database', () => {
    const db = migratedDb()
    savePatch(db, '16.3.1', champions, items, 123)

    const recommendation = new RecommendationService({
      source: createDbSource(db),
      rules: loadRules(),
      tags: loadChampionTags(),
    })

    const result = recommendation.run({ meId: 'Garen', role: 'TOP', enemyIds: ['Ahri'] })

    expect(result.version).toBe('16.3.1')
    expect(result.me.name).toBe('Garen')
  })
})
