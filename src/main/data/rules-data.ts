import { parseChampionTags, parseRules, type ChampionTags, type Rules } from '@shared/rules'
import championTagsRaw from '../../../data/champion-tags.json?raw'
import rulesRaw from '../../../data/rules.json?raw'

/** Rules and champion tags are bundled into the app at build time. */
export function loadRules(): Rules {
  return parseRules(JSON.parse(rulesRaw))
}

export function loadChampionTags(): ChampionTags {
  return parseChampionTags(JSON.parse(championTagsRaw))
}
