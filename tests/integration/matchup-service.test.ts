import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MatchupService } from '../../src/main/services/matchup-service'
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
        { team: 200, champion: AHRI, win: i > 3 },
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
        { team: 200, champion: WUKONG, win: i > 6 },
      ],
    })
  }
  return db
}

describe('MatchupService', () => {
  it('splits same-role matchups into strong and weak', () => {
    const service = new MatchupService({ db: seed(), source: source() })

    const result = service.forChampion('Garen')

    expect(result.championName).toBe('Garen')
    expect(result.strong.map((entry) => entry.championId)).toEqual(['Ahri'])
    expect(result.strong[0]?.winRate).toBe(0.6)
    expect(result.weak.map((entry) => entry.championId)).toEqual(['MonkeyKing'])
    expect(result.weak[0]?.winRate).toBe(0.2)
  })

  it('reports missing static data', () => {
    const service = new MatchupService({ db: memoryDb(), source: source(null) })

    expect(service.forChampion('Garen')).toMatchObject({
      championName: null,
      strong: [],
      weak: [],
      hasStaticData: false,
    })
  })
})
