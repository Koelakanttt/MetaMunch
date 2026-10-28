import { describe, expect, it } from 'vitest'
import { parseLockfile } from '../../src/main/providers/lcu-client'

describe('parseLockfile', () => {
  it('parses a real-shaped lockfile', () => {
    expect(parseLockfile('LeagueClient:1234:54321:secret-token:https')).toEqual({
      port: 54321,
      password: 'secret-token',
      protocol: 'https',
    })
  })

  it('rejects malformed lockfiles', () => {
    expect(parseLockfile('')).toBeNull()
    expect(parseLockfile('LeagueClient:1234:54321')).toBeNull()
    expect(parseLockfile('LeagueClient:1234:0:secret:https')).toBeNull()
    expect(parseLockfile('LeagueClient:1234:not-a-port:secret:https')).toBeNull()
    expect(parseLockfile('LeagueClient:1234:54321::https')).toBeNull()
  })
})
