import type { ChampionSelectStatus } from './champion-select'
import type { GeneralStatsFilters, GeneralStatsResponse } from './general-stats'
import type { MatchHistoryFilters, MatchHistoryResponse } from './history'
import type { LiveGameStatus } from './live-game'
import type { MatchupsResponse } from './matchups'
import type { PatchChangesResponse } from './patch-diff'
import type { PostGameResult } from './post-game'
import type { RunesResponse } from './runes'
import type { SynergiesResponse } from './synergies'
import type { PurchaseOrderResponse, TimelineBackfillResult } from './timeline'
import type { PoolResponse } from './pool'
import type { ChampionListResponse, RecommendRequest, RecommendResponse } from './recommend-api'
import type { RegionPlatform } from './region'
import type { ThemeId } from './theme'

export interface IpcChannels {
  'app:ping': { req: { message: string }; res: { reply: string; at: number } }
  'db:info': { req: Record<string, never>; res: { schemaVersion: number; sqliteVersion: string; appVersion: string } }
  'staticData:status': { req: Record<string, never>; res: { version: string | null; champions: number; items: number; fetchedAt: number | null } }
  'staticData:refresh': { req: Record<string, never>; res: { version: string; fromCache: boolean; champions: number; items: number } }
  'settings:get': { req: Record<string, never>; res: { hasRiotKey: boolean; keySource: 'stored' | 'env' | null; region: RegionPlatform; leaguePath: string | null; externalStatsEnabled: boolean; theme: ThemeId } }
  'settings:setRiotKey': { req: { key: string }; res: { ok: boolean } }
  'settings:setRegion': { req: { region: string }; res: { ok: boolean } }
  'settings:setLeaguePath': { req: { path: string }; res: { ok: boolean } }
  'settings:setExternalStats': { req: { enabled: boolean }; res: { ok: boolean } }
  'settings:setTheme': { req: { theme: string }; res: { ok: boolean } }
  'account:set': { req: { riotId: string }; res: { gameName: string; tagLine: string } }
  'matches:status': { req: Record<string, never>; res: { account: { gameName: string; tagLine: string } | null; matches: number; lastGameCreation: number | null } }
  'matches:sync': { req: Record<string, never>; res: { requested: number; saved: number; skippedExisting: number; failed: number } }
  'matches:history': { req: MatchHistoryFilters; res: MatchHistoryResponse }
  'champions:list': { req: Record<string, never>; res: ChampionListResponse }
  'recommend:run': { req: RecommendRequest; res: RecommendResponse }
  'patch:changes': { req: Record<string, never>; res: PatchChangesResponse }
  'pool:list': { req: Record<string, never>; res: PoolResponse }
  'stats:general': { req: GeneralStatsFilters; res: GeneralStatsResponse }
  'champSelect:status': { req: Record<string, never>; res: ChampionSelectStatus }
  'timeline:purchaseOrder': { req: { championId: string }; res: PurchaseOrderResponse }
  'matches:backfillTimelines': { req: Record<string, never>; res: TimelineBackfillResult }
  'live:status': { req: Record<string, never>; res: LiveGameStatus }
  'review:last': { req: Record<string, never>; res: PostGameResult }
  'matchups:list': { req: { championId: string }; res: MatchupsResponse }
  'synergies:list': { req: { championId: string }; res: SynergiesResponse }
  'runes:popular': { req: { championId: string }; res: RunesResponse }
}
export type IpcChannel = keyof IpcChannels
export type IpcReq<C extends IpcChannel> = IpcChannels[C]['req']
export type IpcRes<C extends IpcChannel> = IpcChannels[C]['res']
export type IpcHandlers = {
  [C in IpcChannel]: (req: IpcReq<C>) => Promise<IpcRes<C>> | IpcRes<C>
}
export interface RendererApi {
  invoke<C extends IpcChannel>(channel: C, req: IpcReq<C>): Promise<IpcRes<C>>
  /** Fires after the main process refreshed static data on startup. Returns an unsubscribe function. */
  onStaticDataUpdated(callback: () => void): () => void
}
