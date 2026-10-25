export interface IpcChannels {
  'app:ping': { req: { message: string }; res: { reply: string; at: number } }
  'db:info': { req: Record<string, never>; res: { schemaVersion: number; sqliteVersion: string } }
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
