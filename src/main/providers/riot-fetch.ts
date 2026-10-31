import { Agent, fetch as undiciFetch } from 'undici'

/**
 * Some ISP DPI paths hang on TLS 1.3 ClientHello (including post-quantum Kyber)
 * but complete TLS 1.2 normally. Riot REST requests do not need TLS 1.3.
 */
const tls12Agent = new Agent({
  connect: {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
  },
})

type UndiciFetch = typeof undiciFetch
type UndiciInput = Parameters<UndiciFetch>[0]
type UndiciInit = NonNullable<Parameters<UndiciFetch>[1]>

/** Node transport for Riot API requests: TLS 1.2 only, certificate checks unchanged. */
export const riotFetch: typeof fetch = ((
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) =>
  undiciFetch(input as UndiciInput, {
    ...(init as UndiciInit | undefined),
    dispatcher: tls12Agent,
  } as UndiciInit)) as unknown as typeof fetch
