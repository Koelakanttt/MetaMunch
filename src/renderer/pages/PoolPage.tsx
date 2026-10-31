import { useEffect, useState } from 'react'
import type { PoolEntry, PoolResponse } from '@shared/pool'
import { ChampionIcon } from '../components/Icon'
import { Card, EmptyState, StatusLine } from '../components/ui'

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function winRate(entry: PoolEntry): number {
  return Math.round((entry.wins / Math.max(1, entry.games)) * 100)
}

export function PoolPage({
  refreshKey,
  onSelectChampion,
}: {
  refreshKey: number
  onSelectChampion: (championId: string) => void
}) {
  const [data, setData] = useState<PoolResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api
      .invoke('pool:list', {})
      .then((response) => {
        setData(response)
        setError('')
      })
      .catch((reason: unknown) => {
        setData(null)
        setError(errorMessage(reason))
      })
  }, [refreshKey])

  if (error) {
    return (
      <Card title="My pool">
        <StatusLine tone="error">error: {error}</StatusLine>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card title="My pool">
        <StatusLine tone="muted">loading…</StatusLine>
      </Card>
    )
  }

  if (!data.account) {
    return (
      <Card title="My pool">
        <EmptyState>No account set. Connect a Riot ID in Settings.</EmptyState>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <Card title="Account">
        <p className="font-medium">
          {data.account.gameName}#{data.account.tagLine}
        </p>
        {data.overall && data.overall.games > 0 ? (
          <>
            <StatusLine>
              {`${data.overall.games} games, ${data.overall.wins} wins (${Math.round(
                (data.overall.wins / Math.max(1, data.overall.games)) * 100,
              )}%)`}
              {data.overall.lowSample ? ' · low sample' : ''}
            </StatusLine>
            <StatusLine tone="muted">
              Own sample. All Summoner&apos;s Rift queues are counted; ARAM and remakes are ignored.
            </StatusLine>
          </>
        ) : (
          <StatusLine tone="muted">No data yet. Sync matches in Settings.</StatusLine>
        )}
      </Card>

      <Card title="Champion pool">
        {!data.hasStaticData ? (
          <EmptyState>No static data yet. Press &quot;Update data&quot; in Settings.</EmptyState>
        ) : data.entries.length === 0 ? (
          <EmptyState>No data yet. Sync matches in Settings.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Champion</th>
                  <th className="py-2 pr-3 font-medium">Games</th>
                  <th className="py-2 pr-3 font-medium">Wins</th>
                  <th className="py-2 pr-3 font-medium">Win rate</th>
                  <th className="py-2 font-medium">Last game</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.championId} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left text-indigo-400 hover:underline"
                        title="Use in recommendations"
                        onClick={() => onSelectChampion(entry.championId)}
                      >
                        <ChampionIcon
                          championId={entry.championId}
                          name={entry.name}
                          size={28}
                        />
                        {entry.name}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{entry.games}</td>
                    <td className="py-2 pr-3 text-slate-300">{entry.wins}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {winRate(entry)}%
                      {entry.lowSample ? (
                        <span className="ml-1 text-[11px] text-slate-500">low sample</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-slate-400">
                      {new Date(entry.lastGameCreation).toLocaleDateString()}
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
