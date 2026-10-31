import { useEffect, useRef, useState } from 'react'
import type { ResearchStatus, ResearchSummary } from '@shared/research'
import { ChampionIcon, ItemIcon } from '../components/Icon'
import { Badge, Button, Card, EmptyState, Label, StatusLine, TextInput } from '../components/ui'

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function number(value: number): string {
  return value.toLocaleString()
}

function eta(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const STATE_LABEL: Record<ResearchStatus['state'], string> = {
  idle: 'idle',
  running: 'running',
  paused: 'paused',
  stopped: 'stopped',
  complete: 'complete',
}

export function ResearchPage() {
  const [status, setStatus] = useState<ResearchStatus | null>(null)
  const [summary, setSummary] = useState<ResearchSummary | null>(null)
  const [target, setTarget] = useState('5000')
  const [dailyCap, setDailyCap] = useState('20000')
  const [emeraldPlus, setEmeraldPlus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const initialized = useRef(false)
  const lastSummary = useRef(0)

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const includeSummary = Date.now() - lastSummary.current > 5000
        const nextStatus = await window.api.invoke('research:status', {})
        const nextSummary = includeSummary
          ? await window.api.invoke('research:summary', {})
          : null
        setStatus(nextStatus)
        if (nextSummary) {
          setSummary(nextSummary)
          lastSummary.current = Date.now()
        }
        if (!initialized.current) {
          setTarget(String(nextStatus.targetMatches))
          setDailyCap(String(nextStatus.dailyRequestCap))
          setEmeraldPlus(nextStatus.emeraldPlus)
          initialized.current = true
        }
      } catch (reason) {
        setError(errorMessage(reason))
      }
    }
    void run()
    const timer = window.setInterval(() => {
      void run()
    }, 1500)
    return () => window.clearInterval(timer)
  }, [])

  async function reload(): Promise<void> {
    const [nextStatus, nextSummary] = await Promise.all([
      window.api.invoke('research:status', {}),
      window.api.invoke('research:summary', {}),
    ])
    setStatus(nextStatus)
    setSummary(nextSummary)
  }

  async function start(): Promise<void> {
    const requested = Number(target)
    const cap = Number(dailyCap)
    if (!Number.isFinite(requested) || !Number.isFinite(cap)) {
      setError('Target and daily cap must be numbers.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const next = await window.api.invoke('research:start', {
        targetMatches: requested,
        dailyRequestCap: cap,
        emeraldPlus,
      })
      setStatus(next)
      setMessage('Research crawl started.')
      await reload()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function action(name: 'pause' | 'resume' | 'stop'): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const next =
        name === 'pause'
          ? await window.api.invoke('research:pause', {})
          : name === 'resume'
            ? await window.api.invoke('research:resume', {})
            : await window.api.invoke('research:stop', {})
      setStatus(next)
      setMessage(`Research ${name}.`)
      await reload()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function saveOptions(): Promise<void> {
    const requested = Number(target)
    const cap = Number(dailyCap)
    if (!Number.isFinite(requested) || !Number.isFinite(cap)) {
      setError('Target and daily cap must be numbers.')
      return
    }
    try {
      setStatus(
        await window.api.invoke('research:setOptions', {
          targetMatches: requested,
          dailyRequestCap: cap,
          emeraldPlus,
        }),
      )
      setMessage('Research options saved.')
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  if (!status) {
    return (
      <Card title="Research sample">
        <StatusLine tone="muted">{error || 'loading…'}</StatusLine>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Research sample</h2>
        <p className="text-sm text-slate-400">
          Ranked Solo matches from Master+, Diamond and optionally Emerald I players. Stored
          locally; no player names or ids are kept.
        </p>
      </div>

      <Card title="Crawl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{STATE_LABEL[status.state]}</Badge>
          <StatusLine tone="muted">
            {`patch ${status.patch ?? 'unknown'} · target ${number(status.targetMatches)} matches`}
          </StatusLine>
        </div>
        {status.lastError ? <StatusLine tone="error">{status.lastError}</StatusLine> : null}
        <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
          <div>{`Matches collected: ${number(status.matches)}`}</div>
          <div>{`Participants stored: ${number(status.participants)}`}</div>
          <div>{`Requests/min: ${number(status.requestsPerMinute)}`}</div>
          <div>{`ETA: ${eta(status.etaSeconds)}`}</div>
          <div>{`Requests today: ${number(status.requestsToday)} / ${number(status.dailyRequestCap)}`}</div>
          <div>{`Seeds exhausted: ${status.seedsExhausted ? 'yes' : 'no'}`}</div>
          <div>{`Snapshot: ${status.snapshot ? `#${status.snapshot.id}` : 'none'}`}</div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-40 flex-col gap-1">
            <Label>Target matches</Label>
            <TextInput
              type="number"
              min={10}
              max={100000}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={busy || status.state === 'running'}
            />
          </label>
          <label className="flex w-44 flex-col gap-1">
            <Label>Daily request cap</Label>
            <TextInput
              type="number"
              min={100}
              max={1000000}
              value={dailyCap}
              onChange={(event) => setDailyCap(event.target.value)}
              disabled={busy || status.state === 'running'}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={emeraldPlus}
              onChange={(event) => setEmeraldPlus(event.target.checked)}
              disabled={busy || status.state === 'running'}
            />
            Emerald+
          </label>
          <Button
            onClick={() => {
              void start()
            }}
            disabled={busy || status.state === 'running'}
          >
            {status.state === 'paused' || status.state === 'stopped' ? 'Restart crawl' : 'Start crawl'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void action('pause')
            }}
            disabled={busy || status.state !== 'running'}
          >
            Pause
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void action('resume')
            }}
            disabled={busy || status.state !== 'paused'}
          >
            Resume
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void action('stop')
            }}
            disabled={busy || (status.state !== 'running' && status.state !== 'paused')}
          >
            Stop
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void saveOptions()
            }}
            disabled={busy || status.state === 'running'}
          >
            Save options
          </Button>
        </div>
        {message ? <StatusLine tone="success">{message}</StatusLine> : null}
        {error ? <StatusLine tone="error">error: {error}</StatusLine> : null}
        <StatusLine tone="muted">
          Riot calls share the app-wide limiter (max 2); a key with production limits makes the
          target reachable much faster. The circuit breaker pauses the crawl on network failures.
        </StatusLine>
      </Card>

      <Card title={`Coverage (patch ${status.patch ?? 'unknown'})`}>
        {status.coverage.length === 0 ? (
          <EmptyState>No data yet. Start the crawl to fill champion-role coverage.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Champion</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Games</th>
                  <th className="py-2 pr-3 font-medium">Pick rate</th>
                  <th className="py-2 font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {status.coverage.map((row) => (
                  <tr key={`${row.championId}-${row.role}`} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <ChampionIcon championId={row.championId} name={row.name} size={24} />
                        {row.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{row.role}</td>
                    <td className="py-2 pr-3 text-slate-300">{number(row.games)}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {percent(row.pickRate)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(row.roleGames)} role games`}</span>
                    </td>
                    <td className="py-2 text-slate-300">
                      {percent(row.games === 0 ? 0 : row.wins / row.games)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(row.games)} games`}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {summary && summary.champions.length > 0 ? (
        <Card title="Champions in sample">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Champion</th>
                  <th className="py-2 pr-3 font-medium">Games</th>
                  <th className="py-2 pr-3 font-medium">Win rate</th>
                  <th className="py-2 pr-3 font-medium">Pick rate</th>
                  <th className="py-2 font-medium">Ban rate</th>
                </tr>
              </thead>
              <tbody>
                {summary.champions.map((entry) => (
                  <tr key={entry.championId} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <ChampionIcon championId={entry.championId} name={entry.name} size={26} />
                        {entry.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{number(entry.games)}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {percent(entry.winRate)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(entry.games)} games`}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">
                      {percent(entry.pickRate)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(summary.status.participants)} games`}</span>
                    </td>
                    <td className="py-2 text-slate-300">
                      {percent(entry.banRate)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(summary.status.matches)} matches`}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {summary && summary.items.length > 0 ? (
        <Card title="Items in sample">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Games with item</th>
                  <th className="py-2 pr-3 font-medium">Inclusion</th>
                  <th className="py-2 font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((entry) => (
                  <tr key={entry.itemId} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <ItemIcon itemId={entry.itemId} name={entry.name} size={26} />
                        {entry.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{number(entry.purchases)}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {percent(entry.inclusionRate)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(summary.status.participants)} games`}</span>
                    </td>
                    <td className="py-2 text-slate-300">
                      {percent(entry.winRate)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(entry.purchases)} games`}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  )
}
