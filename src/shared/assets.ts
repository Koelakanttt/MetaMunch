/** Local custom-protocol URLs. The main process fetches and caches the actual images. */
export function championIconUrl(championId: string): string {
  return `mm-asset://champion/${encodeURIComponent(championId)}`
}

export function itemIconUrl(itemId: number): string {
  return `mm-asset://item/${itemId}`
}

/** Data Dragon rune icon path, e.g. "perk-images/Styles/...". */
export function runeIconUrl(iconPath: string): string {
  return `mm-asset://rune/${encodeURIComponent(iconPath)}`
}
