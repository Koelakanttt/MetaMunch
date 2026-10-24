import { ipcMain } from 'electron'
import type { IpcChannel, IpcHandlers, IpcReq } from '@shared/ipc'

export function registerIpc(handlers: IpcHandlers): void {
  const channels = Object.keys(handlers) as IpcChannel[]
  for (const channel of channels) {
    ipcMain.handle(channel, (_event, req: IpcReq<IpcChannel>) => handlers[channel](req))
  }
}
