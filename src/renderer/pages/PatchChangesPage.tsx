import { useState } from 'react'
import type { Change, EntityChanges, PatchChangesResponse } from '@shared/patch-diff'

function invokeErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function ChangesList({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <p>no changes</p>
  return (
    <ul>
      {changes.map((change, index) => (
        <li key={index}>{`${change.label}: ${change.before} → ${change.after}`}</li>
      ))}
    </ul>
  )
}

function EntityBlock({ entity }: { entity: EntityChanges }) {
  return (
    <div>
      <h3>{entity.name}</h3>
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
    <section>
      <h2>Patch changes</h2>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          void load()
        }}
      >
        {loading ? 'loading…' : 'Load patch changes'}
      </button>
      {error ? <p>error: {error}</p> : null}
      {data ? (
        <div>
          <p>{`Patch ${data.from ?? '—'} → ${data.to ?? '—'}`}</p>
          <p>
            {`Pool: ${
              data.pool.length > 0
                ? data.pool.map((entry) => `${entry.name} (${entry.games})`).join(', ')
                : 'none'
            }`}
          </p>
          {data.champions.map((entity) => (
            <EntityBlock key={entity.id} entity={entity} />
          ))}
          <h3>Items</h3>
          {data.items.length === 0 ? (
            <p>no changes</p>
          ) : (
            data.items.map((entity) => <EntityBlock key={entity.id} entity={entity} />)
          )}
          {data.notes.length > 0 ? (
            <ul>
              {data.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
