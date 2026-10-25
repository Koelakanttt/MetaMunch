import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAccount, parseMatch, parseMatchIds, parseRiotId, toPatch } from '../../src/shared/riot'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8'))
}

describe('toPatch', () => {
  it('keeps the first two parts', () => {
    expect(toPatch('16.21.600.1234')).toBe('16.21')
    expect(toPatch('16.21.1')).toBe('16.21')
    expect(toPatch('16.3')).toBe('16.3')
  })
  it('rejects garbage', () => {
    expect(() => toPatch('abc')).toThrow()
    expect(() => toPatch('16')).toThrow()
  })
})

describe('parseRiotId', () => {
  it('splits at the last #, including non-latin names', () => {
    expect(parseRiotId('Бигбули#22222')).toEqual({ gameName: 'Бигбули', tagLine: '22222' })
    expect(parseRiotId('  Name#EUW  ')).toEqual({ gameName: 'Name', tagLine: 'EUW' })
    expect(parseRiotId('A#B#TAG1')).toEqual({ gameName: 'A#B', tagLine: 'TAG1' })
  })
  it('rejects malformed ids', () => {
    for (const bad of ['', 'Name', '#TAG', 'Name#', 'Name#TA G', 'Na/me#TAG']) {
      expect(() => parseRiotId(bad)).toThrow('Name#TAG')
    }
  })
})

describe('parseAccount / parseMatchIds', () => {
  it('parses an account', () => {
    expect(parseAccount(fixture('account.json'))).toEqual({
      puuid: 'puuid-me-0001',
      gameName: 'Бигбули',
      tagLine: '22222',
    })
  })
  it('rejects an account without puuid', () => {
    expect(() => parseAccount({ gameName: 'x', tagLine: 'y' })).toThrow()
  })
  it('parses match ids and rejects malformed ones', () => {
    expect(parseMatchIds(fixture('match-ids.json'))).toHaveLength(3)
    expect(() => parseMatchIds(['nope'])).toThrow()
    expect(() => parseMatchIds({})).toThrow()
  })
})

describe('parseMatch', () => {
  const match = parseMatch(fixture('match.json'))
  it('maps match-level fields', () => {
    expect(match.id).toBe('EUW1_7000000001')
    expect(match.platform).toBe('EUW1')
    expect(match.queueId).toBe(420)
    expect(match.patch).toBe('16.21')
    expect(match.gameVersion).toBe('16.21.600.1234')
    expect(match.durationSec).toBe(1805)
    expect(match.remake).toBe(false)
    expect(match.participants).toHaveLength(10)
  })
  it('maps a participant with runes', () => {
    const me = match.participants.find((p) => p.puuid === 'puuid-me-0001')
    expect(me).toBeDefined()
    expect(me?.teamId).toBe(100)
    expect(me?.position).toBe('MIDDLE')
    expect(me?.items).toHaveLength(6)
    expect(me?.items.slice(0, 3)).toEqual([3091, 3020, 3165])
    expect(me?.trinket).toBe(3340)
    expect(me?.keystone).toBe(8112)
    expect(me?.primaryStyle).toBe(8100)
    expect(me?.subStyle).toBe(8200)
    expect(me?.summoner1).toBe(4)
  })
  it('tolerates missing perks and empty position', () => {
    const last = match.participants[9]
    expect(last?.position).toBe('')
    expect(last?.keystone).toBeNull()
    expect(last?.primaryStyle).toBeNull()
    expect(last?.subStyle).toBeNull()
  })
  it('flags remakes by duration and by the early surrender flag', () => {
    const base = fixture('match.json') as { info: { gameDuration: number; participants: Array<Record<string, unknown>> } }
    const short = structuredClone(base)
    short.info.gameDuration = 200
    expect(parseMatch(short).remake).toBe(true)
    const surrendered = structuredClone(base)
    surrendered.info.participants[0]!['gameEndedInEarlySurrender'] = true
    expect(parseMatch(surrendered).remake).toBe(true)
  })
  it('throws on malformed matches', () => {
    expect(() => parseMatch({})).toThrow()
    expect(() => parseMatch({ metadata: { matchId: 'EUW1_1' }, info: { participants: [] } })).toThrow()
  })
})
