import type { PatchChangesResponse } from './patch-diff'
import type { ChampionListResponse, RecommendRequest, RecommendResponse } from './recommend-api'

export interface IpcChannels {
  'app:ping': { req: { message: string }; res: { reply: string; at: number } }
  'db:info': { req: Record<string, never>; res: { schemaVersion: number; sqliteVersion: string } }
  'staticData:status': { req: Record<string, never>; res: { version: string | null; champions: number; items: number; fetchedAt: number | null } }
  'staticData:refresh': { req: Record<string, never>; res: { version: string; fromCache: boolean; champions: number; items: number } }
  'account:set': { req: { riotId: string }; res: { gameName: string; tagLine: string } }
  'matches:status': { req: Record<string, never>; res: { account: { gameName: string; tagLine: string } | null; matches: number; lastGameCreation: number | null } }
  'matches:sync': { req: Record<string, never>; res: { requested: number; saved: number; skippedExisting: number; failed: number } }
  'champions:list': { req: Record<string, never>; res: ChampionListResponse }
  'recommend:run': { req: RecommendRequest; res: RecommendResponse }
  'patch:changes': { req: Record<string, never>; res: PatchChangesResponse }
}
export type IpcChannel = keyof IpcChannels
export type IpcReq<C extends IpcChannel> = IpcChannels[C]['req']
export type IpcRes<C extends IpcChannel> = IpcChannels[C]['res']
export type IpcHandlers = {
  [C in IpcChannel]: (req: IpcReq<C>) => Promise<IpcRes<C>> | IpcRes<C>
}
export interface RendererApi {
  invoke<C extends IpcChannel>(channel: C, req: IpcReq<C>): Promise<IpcRes<C>>
}
