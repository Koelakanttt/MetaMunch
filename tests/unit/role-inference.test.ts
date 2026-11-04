import { describe, expect, it } from 'vitest'
import { inferRole } from '../../src/shared/role-inference'

describe('inferRole', () => {
  const base = { teamPosition: '', individualPosition: '', summoner1: 0, summoner2: 0 }

  it('prefers a valid team position', () => {
    expect(
      inferRole({ ...base, teamPosition: 'MIDDLE', individualPosition: 'TOP' }),
    ).toEqual({ role: 'MIDDLE', source: 'riot' })
  })

  it('uses individual position when team position is blank', () => {
    expect(
      inferRole({ ...base, individualPosition: 'BOTTOM' }),
    ).toEqual({ role: 'BOTTOM', source: 'inferred' })
  })

  it('uses Smite to infer jungle', () => {
    expect(inferRole({ ...base, summoner2: 11 })).toEqual({
      role: 'JUNGLE',
      source: 'inferred',
    })
  })

  it('ignores UNSELECTED and does not guess', () => {
    expect(
      inferRole({ ...base, teamPosition: 'UNSELECTED', individualPosition: 'UNSELECTED' }),
    ).toEqual({ role: null, source: 'unknown' })
  })
})
