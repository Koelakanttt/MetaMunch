import { promises as dns } from 'node:dns'
import type {
  DnsLookup,
  NetworkCheck,
  NetworkCheckAttempt,
  NetworkDiagnostics,
} from '@shared/diagnostics'
import { regionInfo } from '@shared/region'
import { RiotApiError } from './riot-api'
import { isRiotCircuitOpen, type RiotRequestManager } from './riot-request-manager'

const TIMEOUT_MS = 5000
const RIOT_DIAGNOSTIC_TIMEOUT_MS = 5000
const DDragonUrl = 'https://ddragon.leagueoflegends.com/realms/euw.json'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MetaMunch/0.1.0-alpha Chrome/131.0.0.0 Safari/537.36'

export interface NetworkDiagnosticsOptions {
  fetchFn?: typeof fetch
  riot?: RiotRequestManager
  now?: () => number
}

function shortMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 300 ? `${message.slice(0, 297)}...` : message
}

/** Read-only connectivity checks used by Settings; never logs or returns the API key. */
export class NetworkDiagnosticsProvider {
  private readonly fetchFn: typeof fetch
  private readonly riot: RiotRequestManager | null
  private readonly now: () => number

  constructor(options: NetworkDiagnosticsOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch
    this.riot = options.riot ?? null
    this.now = options.now ?? Date.now
  }

  async run(options: { apiKey: string | null; region: string }): Promise<NetworkDiagnostics> {
    // lol-status-v4 is platform-routed. Regional hosts such as europe.api.riotgames.com
    // do not serve it and can hang, which used to open the Riot circuit breaker.
    const platform = regionInfo(options.region).platform.toLowerCase()
    const riotUrl = `https://${platform}.api.riotgames.com/lol/status/v4/platform-data`
    const checks: NetworkCheck[] = []

    checks.push(await this.directCheck('ddragon', 'Data Dragon', DDragonUrl))
    checks.push(
      await this.riotCheck('riot-public', 'Riot API reachability (no key)', riotUrl, {}, [
        401,
        403,
      ]),
    )
    if (options.apiKey) {
      checks.push(
        await this.riotCheck('riot', 'Riot API', riotUrl, {
          'X-Riot-Token': options.apiKey,
        }),
      )
    } else {
      checks.push({
        id: 'riot',
        label: 'Riot API',
        url: riotUrl,
        state: 'skipped',
        status: null,
        ms: 0,
        transport: null,
        attempts: [],
        message: 'No Riot API key saved.',
      })
    }

    const hosts = [...new Set(checks.map((check) => new URL(check.url).host))]
    const dnsResults = await Promise.all(hosts.map((host) => lookup(host)))
    return { checkedAt: this.now(), checks, dns: dnsResults }
  }

  private async directCheck(
    id: 'ddragon',
    label: string,
    url: string,
  ): Promise<NetworkCheck> {
    const started = this.now()
    try {
      const response = await this.fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const ms = Math.max(0, this.now() - started)
      return {
        id,
        label,
        url,
        state: response.ok ? 'ok' : 'failed',
        status: response.status,
        ms,
        transport: 'node',
        attempts: [{ transport: 'node', ms, status: response.status, error: null }],
        message: `HTTP ${response.status}`,
      }
    } catch (error) {
      const ms = Math.max(0, this.now() - started)
      return {
        id,
        label,
        url,
        state: 'failed',
        status: null,
        ms,
        transport: 'node',
        attempts: [{ transport: 'node', ms, status: null, error: shortMessage(error) }],
        message: shortMessage(error),
      }
    }
  }

  private async riotCheck(
    id: 'riot' | 'riot-public',
    label: string,
    url: string,
    headers: Record<string, string> = {},
    expectedStatuses: readonly number[] = [],
  ): Promise<NetworkCheck> {
    const started = this.now()
    if (!this.riot) {
      return {
        id,
        label,
        url,
        state: 'failed',
        status: null,
        ms: 0,
        transport: null,
        attempts: [],
        message: 'Riot request manager is not configured.',
      }
    }

    try {
      const result = await this.riot.request(
        url,
        {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        },
        {
          timeoutMs: RIOT_DIAGNOSTIC_TIMEOUT_MS,
          maxNetworkRetries: 0,
          maxRateLimitRetries: 0,
        },
      )
      const ms = Math.max(0, this.now() - started)
      const attempts: NetworkCheckAttempt[] = result.attempts.map((attempt) => ({
        transport: attempt.transport,
        ms: attempt.ms,
        status: attempt.status,
        error: attempt.error,
      }))
      const reached =
        result.response.ok || expectedStatuses.includes(result.response.status)
      const message =
        id === 'riot-public' &&
        (result.response.status === 401 || result.response.status === 403)
          ? `Reached API (HTTP ${result.response.status} without a key is expected)`
          : result.response.status === 401 || result.response.status === 403
            ? `HTTP ${result.response.status}: key rejected, expired, or revoked — generate a new development key`
            : `HTTP ${result.response.status}`
      return {
        id,
        label,
        url,
        state: reached ? 'ok' : 'failed',
        status: result.response.status,
        ms,
        transport: result.transport,
        attempts,
        message,
      }
    } catch (error) {
      const attempts: NetworkCheckAttempt[] =
        error instanceof RiotApiError
          ? error.attempts.map((attempt) => ({
              transport: attempt.transport,
              ms: attempt.ms,
              status: attempt.status,
              error: attempt.error,
            }))
          : []
      const message = isRiotCircuitOpen(error)
        ? 'Riot circuit is open; press Retry on the banner to probe the API again.'
        : shortMessage(error)
      return {
        id,
        label,
        url,
        state: 'failed',
        status: null,
        ms: Math.max(0, this.now() - started),
        transport: null,
        attempts,
        message,
      }
    }
  }
}

async function lookup(host: string): Promise<DnsLookup> {
  try {
    const addresses = await dns.lookup(host, { all: true })
    return {
      host,
      ipv4: addresses.filter((entry) => entry.family === 4).map((entry) => entry.address),
      ipv6: addresses.filter((entry) => entry.family === 6).map((entry) => entry.address),
      error: null,
    }
  } catch (error) {
    return { host, ipv4: [], ipv6: [], error: shortMessage(error) }
  }
}
