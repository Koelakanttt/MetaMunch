export type NetworkCheckState = 'ok' | 'failed' | 'skipped'

export interface NetworkCheckAttempt {
  transport: string
  ms: number
  status: number | null
  error: string | null
}

export interface NetworkCheck {
  id: 'ddragon' | 'riot' | 'riot-public'
  label: string
  url: string
  state: NetworkCheckState
  status: number | null
  ms: number
  transport: string | null
  attempts: NetworkCheckAttempt[]
  message: string
}

export interface DnsLookup {
  host: string
  ipv4: string[]
  ipv6: string[]
  error: string | null
}

export interface NetworkDiagnostics {
  checkedAt: number
  checks: NetworkCheck[]
  dns: DnsLookup[]
}
