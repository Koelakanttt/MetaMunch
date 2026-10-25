import { ipcMain } from 'electron'
import type { IpcChannel, IpcHandlers, IpcReq } from '@shared/ipc'

function register<C extends IpcChannel>(channel: C, handlers: IpcHandlers): void {
  ipcMain.handle(channel, (_event, req: IpcReq<C>) => handlers[channel](req))
}

export function registerIpc(handlers: IpcHandlers): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    register(channel, handlers)
  }
}
