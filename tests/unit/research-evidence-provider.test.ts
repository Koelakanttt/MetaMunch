import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ResearchService } from '../../src/main/services/research-service'
import { ResearchEvidenceProvider } from '../../src/main/services/research-evidence-provider'
import type { RiotApiProvider } from '../../src/main/providers/riot-api'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'
import { parseChampionList, parseItemList } from '../../src/shared/ddragon'
import { parseMatch } from '../../src/shared/riot'
import { memoryDb } from '../helpers/db'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

function dragonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8'))
}

const champions = parseChampionList(dragonFixture('champion.json')).values
const items = parseItemList(dragonFixture('item.json')).values

function source(version = '16.21.1'): StaticDataSource {
  return {
    latestVersion: () => version,
    champions: () => champions,
    items: () => items,
  }
}

describe('ResearchEvidenceProvider', () => {
  it('turns a local champion/role sample into smoothed item evidence', async () => {
    const db = memoryDb()
    const base = parseMatch(fixture('match.json'))
    const matches = Array.from({ length: 100 }, (_, index) => ({
      ...base,
      id: `EUW1_${7000000100 + index}`,
    }))
    const byId = new Map(matches.map((match) => [match.id, match]))
    let leagueCalls = 0

    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => matches.map((match) => match.id),
      getMatch: async (matchId) => {
        const match = byId.get(matchId)
        if (!match) throw new Error('missing fixture')
        return match
      },
      getLeagueEntries: async () => {
        leagueCalls += 1
        return leagueCalls === 1
          ? [
              {
                puuid: 'seed',
                tier: 'EMERALD',
                rank: 'I',
                queueType: 'RANKED_SOLO_5x5',
                leaguePoints: 0,
                wins: 0,
                losses: 0,
              },
            ]
          : []
      },
    }

    const research = new ResearchService({
      db,
      provider,
      source: source(),
      getPatch: () => '16.21',
      getRegion: () => 'EUW1',
    })
    const result = await research.collect(100)
    expect(result.saved).toBe(100)

    const ahri = champions.find((champion) => champion.id === 'Ahri')
    if (!ahri) throw new Error('missing Ahri fixture')
    const evidence = new ResearchEvidenceProvider({ db, source: source() }).forChampion(
      ahri,
      'TOP',
      items,
    )

    expect(evidence).not.toBeNull()
    expect(evidence?.scope.championGames).toBe(100)
    const boots = evidence?.items.get(1001)
    expect(boots?.games).toBe(100)
    expect(boots?.wins).toBe(100)
    expect(boots?.confidence).toBe('medium')
  })

  it('returns null when the sample patch is stale', async () => {
    const db = memoryDb()
    const provider: RiotApiProvider = {
      getAccountByRiotId: async () => ({ puuid: 'seed', gameName: 'Seed', tagLine: 'EUW' }),
      getMatchIds: async () => [],
      getMatch: async () => {
        throw new Error('unused')
      },
      getLeagueEntries: async () => [],
    }
    const research = new ResearchService({
      db,
      provider,
      source: source('16.20.1'),
      getPatch: () => '16.20',
      getRegion: () => 'EUW1',
    })
    await research.collect(1)

    const ahri = champions.find((champion) => champion.id === 'Ahri')
    if (!ahri) throw new Error('missing Ahri fixture')
    expect(
      new ResearchEvidenceProvider({ db, source: source('16.21.1') }).forChampion(
        ahri,
        'TOP',
        items,
      ),
    ).toBeNull()
  })
})
