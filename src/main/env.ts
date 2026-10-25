import { join } from 'node:path'

export function loadEnv(dir: string): void {
  const existing = new Map<string, string>()
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) existing.set(key, value)
  }

  try {
    process.loadEnvFile(join(dir, '.env'))
  } catch {
    return
  }

  for (const [key, value] of existing) {
    process.env[key] = value
  }
}

export function getRiotApiKey(): string | null {
  const value = process.env['RIOT_API_KEY']?.trim()
  return value ? value : null
}
