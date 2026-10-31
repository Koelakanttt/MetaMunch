import { setDefaultResultOrder } from 'node:dns'
import { net } from 'electron'

// Prefer IPv4 when a machine has a broken IPv6 route; browsers usually hide this,
// while Node/Chromium fetches can otherwise time out or reset.
setDefaultResultOrder('ipv4first')

const TIMEOUT_MS = 15000

function describe(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : null
  const message =
    cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error)
  return `${code ? `${code}: ` : ''}${message}`
}

/** Data Dragon has no Riot rate limit; Node first, Chromium as a network fallback. */
export const networkFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (nodeError) {
    try {
      return await net.fetch(input instanceof URL ? input.toString() : input, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (chromiumError) {
      throw new Error(
        `Data Dragon network failed. Node: ${describe(nodeError)}; Chromium: ${describe(chromiumError)}`,
        { cause: chromiumError },
      )
    }
  }
}
