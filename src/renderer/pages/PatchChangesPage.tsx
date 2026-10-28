import { useState } from 'react'
import type { Change, EntityChanges, PatchChangesResponse } from '@shared/patch-diff'
import { ChampionIcon, ItemIcon } from '../components/Icon'
import { Button, Card, EmptyState, StatusLine } from '../components/ui'

function invokeErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function ChangesList({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <EmptyState>no changes</EmptyState>
  return (
    <ul className="space-y-1 text-xs text-slate-400">
      {changes.map((change, index) => (
        <li key={index}>
          <span className="text-slate-300">{change.label}</span>: {change.before} →{' '}
          {change.after}
        </li>
      ))}
    </ul>
  )
}

function EntityCard({ entity, kind }: { entity: EntityChanges; kind: 'champion' | 'item' }) {
  const itemId = Number(entity.id)
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        {kind === 'champion' ? (
          <ChampionIcon championId={entity.id} name={entity.name} size={28} />
        ) : (
          <ItemIcon itemId={Number.isFinite(itemId) ? itemId : 0} name={entity.name} size={28} />
        )}
        <h3 className="text-sm font-semibold text-slate-100">{entity.name}</h3>
      </div>
      <ChangesList changes={entity.changes} />
    </div>
  )
}

export function PatchChangesPage() {
  const [data, setData] = useState<PatchChangesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const response = await window.api.invoke('patch:changes', {})
      setData(response)
    } catch (reason) {
      setData(null)
      setError(invokeErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-4">
      <Card title="Patch changes">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              void load()
            }}
            disabled={loading}
          >
            {loading ? 'loading…' : 'Load patch changes'}
          </Button>
          <StatusLine tone="muted">
            Compares the previous patch with the latest stored one for your most played champions
            and usual items.
          </StatusLine>
        </div>
        {error ? <StatusLine tone="error">error: {error}</StatusLine> : null}
        {!data ? <EmptyState>No patch comparison loaded yet.</EmptyState> : null}
      </Card>

      {data ? (
        <>
          <Card title="Overview">
            <StatusLine tone="muted">
              {`Patch ${data.from ?? '—'} → ${data.to ?? '—'}`}
            </StatusLine>
            {data.pool.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {data.pool.map((entry) => (
                  <span key={entry.id} className="flex items-center gap-1">
                    <ChampionIcon championId={entry.id} name={entry.name} size={20} />
                    {`${entry.name} (${entry.games})`}
                  </span>
                ))}
              </div>
            ) : (
              <StatusLine tone="muted">Pool: none</StatusLine>
            )}
          </Card>

          <Card title="Champions">
            {data.champions.length === 0 ? (
              <EmptyState>none</EmptyState>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.champions.map((entity) => (
                  <EntityCard key={entity.id} entity={entity} kind="champion" />
                ))}
              </div>
            )}
          </Card>

          <Card title="Items">
            {data.items.length === 0 ? (
              <EmptyState>no changes</EmptyState>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.items.map((entity) => (
                  <EntityCard key={entity.id} entity={entity} kind="item" />
                ))}
              </div>
            )}
          </Card>

          {data.notes.length > 0 ? (
            <Card title="Notes">
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-400">
                {data.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
