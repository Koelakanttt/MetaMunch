import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Live Client TLS scope', () => {
  it('disables certificate checks only inside the local live-client request', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/main/providers/live-client.ts'),
      'utf8',
    )
    expect(source).toContain("host: '127.0.0.1'")
    expect(source).toContain('port: 2999')
    expect(source.match(/rejectUnauthorized:\s*false/g)).toHaveLength(1)
    expect(source).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED')
  })
})
