import { describe, expect, it } from 'vitest'
import { memoryDb, insertMatch } from '../helpers/db'
import { MatchReviewService } from '../../src/main/services/match-review-service'
import { TimelineSummaryService } from '../../src/main/services/timeline-summary-service'
import type { StaticDataSource } from '../../src/main/services/recommendation-service'

const ME = 'puuid-me'
const source: StaticDataSource = {
  latestVersion: () => null,
  champions: () => [],
  items: () => [],
}

function setup() {
  const db = memoryDb()
  insertMatch(db, {
    id: 'EUW1_1',
    queue: 420,
    creation: 1,
    participants: [
      { team: 100, champion: 86, win: true, puuid: ME, position: 'TOP' },
      { team: 200, champion: 103, win: false, position: 'TOP' },
    ],
  })
  const timeline = new TimelineSummaryService({
    db,
    source,
    provider: () => ({ getAccountByRiotId: async () => ({ puuid: ME, gameName: 'Me', tagLine: '1' }), getMatchIds: async () => [], getMatch: async () => { throw new Error('no') } }),
    getAccount: () => ({ puuid: ME, gameName: 'Me', tagLine: '1' }),
  })
  const service = new MatchReviewService({
    db,
    source,
    timelineSummary: timeline,
    getAccount: () => ({ puuid: ME, gameName: 'Me', tagLine: '1' }),
    now: () => 1000,
  })
  return { db, service }
}

describe('MatchReviewService', () => {
  it('returns a header for the tracked match', () => {
    const { service } = setup()
    expect(service.get('EUW1_1')).toMatchObject({
      match: { matchId: 'EUW1_1', position: 'TOP', win: true },
      review: null,
    })
  })

  it('normalizes and upserts a review', () => {
    const { service } = setup()
    const saved = service.save('EUW1_1', {
      fixText: '  ward river  ',
      checklist: { missed_cs: true },
      tags: [' vision ', 'vision', 'recall'],
    })
    expect(saved).toMatchObject({
      fixText: 'ward river',
      checklist: { missed_cs: true, died_too_much: false },
      tags: ['vision', 'recall'],
    })
    expect(service.get('EUW1_1')?.review?.fixText).toBe('ward river')
  })

  it('rejects matches outside the tracked account', () => {
    const { service } = setup()
    expect(service.get('EUW1_missing')).toBeNull()
    expect(service.save('EUW1_missing', { fixText: '', checklist: {}, tags: [] })).toBeNull()
  })
})
