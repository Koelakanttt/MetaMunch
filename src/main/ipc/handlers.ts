import type { IpcHandlers } from '@shared/ipc'

export const handlers: IpcHandlers = {
  'app:ping': ({ message }) => ({ reply: 'pong: ' + message, at: Date.now() }),
}
