import { useEffect, useRef, useState } from 'react'
import type { MatchHistoryFilters, MatchHistoryResponse } from '@shared/history'
import type { ChampionSummary } from '@shared/recommend-api'
import { ROLES, type Role } from '@shared/rules'
import { ChampionIcon, ItemIcon } from '../components/Icon'
import { Card, EmptyState, Label, Select, StatusLine } from '../components/ui'

const QUEUES: { value: number; label: string }[] = [
  { value: 400, label: 'Normal' },
  { value: 420, label: 'Ranked Solo' },
  { value: 440, label: 'Ranked Flex' },
]

const QUEUE_NAMES: Record<number, string> = {
  400: 'Normal',
  420: 'Ranked Solo',
  440: 'Ranked Flex',
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function MatchHistoryPage({
  refreshKey,
  onSelectChampion,
}: {
  refreshKey: number
  onSelectChampion: (championId: string, role?: Role) => void
}) {
  const [champions, setChampions] = useState<ChampionSummary[]>([])
  const [history, setHistory] = useState<MatchHistoryResponse | null>(null)
  const [championId, setChampionId] = useState('')
  const [position, setPosition] = useState('')
  const [patch, setPatch] = useState('')
  const [queue, setQueue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestIdRef = useRef(0)

  useEffect(() => {
    window.api
      .invoke('champions:list', {})
      .then((list) => setChampions(list.champions))
      .catch(() => setChampions([]))
  }, [refreshKey])

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const run = async () => {
      setLoading(true)
      setError('')
      const request: MatchHistoryFilters = {}
      if (championId) request.championId = championId
      if (position) request.position = position
      if (patch) request.patch = patch
      if (queue) request.queue = Number(queue)

      try {
        const response = await window.api.invoke('matches:history', request)
        if (requestIdRef.current !== requestId) return
        setHistory(response)
        setLoading(false)
      } catch (reason) {
        if (requestIdRef.current !== requestId) return
        setHistory(null)
        setError(errorMessage(reason))
        setLoading(false)
      }
    }

    void run()
  }, [refreshKey, championId, position, patch, queue])

  if (error) {
    return (
      <Card title="Matches">
        <StatusLine tone="error">error: {error}</StatusLine>
      </Card>
    )
  }

  if (!history) {
    return (
      <Card title="Matches">
        <StatusLine tone="muted">loading…</StatusLine>
      </Card>
    )
  }

  if (!history.account) {
    return (
      <Card title="Matches">
        <EmptyState>No account set. Connect a Riot ID in Settings.</EmptyState>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <Card title="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <Label>Champion</Label>
            <Select
              value={championId}
              onChange={(event) => setChampionId(event.target.value)}
              disabled={champions.length === 0}
            >
              <option value="">All champions</option>
              {champions.map((champion) => (
                <option key={champion.id} value={champion.id}>
                  {champion.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <Label>Role</Label>
            <Select value={position} onChange={(event) => setPosition(event.target.value)}>
              <option value="">All roles</option>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </label>

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
              {history.patches.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {!history.hasStaticData ? (
          <StatusLine tone="muted">
            Static data is missing: champion and item names are shown as ids. Press
            &quot;Update data&quot; in Settings.
          </StatusLine>
        ) : null}
      </Card>

      <Card title="Recent matches">
        {loading ? (
          <StatusLine tone="muted">loading…</StatusLine>
        ) : history.entries.length === 0 ? (
          <EmptyState>No matches for these filters.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Champion</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 pr-3 font-medium">Queue</th>
                  <th className="py-2 pr-3 font-medium">Patch</th>
                  <th className="py-2 pr-3 font-medium">Duration</th>
                  <th className="py-2 font-medium">Items</th>
                </tr>
              </thead>
              <tbody>
                {history.entries.map((entry) => (
                  <tr key={entry.matchId} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3 text-slate-400">
                      {new Date(entry.gameCreation).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left text-indigo-400 hover:underline"
                        title="Use in recommendations"
                        onClick={() =>
                          onSelectChampion(
                            entry.championId,
                            ROLES.includes(entry.position as Role)
                              ? (entry.position as Role)
                              : undefined,
                          )
                        }
                      >
                        <ChampionIcon
                          championId={entry.championId}
                          name={entry.championName}
                          size={28}
                        />
                        {entry.championName}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{entry.position || '—'}</td>
                    <td
                      className={
                        entry.win ? 'py-2 pr-3 text-emerald-400' : 'py-2 pr-3 text-rose-400'
                      }
                    >
                      {entry.win ? 'Win' : 'Loss'}
                    </td>
                    <td className="py-2 pr-3 text-slate-300">
                      {QUEUE_NAMES[entry.queueId] ?? entry.queueId}
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{entry.patch}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {formatDuration(entry.durationSec)}
                    </td>
                    <td className="py-2 text-slate-400">
                      {entry.items.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {entry.items.map((item) => (
                            <ItemIcon
                              key={`${entry.matchId}-${item.id}`}
                              itemId={item.id}
                              name={item.name}
                              size={24}
                            />
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}
