import { describe, expect, it } from 'vitest'
import { HttpDataDragonProvider } from '../../src/main/providers/http-data-dragon'

describe.skipIf(!process.env['LIVE'])('Data Dragon live', () => {
  it(
    'fetches the current EUW data',
    async () => {
      const provider = new HttpDataDragonProvider()

      const version = await provider.getLatestVersion()
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)

      const champions = await provider.getChampions(version)
      expect(champions.values.length).toBeGreaterThan(150)
      expect(champions.skipped.length).toBeLessThanOrEqual(5)
      expect(champions.values.some((champion) => champion.key === 103)).toBe(true)

      const items = await provider.getItems(version)
      expect(items.values.length).toBeGreaterThan(300)
      expect(items.skipped.length).toBeLessThanOrEqual(20)
    },
    60000,
  )
})
