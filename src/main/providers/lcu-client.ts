import { existsSync, readFileSync } from 'node:fs'
import { request } from 'node:https'
import { join } from 'node:path'

export interface LcuLockfile {
  port: number
  password: string
  protocol: string
}

export interface LcuConnection {
  phase(): Promise<string>
  session(): Promise<unknown>
}

/** Parses the League client lockfile: name:pid:port:password:protocol. */
export function parseLockfile(text: string): LcuLockfile | null {
  const parts = text.trim().split(':')
  if (parts.length < 5) return null
  const port = Number(parts[2])
  const password = parts[3]
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  if (!password) return null
  return { port, password, protocol: parts[4] ?? 'https' }
}

/** Looks for League of Legends/lockfile in the configured folder and common install roots. */
export function findLockfile(configured: string | null): string | null {
  if (configured) {
    const direct = configured.toLowerCase().endsWith('lockfile')
      ? configured
      : join(configured, 'lockfile')
    if (existsSync(direct)) return direct
  }

  const roots = new Set<string>()
  const systemDrive = process.env['SystemDrive'] ?? 'C:'
  roots.add(`${systemDrive}\\`)
  for (const letter of ['C', 'D', 'E', 'F']) roots.add(`${letter}:\\`)
  const programFiles = process.env['ProgramFiles']
  if (programFiles) roots.add(programFiles)
  const programFilesX86 = process.env['ProgramFiles(x86)']
  if (programFilesX86) roots.add(programFilesX86)

  for (const root of roots) {
    for (const container of [
      'Riot Games',
      'Program Files\\Riot Games',
      'Program Files (x86)\\Riot Games',
    ]) {
      const candidate = join(root, container, 'League of Legends', 'lockfile')
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

class LcuClient implements LcuConnection {
  private readonly port: number
  private readonly password: string

  constructor(lockfile: LcuLockfile) {
    this.port = lockfile.port
    this.password = lockfile.password
  }

  async phase(): Promise<string> {
    const value = await this.getJson('/lol-gameflow/v1/gameflow-phase')
    if (typeof value !== 'string') throw new Error('Unexpected League client phase response')
    return value
  }

  session(): Promise<unknown> {
    return this.getJson('/lol-champ-select/v1/session')
  }

  private getJson(path: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`riot:${this.password}`, 'utf8').toString('base64')
      const req = request(
        {
          host: '127.0.0.1',
          port: this.port,
          path,
          method: 'GET',
          rejectUnauthorized: false,
          headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
          timeout: 3000,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const status = res.statusCode ?? 0
            if (status < 200 || status >= 300) {
              reject(new Error(`League client HTTP ${status}`))
              return
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch {
              reject(new Error('League client returned invalid JSON'))
            }
          })
        },
      )
      req.on('timeout', () => req.destroy(new Error('League client request timed out')))
      req.on('error', (error) => reject(error))
      req.end()
    })
  }
}

export function createLcuConnection(lockfilePath: string): LcuConnection {
  const lockfile = parseLockfile(readFileSync(lockfilePath, 'utf8'))
  if (!lockfile) throw new Error('Invalid League client lockfile')
  return new LcuClient(lockfile)
}
