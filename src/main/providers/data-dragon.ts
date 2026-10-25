import type { Champion, Item, ParseResult } from '@shared/ddragon'

export interface DataDragonProvider {
  /** Latest Data Dragon version for the configured region, e.g. "16.3.1". */
  getLatestVersion(): Promise<string>
  getChampions(version: string): Promise<ParseResult<Champion>>
  getItems(version: string): Promise<ParseResult<Item>>
}
