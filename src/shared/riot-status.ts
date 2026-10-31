export interface RiotCircuitStatus {
  state: 'closed' | 'open' | 'half-open'
  consecutiveNetworkErrors: number
  active: number
  maxConcurrent: number
}
