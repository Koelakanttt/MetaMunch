import { describe, expect, it } from 'vitest'
import { HttpDataDragonProvider } from '../../src/main/providers/http-data-dragon'
import { diffChampion, previousPatchVersion } from '../../src/shared/patch-diff'

describe.skipIf(!process.env['LIVE'])('Data Dragon patch live', () => {
  it(
    'finds the previous patch and parses champion details',
    async () => {
      const provider = new HttpDataDragonProvider()

      const versions = await provider.getVersions()
      expect(versions.length).toBeGreaterThan(50)

      const newest = versions[0]
      if (!newest) throw new Error('No Data Dragon versions returned')

      const previous = previousPatchVersion(versions, newest)
      expect(previous).not.toBeNull()
      if (!previous) return

      const before = await provider.getChampionDetail(previous, 'Camille')
      const after = await provider.getChampionDetail(newest, 'Camille')

      expect(before.id).toBe('Camille')
      expect(after.id).toBe('Camille')
      expect(() => diffChampion(before, after)).not.toThrow()
    },
    60000,
  )
})
