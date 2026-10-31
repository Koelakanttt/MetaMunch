import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SynergyService } from '../../src/main/services/synergy-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList } from '../../src/shared/ddragon'
import { insertMatch, memoryDb } from '../helpers/db'

const GAREN = 86
const AHRI = 103
const WUKONG = 62

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(fixture('champion.json')).values

function source(version: string | null = '16.3.1'): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => [],
  }
}

function seed() {
  const db = memoryDb()
  for (let i = 1; i <= 5; i += 1) {
    insertMatch(db, {
      id: `EUW1_${i}`,
      queue: 420,
      creation: i,
      participants: [
        { team: 100, champion: GAREN, win: i <= 3 },
        { team: 100, champion: AHRI, win: i <= 3 },
      ],
    })
  }
  for (let i = 6; i <= 10; i += 1) {
    insertMatch(db, {
      id: `EUW1_${i}`,
      queue: 420,
      creation: i,
      participants: [
        { team: 100, champion: GAREN, win: i <= 6 },
        { team: 100, champion: WUKONG, win: i <= 6 },
      ],
    })
  }
  return db
}

describe('SynergyService', () => {
  it('splits teammate records into best and worst', () => {
    const service = new SynergyService({ db: seed(), source: source() })

    const result = service.forChampion('Garen')

    expect(result.championName).toBe('Garen')
    expect(result.best.map((entry) => entry.championId)).toEqual(['Ahri'])
    expect(result.best[0]?.winRate).toBe(0.6)
    expect(result.worst.map((entry) => entry.championId)).toEqual(['MonkeyKing'])
    expect(result.worst[0]?.winRate).toBe(0.2)
  })

  it('reports missing static data', () => {
    const service = new SynergyService({ db: memoryDb(), source: source(null) })

    expect(service.forChampion('Garen')).toMatchObject({
      championName: null,
      best: [],
      worst: [],
      hasStaticData: false,
    })
  })
})
