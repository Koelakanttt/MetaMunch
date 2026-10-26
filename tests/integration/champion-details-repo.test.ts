import { describe, expect, it } from 'vitest'
import { getDetailJson, saveDetailJson } from '../../src/main/db/champion-details-repo'
import { memoryDb } from '../helpers/db'

describe('champion details repo', () => {
  it('returns null for a missing entry', () => {
    const db = memoryDb()

    expect(getDetailJson(db, '16.21.1', 'Camille')).toBeNull()
  })

  it('saves, replaces and reads details per patch', () => {
    const db = memoryDb()

    saveDetailJson(db, '16.21.1', 'Camille', '{"hp":650}')
    expect(getDetailJson(db, '16.21.1', 'Camille')).toBe('{"hp":650}')

    saveDetailJson(db, '16.21.1', 'Camille', '{"hp":700}')
    expect(getDetailJson(db, '16.21.1', 'Camille')).toBe('{"hp":700}')

    saveDetailJson(db, '16.20.1', 'Camille', '{"hp":600}')
    expect(getDetailJson(db, '16.21.1', 'Camille')).toBe('{"hp":700}')
    expect(getDetailJson(db, '16.20.1', 'Camille')).toBe('{"hp":600}')
  })
})
