import { describe, expect, it } from 'vitest'
import { handlers } from '../../src/main/ipc/handlers'

describe('ipc handlers', () => {
  it('answers app:ping with pong and a timestamp', async () => {
    const res = await handlers['app:ping']({ message: 'x' })

    expect(res.reply).toBe('pong: x')
    expect(typeof res.at).toBe('number')
  })
})
