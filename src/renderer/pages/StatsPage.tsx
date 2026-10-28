import { useEffect, useRef, useState } from 'react'
import type { GeneralStatsFilters, GeneralStatsResponse } from '@shared/general-stats'
import { ChampionIcon, ItemIcon } from '../components/Icon'
import { Card, EmptyState, Label, Select, StatusLine } from '../components/ui'

const QUEUES: { value: number; label: string }[] = [
  { value: 400, label: 'Normal' },
  { value: 420, label: 'Ranked Solo' },
  { value: 440, label: 'Ranked Flex' },
]

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function StatsPage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<GeneralStatsResponse | null>(null)
  const [patch, setPatch] = useState('')
  const [queue, setQueue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const run = async () => {
      setLoading(true)
      setError('')
      const filters: GeneralStatsFilters = {}
      if (patch) filters.patch = patch
      if (queue) filters.queue = Number(queue)

      try {
        const response = await window.api.invoke('stats:general', filters)
        if (requestIdRef.current !== requestId) return
        setData(response)
        setLoading(false)
      } catch (reason) {
        if (requestIdRef.current !== requestId) return
        setData(null)
        setError(errorMessage(reason))
        setLoading(false)
      }
    }

    void run()
  }, [refreshKey, patch, queue])

  if (error) {
    return (
      <Card title="Stats">
        <StatusLine tone="error">error: {error}</StatusLine>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card title="Stats">
        <StatusLine tone="muted">loading…</StatusLine>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <Card title="Sample">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Label>Queue</Label>
            <Select value={queue} onChange={(event) => setQueue(event.target.value)}>
              <option value="">All queues</option>
              {QUEUES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <Label>Patch</Label>
            <Select value={patch} onChange={(event) => setPatch(event.target.value)}>
              <option value="">All patches</option>
              {data.patches.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <StatusLine>
          {`${data.sample.matches} matches, ${data.sample.picks} champion picks in the sample`}
        </StatusLine>
        <StatusLine>
          {`Source: ${data.source === 'external' ? 'external statistics' : 'own sample'}`}
        </StatusLine>
        {data.note ? <StatusLine tone="muted">{data.note}</StatusLine> : null}
        <StatusLine tone="muted">
          Computed from your own synced matches (all participants, no player identifiers). External
          statistics sources will be an optional later step.
        </StatusLine>
        {!data.hasStaticData ? (
          <StatusLine tone="muted">
            Static data is missing: names are shown as ids. Press &quot;Update data&quot; in
            Settings.
          </StatusLine>
        ) : null}
      </Card>

      <Card title="Champions">
        {data.sample.picks === 0 ? (
          <EmptyState>No synced matches yet. Sync your matches in Settings.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Champion</th>
                  <th className="py-2 pr-3 font-medium">Picks</th>
                  <th className="py-2 pr-3 font-medium">Pick rate</th>
                  <th className="py-2 pr-3 font-medium">Wins</th>
                  <th className="py-2 font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {data.champions.map((entry) => (
                  <tr key={entry.championId} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <ChampionIcon championId={entry.championId} name={entry.name} size={26} />
                        {entry.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{entry.picks}</td>
                    <td className="py-2 pr-3 text-slate-300">{percent(entry.pickRate)}</td>
                    <td className="py-2 pr-3 text-slate-300">{entry.wins}</td>
                    <td className="py-2 text-slate-300">{percent(entry.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Items">
        {data.items.length === 0 ? (
          <EmptyState>No item purchases in the sample yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Purchases</th>
                  <th className="py-2 pr-3 font-medium">Wins</th>
                  <th className="py-2 font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.itemId} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 text-slate-100">
                        <ItemIcon itemId={entry.itemId} name={entry.name} size={26} />
                        {entry.name}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{entry.purchases}</td>
                    <td className="py-2 pr-3 text-slate-300">{entry.wins}</td>
                    <td className="py-2 text-slate-300">{percent(entry.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {loading ? <StatusLine tone="muted">refreshing…</StatusLine> : null}
    </section>
  )
}
