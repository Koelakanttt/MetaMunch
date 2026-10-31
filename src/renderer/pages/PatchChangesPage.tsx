import { useEffect, useMemo, useState } from 'react'
import type {
  Change,
  EntityChanges,
  PatchAbilityStatus,
  PatchChangesRequest,
  PatchChangesResponse,
} from '@shared/patch-diff'
import { ChampionIcon, ItemIcon } from '../components/Icon'
import { Button, Card, EmptyState, Label, Select, StatusLine, TextInput } from '../components/ui'

type Tab = 'champions' | 'items'

function invokeErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function ChangeList({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <EmptyState>no changes</EmptyState>
  return (
    <ul className="space-y-1 text-xs text-slate-400">
      {changes.map((change, index) => (
        <li key={`${change.label}-${index}`}>
          <span className="text-slate-300">{change.label}</span>: {change.before} → {change.after}
        </li>
      ))}
    </ul>
  )
}

function StatusBadge({ status }: { status: EntityChanges['status'] }) {
  if (status === 'unchanged') return null
  const tone =
    status === 'added'
      ? 'text-emerald-400'
      : status === 'removed'
        ? 'text-rose-400'
        : 'text-amber-400'
  return <span className={`text-[10px] uppercase tracking-wide ${tone}`}>{status}</span>
}

function EntityCard({
  entity,
  kind,
  abilityChanges,
  onLoadAbilities,
}: {
  entity: EntityChanges
  kind: Tab
  abilityChanges?: Change[]
  onLoadAbilities?: () => void
}) {
  const itemId = Number(entity.id)
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        {kind === 'champions' ? (
          <ChampionIcon championId={entity.id} name={entity.name} size={28} />
        ) : (
          <ItemIcon itemId={Number.isFinite(itemId) ? itemId : 0} name={entity.name} size={28} />
        )}
        <h3 className="text-sm font-semibold text-slate-100">{entity.name}</h3>
        <StatusBadge status={entity.status} />
      </div>
      <ChangeList changes={entity.changes} />
      {kind === 'champions' ? (
        <div className="mt-2 border-t border-slate-800 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">
              Ability details
            </span>
            {!abilityChanges && onLoadAbilities ? (
              <Button variant="ghost" className="px-2 py-0.5 text-[11px]" onClick={onLoadAbilities}>
                Load
              </Button>
            ) : null}
          </div>
          {abilityChanges ? <ChangeList changes={abilityChanges} /> : null}
        </div>
      ) : null}
    </div>
  )
}

export function PatchChangesPage() {
  const [data, setData] = useState<PatchChangesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [allItems, setAllItems] = useState(false)
  const [poolOnly, setPoolOnly] = useState(false)
  const [text, setText] = useState('')
  const [tab, setTab] = useState<Tab>('champions')
  const [ability, setAbility] = useState<PatchAbilityStatus | null>(null)
  const [abilityError, setAbilityError] = useState('')

  async function load(overrides: PatchChangesRequest = {}): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const request: PatchChangesRequest = {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        allItems,
        poolOnly,
        ...overrides,
      }
      const response = await window.api.invoke('patch:changes', request)
      setData(response)
      setFrom(response.from ?? '')
      setTo(response.to ?? '')
      setAbility(null)
    } catch (reason) {
      setData(null)
      setError(invokeErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
    // The first load intentionally has no selectors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ability?.progress.running) return
    const timer = window.setInterval(() => {
      void window.api
        .invoke('patch:abilityStatus', {})
        .then(setAbility)
        .catch((reason: unknown) => setAbilityError(invokeErrorMessage(reason)))
    }, 500)
    return () => window.clearInterval(timer)
  }, [ability?.progress.running])

  async function startAbilities(championIds?: string[]): Promise<void> {
    setAbilityError('')
    try {
      setAbility(await window.api.invoke('patch:abilityStart', { championIds }))
    } catch (reason) {
      setAbilityError(invokeErrorMessage(reason))
    }
  }

  const visible = useMemo(() => {
    if (!data) return []
    const query = text.trim().toLowerCase()
    const entries = tab === 'champions' ? data.champions : data.items
    return entries.filter(
      (entry) =>
        entry.status !== 'unchanged' &&
        (query === '' || entry.name.toLowerCase().includes(query)),
    )
  }, [data, tab, text])

  const abilityChanges = ability?.changes ?? {}
  const progress = ability?.progress ?? data?.abilityProgress ?? null
  const versions = data
    ? [...new Set([data.from, data.to, ...data.versions].filter((value): value is string => Boolean(value)))]
    : []

  return (
    <section className="space-y-4">
      <Card title="Patch changes">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <Label>From</Label>
            <Select
              value={from}
              onChange={(event) => {
                const next = event.target.value
                setFrom(next)
                void load({ from: next })
              }}
              disabled={loading || !data}
            >
              {(versions).map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>To</Label>
            <Select
              value={to}
              onChange={(event) => {
                const next = event.target.value
                setTo(next)
                void load({ to: next })
              }}
              disabled={loading || !data}
            >
              {(versions).map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>Search</Label>
            <TextInput
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Champion or item name"
            />
          </label>
          <div className="flex flex-col justify-end gap-1 text-xs text-slate-400">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={poolOnly}
                onChange={(event) => {
                  setPoolOnly(event.target.checked)
                  void load({ poolOnly: event.target.checked })
                }}
              />
              My pool only
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allItems}
                onChange={(event) => {
                  setAllItems(event.target.checked)
                  void load({ allItems: event.target.checked })
                }}
              />
              Show all items (not only shop)
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              void load()
            }}
            disabled={loading}
          >
            {loading ? 'loading…' : 'Reload'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void startAbilities()}
            disabled={!data || progress?.running === true}
          >
            {progress?.running ? 'loading abilities…' : 'Load ability changes for all champions'}
          </Button>
          {progress ? (
            <StatusLine tone="muted">
              {`ability details ${progress.loaded}/${progress.total}${progress.errors > 0 ? ` · ${progress.errors} errors` : ''}${progress.running ? ' · running' : ''}`}
            </StatusLine>
          ) : null}
        </div>
        <StatusLine tone="muted">
          Based on Data Dragon data, which can lag behind or differ from the official patch notes.
        </StatusLine>
        {error ? <StatusLine tone="error">error: {error}</StatusLine> : null}
        {abilityError ? <StatusLine tone="error">ability error: {abilityError}</StatusLine> : null}
      </Card>

      {!data ? (
        <Card title="Overview">
          <EmptyState>No data yet. Update Data Dragon in Settings and reload.</EmptyState>
        </Card>
      ) : (
        <>
          <Card title="Overview">
            <StatusLine tone="muted">
              {`Patch ${data.from ?? '—'} → ${data.to ?? '—'}`}
            </StatusLine>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <span>{`${data.summary.championsChanged} champions changed`}</span>
              <span>{`${data.summary.itemsChanged} items changed`}</span>
              <span>{`${data.summary.added} added`}</span>
              <span>{`${data.summary.removed} removed`}</span>
            </div>
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

          <Card title="Changes">
            <div className="flex gap-2">
              <Button
                variant={tab === 'champions' ? 'primary' : 'secondary'}
                onClick={() => setTab('champions')}
              >
                Champions
              </Button>
              <Button
                variant={tab === 'items' ? 'primary' : 'secondary'}
                onClick={() => setTab('items')}
              >
                Items
              </Button>
            </div>
            {visible.length === 0 ? (
              <EmptyState>No changes match the current filters.</EmptyState>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {visible.map((entity) => (
                  <EntityCard
                    key={`${tab}-${entity.id}-${entity.name}`}
                    entity={entity}
                    kind={tab}
                    abilityChanges={
                      tab === 'champions' ? abilityChanges[entity.id] : undefined
                    }
                    onLoadAbilities={
                      tab === 'champions'
                        ? () => {
                            void startAbilities([entity.id])
                          }
                        : undefined
                    }
                  />
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
      )}
    </section>
  )
}
