import { request } from 'node:https'

/**
 * Reads the local Live Client Data API. No authentication, only information the player
 * already sees. Resolves null when the client is not in a game or the endpoint is unreachable.
 */
export function readLiveGame(timeoutMs = 2000): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/allgamedata',
        method: 'GET',
        rejectUnauthorized: false,
        headers: { Accept: 'application/json' },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            resolve(null)
            return
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch {
            reject(new Error('Live client returned invalid JSON'))
          }
        })
      },
    )
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
    req.end()
  })
}
