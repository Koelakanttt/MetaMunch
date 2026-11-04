import { useEffect, useRef, useState } from 'react'
import type { ChampionListResponse } from '@shared/recommend-api'
import type {
  ResearchAudit,
  ResearchFilters,
  ResearchStatus,
  ResearchSummary,
  ResearchTierFilter,
  ResearchTimelineMode,
} from '@shared/research'
import {
  DEFAULT_RESEARCH_FILTERS,
  DEFAULT_RESEARCH_TIMELINE_MODE,
  RESEARCH_TIER_FILTERS,
  RESEARCH_TIMELINE_MODE_LABELS,
  RESEARCH_TIMELINE_MODES,
  researchScopeLine,
  roleScopeLabel,
  shortTierScopeLabel,
  tierScopeLabel,
} from '@shared/research'
import { ROLES } from '@shared/rules'
import { wilsonInterval } from '@shared/research-stats'
import { ChampionIcon, ItemIcon } from '../components/Icon'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  PageLayout,
  Select,
  StatusLine,
  TextInput,
} from '../components/ui'

const TIER_LABEL: Record<ResearchTierFilter, string> = {
  diamond: 'Diamond+',
  master: 'Master+ only',
  emerald: 'Diamond+ & Emerald',
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function winRate(wins: number, games: number): string {
  if (games <= 0) return '—'
  const rate = wins / games
  const interval = wilsonInterval(wins, games)
  return `${percent(rate)} ±${Math.round(((interval.high - interval.low) / 2) * 100)}`
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

export function ResearchPage({ labsEnabled = false }: { labsEnabled?: boolean }) {
  const [status, setStatus] = useState<ResearchStatus | null>(null)
  const [summary, setSummary] = useState<ResearchSummary | null>(null)
  const [target, setTarget] = useState('5000')
  const [dailyCap, setDailyCap] = useState('20000')
  const [emeraldPlus, setEmeraldPlus] = useState(false)
  const [champions, setChampions] = useState<ChampionListResponse | null>(null)
  const [focusChampionId, setFocusChampionId] = useState('')
  const [focusRole, setFocusRole] = useState('TOP')
  const [focusTarget, setFocusTarget] = useState('500')
  const [auditChampionId, setAuditChampionId] = useState('')
  const [auditRole, setAuditRole] = useState('TOP')
  const [audit, setAudit] = useState<ResearchAudit | null>(null)
  const [auditError, setAuditError] = useState('')
  const [filters, setFilters] = useState<ResearchFilters>(DEFAULT_RESEARCH_FILTERS)
  const [timelineMode, setTimelineMode] = useState<ResearchTimelineMode>(
    DEFAULT_RESEARCH_TIMELINE_MODE,
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const initialized = useRef(false)
  const lastSummary = useRef(0)

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const includeSummary = Date.now() - lastSummary.current > 5000
        const nextStatus = await window.api.invoke('research:status', { filters })
        const nextSummary = includeSummary
          ? await window.api.invoke('research:summary', { filters })
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
          setFocusChampionId(nextStatus.focusChampionId ?? '')
          setFocusRole(nextStatus.focusRole ?? 'TOP')
          setFocusTarget(String(nextStatus.focusTarget))
          setAuditChampionId(nextStatus.focusChampionId ?? '')
          setAuditRole(nextStatus.focusRole ?? 'TOP')
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
  }, [filters])

  useEffect(() => {
    lastSummary.current = 0
  }, [filters])

  useEffect(() => {
    window.api
      .invoke('settings:get', {})
      .then((prefs) => {
        setFilters(prefs.researchFilters)
        setTimelineMode(prefs.researchTimelineMode)
      })
      .catch(() => undefined)
  }, [])

  function updateFilters(next: ResearchFilters): void {
    setFilters(next)
    void window.api.invoke('settings:setResearchFilters', next).catch(() => undefined)
  }

  function updateTimelineMode(next: ResearchTimelineMode): void {
    setTimelineMode(next)
    void window.api
      .invoke('settings:setResearchTimelineMode', { mode: next })
      .catch(() => undefined)
  }

  useEffect(() => {
    window.api
      .invoke('champions:list', {})
      .then(setChampions)
      .catch(() => setChampions({ version: null, champions: [] }))
  }, [])

  useEffect(() => {
    if (!auditChampionId) return
    let cancelled = false
    window.api
      .invoke('research:audit', { championId: auditChampionId, role: auditRole, filters })
      .then((value) => {
        if (!cancelled) {
          setAuditError('')
          setAudit(value)
        }
      })
      .catch((reason) => {
        if (!cancelled) setAuditError(errorMessage(reason))
      })
    return () => {
      cancelled = true
    }
  }, [auditChampionId, auditRole, status?.matches, status?.patch, filters])

  async function reload(): Promise<void> {
    const [nextStatus, nextSummary] = await Promise.all([
      window.api.invoke('research:status', { filters }),
      window.api.invoke('research:summary', { filters }),
    ])
    setStatus(nextStatus)
    setSummary(nextSummary)
  }

  async function start(): Promise<void> {
    const requested = Number(target)
    const cap = Number(dailyCap)
    const focusedTarget = Number(focusTarget)
    if (!Number.isFinite(requested) || !Number.isFinite(cap)) {
      setError('Target and daily cap must be numbers.')
      return
    }
    if (focusChampionId && (!Number.isFinite(focusedTarget) || focusedTarget < 1)) {
      setError('Focus target must be a positive number.')
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
        focusChampionId: focusChampionId || null,
        focusRole: focusChampionId ? focusRole : null,
        focusTarget: focusedTarget || 500,
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
    const focusedTarget = Number(focusTarget)
    if (!Number.isFinite(requested) || !Number.isFinite(cap)) {
      setError('Target and daily cap must be numbers.')
      return
    }
    if (focusChampionId && (!Number.isFinite(focusedTarget) || focusedTarget < 1)) {
      setError('Focus target must be a positive number.')
      return
    }
    try {
      setStatus(
        await window.api.invoke('research:setOptions', {
          targetMatches: requested,
          dailyRequestCap: cap,
          emeraldPlus,
          focusChampionId: focusChampionId || null,
          focusRole: focusChampionId ? focusRole : null,
          focusTarget: focusedTarget || 500,
        }),
      )
      setMessage('Research options saved.')
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  if (!status) {
    return (
      <PageLayout>
        <Card title="Research sample">
          <StatusLine tone="muted">{error || 'loading…'}</StatusLine>
        </Card>
      </PageLayout>
    )
  }

  const scopeGames = status.coverage.reduce((sum, row) => sum + row.games, 0)

  return (
    <PageLayout width="wide">
      <PageHeader
        title="Research sample"
        subtitle="Ranked Solo matches from Master+, Diamond and optionally Emerald I players. Research rows contain no player names or ids; the temporary crawl frontier only holds puuids until the crawl completes."
        badges={<Badge>{STATE_LABEL[status.state]}</Badge>}
      />

      <StatusLine tone="muted">
        Other players&apos; identifiers are deleted after processing.
      </StatusLine>

      {!status.patch ? (
        <Card title="Static data missing">
          <StatusLine tone="error">
            Data Dragon data is not stored yet, so a crawl cannot start. Open Settings, press
            &quot;Update data&quot;, then start the crawl again.
          </StatusLine>
        </Card>
      ) : null}

      {status.participants > 0 && (status.includedGames ?? 0) === 0 ? (
        <Card title="No rows match the current filters">
          <StatusLine tone="muted">
            {`${number(status.participants)} rows are stored, but ${number(status.excludedInferred ?? 0)} are excluded (inferred roles) and ${number(status.excludedUnknownTier ?? 0)} (unknown tier). Older crawls have no tier or role metadata, so the default Diamond+/Riot-roles scope hides them.`}
          </StatusLine>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                updateFilters({ tier: 'emerald', includeInferred: true, includeUnknownTier: true })
              }
            >
              Show all stored rows
            </Button>
            <Button
              variant="secondary"
              onClick={() => updateFilters(DEFAULT_RESEARCH_FILTERS)}
            >
              Restore default scope
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="Filters">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex w-48 flex-col gap-1">
            <Label>Tier scope</Label>
            <Select
              value={filters.tier}
              onChange={(event) =>
                updateFilters({ ...filters, tier: event.target.value as ResearchTierFilter })
              }
            >
              {RESEARCH_TIER_FILTERS.map((tier) => (
                <option key={tier} value={tier}>
                  {TIER_LABEL[tier]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={filters.includeInferred}
              onChange={(event) =>
                updateFilters({ ...filters, includeInferred: event.target.checked })
              }
            />
            Include inferred roles
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={filters.includeUnknownTier}
              onChange={(event) =>
                updateFilters({ ...filters, includeUnknownTier: event.target.checked })
              }
            />
            Include unknown tier
          </label>
        </div>
        <StatusLine tone="muted">{`${tierScopeLabel(filters)} · ${roleScopeLabel(filters)}`}</StatusLine>
        <StatusLine tone="muted">
          {`${number(status.includedGames ?? 0)} games included · ${number(status.excludedInferred ?? 0)} games excluded (inferred roles) · ${number(status.excludedUnknownTier ?? 0)} games excluded (unknown tier)`}
        </StatusLine>
        <StatusLine tone="muted">
          Every figure below is computed with this filter. Defaults: Diamond+, Riot-assigned
          roles, known tier.
        </StatusLine>
      </Card>

      {!labsEnabled ? (
        <StatusLine tone="muted">
          Research crawl controls are hidden. Enable Labs in Settings to run or modify the crawl.
        </StatusLine>
      ) : null}

      <Card title="Crawl" className={labsEnabled ? undefined : 'hidden'}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{STATE_LABEL[status.state]}</Badge>
          <StatusLine tone="muted">
            {`patch ${status.patch ?? 'unknown'} · target ${number(status.targetMatches)} matches`}
          </StatusLine>
        </div>
        {status.lastError ? <StatusLine tone="error">{status.lastError}</StatusLine> : null}
        {status.focusChampionId ? (
          <StatusLine tone="muted">
            {`Focus: ${champions?.champions.find((champion) => champion.id === status.focusChampionId)?.name ?? status.focusChampionId} ${status.focusRole ?? ''} · ${number(status.focusGames)} / ${number(status.focusTarget)} games`}
          </StatusLine>
        ) : null}
        <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
          <div>{`Matches collected: ${number(status.matches)}`}</div>
          <div>{`Participants stored: ${number(status.participants)}`}</div>
          <div>{`Requests/min: ${number(status.requestsPerMinute)}`}</div>
          <div>{`ETA: ${eta(status.etaSeconds)}`}</div>
          <div>{`Requests today: ${number(status.requestsToday)} / ${number(status.dailyRequestCap)}`}</div>
          <div>{`Seeds exhausted: ${status.seedsExhausted ? 'yes' : 'no'}`}</div>
          <div>{`Static data: ${status.patch ?? 'missing'}`}</div>
          <div>{`Snapshot: ${status.snapshot ? `#${status.snapshot.id} (patch ${status.snapshot.patch})` : 'none'}`}</div>
          <div>{`Timeline rows: ${number(status.timelineEvents)}`}</div>
          <div>{`Stored rows: ${number(status.participants)} · included: ${number(status.includedGames ?? 0)}`}</div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-52 flex-col gap-1">
            <Label>Focus champion (optional)</Label>
            <Select
              value={focusChampionId}
              onChange={(event) => setFocusChampionId(event.target.value)}
              disabled={busy || status.state === 'running'}
            >
              <option value="">All champions</option>
              {(champions?.champions ?? []).map((champion) => (
                <option key={champion.id} value={champion.id}>
                  {champion.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex w-32 flex-col gap-1">
            <Label>Focus role</Label>
            <Select
              value={focusRole}
              onChange={(event) => setFocusRole(event.target.value)}
              disabled={busy || status.state === 'running' || !focusChampionId}
            >
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex w-36 flex-col gap-1">
            <Label>Focus target games</Label>
            <TextInput
              type="number"
              min={1}
              max={10000}
              value={focusTarget}
              onChange={(event) => setFocusTarget(event.target.value)}
              disabled={busy || status.state === 'running' || !focusChampionId}
            />
          </label>
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
          <label className="flex w-52 flex-col gap-1">
            <Label>Timeline collection</Label>
            <Select
              value={timelineMode}
              onChange={(event) =>
                updateTimelineMode(event.target.value as ResearchTimelineMode)
              }
              disabled={busy}
            >
              {RESEARCH_TIMELINE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {RESEARCH_TIMELINE_MODE_LABELS[mode]}
                </option>
              ))}
            </Select>
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
        <StatusLine tone="muted">
          Focus mode prioritizes the selected champion-role and stops at the focus target. Use 500
          focused games so individual item/rune options can reach the 30-game threshold.
        </StatusLine>
        <StatusLine tone="muted">
          Timeline collection adds one request per sampled match (about double the crawl cost). In
          focus mode only matches with the focus champion in its own role get timelines.
        </StatusLine>
        {message ? <StatusLine tone="success">{message}</StatusLine> : null}
        {error ? <StatusLine tone="error">error: {error}</StatusLine> : null}
        <StatusLine tone="muted">
          Riot calls share the app-wide limiter (max 2); a key with production limits makes the
          target reachable much faster. The circuit breaker pauses the crawl on network failures.
        </StatusLine>
      </Card>

      <Card title="Data audit">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Label>Champion</Label>
            <Select
              value={auditChampionId}
              onChange={(event) => setAuditChampionId(event.target.value)}
            >
              <option value="">Select champion</option>
              {(champions?.champions ?? []).map((champion) => (
                <option key={champion.id} value={champion.id}>
                  {champion.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>Role</Label>
            <Select value={auditRole} onChange={(event) => setAuditRole(event.target.value)}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {auditError ? <StatusLine tone="error">error: {auditError}</StatusLine> : null}
        {!audit ? (
          <StatusLine tone="muted">Select a champion and role to inspect the sample.</StatusLine>
        ) : (
          <div className="space-y-2 text-xs text-slate-300">
            <div className="grid gap-1 sm:grid-cols-4">
              <div>{`Rows stored: ${number(audit.games)}`}</div>
              <div>{`Games in figures: ${number(audit.includedGames)}`}</div>
              <div>{`Matches: ${number(audit.matches)}`}</div>
              <div>{`Patch: ${audit.patch ?? 'unknown'}`}</div>
            </div>
            <StatusLine tone="muted">
              {`${audit.tierScope} · ${audit.roleScope} · ${number(audit.excludedInferred)} excluded (inferred roles) · ${number(audit.excludedUnknownTier)} excluded (unknown tier)`}
            </StatusLine>
            <div className="flex flex-wrap gap-1">
              {audit.tiers.map((entry) => (
                <Badge key={entry.tier}>{`${entry.tier} (raw): ${number(entry.games)}`}</Badge>
              ))}
              {audit.roleSources.map((entry) => (
                <Badge key={entry.source}>{`${entry.source} role (raw): ${number(entry.games)}`}</Badge>
              ))}
            </div>
            {audit.includedGames < 300 ? (
              <StatusLine tone="error">
                Small sample: percentages are noisy; run the crawl longer.
              </StatusLine>
            ) : null}
          </div>
        )}
      </Card>

      <Card title={`Coverage · ${shortTierScopeLabel(filters)} (patch ${status.patch ?? 'unknown'})`}>
        <StatusLine tone="muted">
          {researchScopeLine(filters, status.patch, status.includedGames ?? 0)}
        </StatusLine>
        {status.coverage.length === 0 ? (
          <EmptyState>
            {status.matches > 0
              ? `${number(status.matches)} matches are stored, but none match the current filters. Widen the scope above (or use "Show all stored rows").`
              : 'No data yet. Start the crawl to fill champion-role coverage.'}
          </EmptyState>
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
                      {winRate(row.wins, row.games)}
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
        <Card title={`Champions in sample · ${shortTierScopeLabel(filters)}`}>
          <StatusLine tone="muted">
            {researchScopeLine(filters, status.patch, status.includedGames ?? 0)}
          </StatusLine>
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
                      {winRate(entry.wins, entry.games)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(entry.games)} games`}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">
                      {percent(entry.pickRate)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(scopeGames)} games`}</span>
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
        <Card title={`Items in sample · ${shortTierScopeLabel(filters)}`}>
          <StatusLine tone="muted">
            {researchScopeLine(filters, status.patch, status.includedGames ?? 0)}
          </StatusLine>
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
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(scopeGames)} games`}</span>
                    </td>
                    <td className="py-2 text-slate-300">
                      {winRate(entry.wins, entry.purchases)}
                      <span className="ml-1 text-[11px] text-slate-500">{`${number(entry.purchases)} games`}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </PageLayout>
  )
}
