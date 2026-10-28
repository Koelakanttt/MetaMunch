import { describe, expect, it } from 'vitest'
import { DEFAULT_REGION, REGIONS, isRegionPlatform, regionInfo } from '../../src/shared/region'

const EXPECTED_CLUSTERS: Record<string, string> = {
  EUW1: 'europe',
  EUN1: 'europe',
  TR1: 'europe',
  RU: 'europe',
  NA1: 'americas',
  BR1: 'americas',
  LA1: 'americas',
  LA2: 'americas',
  KR: 'asia',
  JP1: 'asia',
  OC1: 'sea',
  PH2: 'sea',
  SG2: 'sea',
  TH2: 'sea',
  VN2: 'sea',
  TW2: 'sea',
}

describe('regions', () => {
  it('maps every platform to the correct Riot cluster', () => {
    for (const region of REGIONS) {
      expect(region.cluster).toBe(EXPECTED_CLUSTERS[region.platform])
    }
    expect(REGIONS).toHaveLength(Object.keys(EXPECTED_CLUSTERS).length)
  })

  it('knows the region platforms and the default', () => {
    expect(DEFAULT_REGION).toBe('EUW1')
    for (const region of REGIONS) expect(isRegionPlatform(region.platform)).toBe(true)
    expect(isRegionPlatform('MARS')).toBe(false)
  })

  it('falls back to EU West for unknown platforms', () => {
    expect(regionInfo('MARS')).toEqual(regionInfo('EUW1'))
    expect(regionInfo('EUW1').label).toBe('EU West')
  })
})
