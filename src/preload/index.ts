import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcReq, IpcRes, RendererApi } from '@shared/ipc'

const api: RendererApi = {
  invoke<C extends IpcChannel>(channel: C, req: IpcReq<C>): Promise<IpcRes<C>> {
    return ipcRenderer.invoke(channel, req) as Promise<IpcRes<C>>
  },
  onStaticDataUpdated(callback: () => void): () => void {
    const listener = (): void => callback()
    ipcRenderer.on('staticData:updated', listener)
    return () => {
      ipcRenderer.removeListener('staticData:updated', listener)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
