export interface RegionInfo {
  platform: string
  label: string
  /** Regional routing value used by account-v1 and match-v5. */
  cluster: 'europe' | 'americas' | 'asia' | 'sea'
  locale: string
}

export const REGIONS = [
  { platform: 'EUW1', label: 'EU West', cluster: 'europe', locale: 'en_US' },
  { platform: 'EUN1', label: 'EU Nordic & East', cluster: 'europe', locale: 'en_US' },
  { platform: 'NA1', label: 'North America', cluster: 'americas', locale: 'en_US' },
  { platform: 'BR1', label: 'Brazil', cluster: 'americas', locale: 'pt_BR' },
  { platform: 'LA1', label: 'Latin America North', cluster: 'americas', locale: 'es_MX' },
  { platform: 'LA2', label: 'Latin America South', cluster: 'americas', locale: 'es_AR' },
  { platform: 'TR1', label: 'Turkey', cluster: 'europe', locale: 'tr_TR' },
  { platform: 'RU', label: 'Russia', cluster: 'europe', locale: 'ru_RU' },
  { platform: 'KR', label: 'Korea', cluster: 'asia', locale: 'ko_KR' },
  { platform: 'JP1', label: 'Japan', cluster: 'asia', locale: 'ja_JP' },
  { platform: 'OC1', label: 'Oceania', cluster: 'sea', locale: 'en_US' },
  { platform: 'PH2', label: 'Philippines', cluster: 'sea', locale: 'en_US' },
  { platform: 'SG2', label: 'Singapore', cluster: 'sea', locale: 'en_US' },
  { platform: 'TH2', label: 'Thailand', cluster: 'sea', locale: 'en_US' },
  { platform: 'VN2', label: 'Vietnam', cluster: 'sea', locale: 'en_US' },
  { platform: 'TW2', label: 'Taiwan', cluster: 'sea', locale: 'zh_TW' },
] as const satisfies readonly RegionInfo[]

export type RegionPlatform = (typeof REGIONS)[number]['platform']

export const DEFAULT_REGION: RegionPlatform = 'EUW1'

function defaultRegionInfo(): RegionInfo {
  const found = REGIONS.find((region) => region.platform === DEFAULT_REGION)
  if (!found) throw new Error('Default region is missing from the region list')
  return found
}

export function regionInfo(platform: string): RegionInfo {
  return REGIONS.find((region) => region.platform === platform) ?? defaultRegionInfo()
}

export function isRegionPlatform(value: string): value is RegionPlatform {
  return REGIONS.some((region) => region.platform === value)
}
