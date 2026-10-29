import { useEffect, useRef, useState } from 'react'
import type { ChampionSelectStatus } from '@shared/champion-select'
import type { MatchupEntry, MatchupsResponse } from '@shared/matchups'
import type { MatchupEntry as PersonalMatchup, PersonalStats } from '@shared/personal'
import type {
  ChampionListResponse,
  RecommendationView,
  RecommendResponse,
} from '@shared/recommend-api'
import type { RunesResponse } from '@shared/runes'
import type { SynergiesResponse, SynergyEntry } from '@shared/synergies'
import type { PurchaseOrderResponse } from '@shared/timeline'
import { ROLES, type Role } from '@shared/rules'
import { ChampionPicker } from '../components/ChampionPicker'
import { ChampionIcon, ItemIcon, RuneIcon } from '../components/Icon'
import { Button, Card, EmptyState, Label, Select, StatusLine } from '../components/ui'

function invokeErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function names(list: string[]): string {
  return list.length > 0 ? list.join(', ') : 'none'
}

function recommendationLabel(item: RecommendationView): string {
  if (item.source === 'personal') return 'your build'
  if (item.source === 'core') return 'class core'
  return 'rules'
}

function itemHint(item: RecommendationView): string {
  return [item.gold > 0 ? `${item.gold}g` : null, item.plaintext]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

function RecommendationList({ items }: { items: RecommendationView[] }) {
  if (items.length === 0) return <EmptyState>none</EmptyState>

  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li
          key={item.itemId}
          className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"
        >
          <ItemIcon itemId={item.itemId} name={item.name} hint={itemHint(item)} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="font-medium text-slate-100">{item.name}</strong>
              <span className="text-xs text-slate-500">[{recommendationLabel(item)}]</span>
            </div>
            {itemHint(item) ? (
              <div className="text-[11px] text-slate-500">{itemHint(item)}</div>
            ) : null}
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-400">
              {item.reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  )
}

function BuildStrip({ items }: { items: RecommendationView[] }) {
  const seen = new Set<number>()
  const unique = items.filter((item) => {
    if (seen.has(item.itemId)) return false
    seen.add(item.itemId)
    return true
  })
  if (unique.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      {unique.map((item, index) => (
        <span key={item.itemId} className="flex items-center gap-1">
          <ItemIcon itemId={item.itemId} name={item.name} hint={itemHint(item)} size={34} />
          {index < unique.length - 1 ? <span className="text-xs text-slate-500">→</span> : null}
        </span>
      ))}
    </div>
  )
}

function formatMatchup(entry: PersonalMatchup): string {
  if (entry.games === 0) return `${entry.enemyName}: no games`
  const base = `${entry.enemyName}: ${entry.games} games, ${entry.wins} wins`
  return entry.lowSample ? `${base} · low sample` : base
}

function PersonalStatsBlock({
  personal,
  meName,
}: {
  personal: PersonalStats | null
  meName: string
}) {
  if (!personal) return <StatusLine tone="muted">Personal stats: no account set.</StatusLine>

  const rawWinRate = personal.games === 0 ? 0 : personal.wins / personal.games
  const winRate = Math.round((personal.lowSample ? personal.adjustedWinRate : rawWinRate) * 100)

  return (
    <div className="space-y-2">
      <p className="font-medium">Your stats ({personal.account})</p>
      {personal.games === 0 ? (
        <StatusLine tone="muted">No games on {meName} yet.</StatusLine>
      ) : (
        <>
          <StatusLine>
            {`${meName}: ${personal.games} games, ${personal.wins} wins (${winRate}%)`}
            {personal.lowSample ? ' · low sample, adjusted' : ''}
          </StatusLine>
          {personal.lowSample ? (
            <StatusLine tone="muted">
              Win rate is adjusted toward your account average on small samples.
            </StatusLine>
          ) : null}
        </>
      )}
      {personal.build.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Your usual build</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-400">
            {personal.build.map((entry) => (
              <li key={entry.itemId} className="flex items-center gap-2">
                <ItemIcon itemId={entry.itemId} name={entry.name} size={24} />
                <span>{`${entry.name} — ${entry.games} of ${personal.games} games`}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {personal.vs.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Against this team</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-400">
            {personal.vs.map((entry) => (
              <li key={entry.enemyId} className="flex items-center gap-2">
                <ChampionIcon championId={entry.enemyId} name={entry.enemyName} size={22} />
                <span>{formatMatchup(entry)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function MatchupColumn({
  title,
  entries,
  tone,
}: {
  title: string
  entries: MatchupEntry[]
  tone: string
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">not enough games</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {entries.map((entry) => (
            <li key={entry.championId} className="flex items-center gap-2 text-xs">
              <ChampionIcon championId={entry.championId} name={entry.name} size={24} />
              <span className="flex-1 truncate text-slate-300">{entry.name}</span>
              <span className={tone}>{Math.round(entry.winRate * 100)}%</span>
              <span className="text-slate-500">{entry.games}g</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MatchupBlock({ data, error }: { data: MatchupsResponse | null; error: string }) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading matchups…</StatusLine>
  if (!data.hasStaticData) {
    return <EmptyState>No static data. Update it in Settings to see matchups.</EmptyState>
  }
  if (data.strong.length === 0 && data.weak.length === 0) {
    return (
      <EmptyState>
        Not enough same-role games yet (at least 3 per matchup). Sync more matches.
      </EmptyState>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MatchupColumn title="Strong against" entries={data.strong} tone="text-emerald-400" />
      <MatchupColumn title="Weak against" entries={data.weak} tone="text-rose-400" />
    </div>
  )
}

function SynergyBlock({ data, error }: { data: SynergiesResponse | null; error: string }) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading synergies…</StatusLine>
  if (!data.hasStaticData) {
    return <EmptyState>No static data. Update it in Settings to see synergies.</EmptyState>
  }
  if (data.best.length === 0 && data.worst.length === 0) {
    return (
      <EmptyState>
        Not enough games with the same teammates yet (at least 3 per duo). Sync more matches.
      </EmptyState>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SynergyColumn title="Best with" entries={data.best} tone="text-emerald-400" />
      <SynergyColumn title="Worst with" entries={data.worst} tone="text-rose-400" />
    </div>
  )
}

function SynergyColumn({
  title,
  entries,
  tone,
}: {
  title: string
  entries: SynergyEntry[]
  tone: string
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">not enough games</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {entries.map((entry) => (
            <li key={entry.championId} className="flex items-center gap-2 text-xs">
              <ChampionIcon championId={entry.championId} name={entry.name} size={24} />
              <span className="flex-1 truncate text-slate-300">{entry.name}</span>
              <span className={tone}>{Math.round(entry.winRate * 100)}%</span>
              <span className="text-slate-500">{entry.games}g</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function PurchaseOrderBlock({
  data,
  error,
}: {
  data: PurchaseOrderResponse | null
  error: string
}) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading purchase order…</StatusLine>
  if (!data.hasTimeline) {
    return (
      <EmptyState>
        No timeline data yet. Sync new matches or use &quot;Fetch timelines&quot; in Settings.
      </EmptyState>
    )
  }
  if (data.items.length === 0) {
    return <EmptyState>No item purchases recorded in the timeline sample.</EmptyState>
  }
  return (
    <div className="space-y-2">
      <StatusLine tone="muted">
        {`${data.sampleMatches} matches with timeline data; times are the first purchase in each game.`}
      </StatusLine>
      <ul className="space-y-1">
        {data.items.map((item) => (
          <li key={item.itemId} className="flex items-center gap-2 text-xs">
            <ItemIcon itemId={item.itemId} name={item.name} size={28} />
            <span className="flex-1 truncate text-slate-300">{item.name}</span>
            <span className="text-slate-400">~{formatSeconds(item.averageSeconds)}</span>
            <span className="text-slate-500">{item.games}g</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RuneBlock({ data, error }: { data: RunesResponse | null; error: string }) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading runes…</StatusLine>
  if (!data.hasStaticData) {
    return <EmptyState>No static data. Update it in Settings to see runes.</EmptyState>
  }
  if (data.pages.length === 0) {
    return (
      <EmptyState>
        No rune pages in the stored sample yet. Sync matches with rune data.
      </EmptyState>
    )
  }
  return (
    <>
      {data.note ? <StatusLine tone="muted">{data.note}</StatusLine> : null}
      <ul className="space-y-2">
        {data.pages.map((page) => (
          <li
            key={`${page.keystone.id}-${page.primaryRunes.map((rune) => rune.id).join('-')}-${page.secondaryRunes.map((rune) => rune.id).join('-')}`}
            className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2"
          >
            <RuneIcon iconPath={page.keystone.icon} name={page.keystone.name} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className="text-sm font-medium text-slate-100">
                  {page.keystone.name}
                </strong>
                <span className="text-[11px] text-slate-500">
                  {`${page.primaryTree.name} / ${page.secondaryTree.name}`}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {page.primaryRunes.map((rune) => (
                  <RuneIcon key={`p-${rune.id}`} iconPath={rune.icon} name={rune.name} size={22} />
                ))}
                {page.secondaryRunes.length > 0 ? (
                  <>
                    <span className="mx-1 text-xs text-slate-600">/</span>
                    {page.secondaryRunes.map((rune) => (
                      <RuneIcon
                        key={`s-${rune.id}`}
                        iconPath={rune.icon}
                        name={rune.name}
                        size={20}
                      />
                    ))}
                  </>
                ) : null}
              </div>
              <div className="text-[11px] text-slate-400">
                {`${Math.round(page.winRate * 100)}% · ${page.games} games${page.lowSample ? ' · low sample' : ''}${page.fullRunes ? '' : ' · keystone only'}`}
              </div>
              {!page.fullRunes ? (
                <div className="text-[11px] text-slate-500">
                  Sync new matches to store full rune selections.
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function ChampionSelectCard({
  status,
  message,
  onApply,
}: {
  status: ChampionSelectStatus | null
  message: string
  onApply: (status: ChampionSelectStatus) => void
}) {
  if (!status) {
    return (
      <Card title="Champion select">
        <StatusLine tone="muted">Checking the League client…</StatusLine>
      </Card>
    )
  }

  if (status.state === 'not-found' || status.state === 'error') {
    return (
      <Card title="Champion select">
        <StatusLine tone={status.state === 'error' ? 'error' : 'muted'}>{status.message}</StatusLine>
      </Card>
    )
  }

  if (status.state === 'idle') {
    return (
      <Card title="Champion select">
        <StatusLine tone="muted">{`Client phase: ${status.phase}`}</StatusLine>
      </Card>
    )
  }

  const me = status.me
  const meName = me?.championId
    ? (me.name ?? me.championId)
    : me
      ? 'no champion picked yet'
      : 'not in this champion select'
  const enemyNames =
    status.enemies
      .map((enemy) => enemy.name ?? enemy.championId ?? `#${enemy.championKey}`)
      .join(', ') || 'none revealed'

  return (
    <Card title="Champion select">
      <div className="flex items-center gap-2">
        <ChampionIcon championId={me?.championId ?? null} name={me?.name} size={36} />
        <StatusLine>{`You: ${meName}${me?.position ? ` (${me.position})` : ''}`}</StatusLine>
      </div>
      {status.enemies.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {status.enemies.map((enemy) => (
            <ChampionIcon
              key={enemy.championKey}
              championId={enemy.championId}
              name={enemy.name}
              size={24}
            />
          ))}
        </div>
      ) : null}
      <StatusLine tone="muted">
        {`Enemies: ${enemyNames}${status.hiddenEnemies > 0 ? ` · ${status.hiddenEnemies} hidden` : ''}`}
      </StatusLine>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={!me?.championId}
          onClick={() => onApply(status)}
        >
          Use detected picks
        </Button>
        {message ? <StatusLine tone="muted">{message}</StatusLine> : null}
      </div>
      {me && !me.championId ? (
        <StatusLine tone="muted">
          The champion is not resolved because static data is missing. Press &quot;Update data&quot;
          in Settings.
        </StatusLine>
      ) : null}
    </Card>
  )
}

export function RecommendPage({
  refreshKey,
  initialChampionId = null,
  initialRole = 'TOP',
}: {
  refreshKey: number
  initialChampionId?: string | null
  initialRole?: Role
}) {
  const [championList, setChampionList] = useState<ChampionListResponse | null>(null)
  const [role, setRole] = useState<Role>(initialRole)
  const [meId, setMeId] = useState<string | null>(initialChampionId)
  const [enemyIds, setEnemyIds] = useState<(string | null)[]>([null, null, null, null, null])
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [champSelect, setChampSelect] = useState<ChampionSelectStatus | null>(null)
  const [applyMessage, setApplyMessage] = useState('')
  const [matchups, setMatchups] = useState<MatchupsResponse | null>(null)
  const [matchupError, setMatchupError] = useState('')
  const [synergies, setSynergies] = useState<SynergiesResponse | null>(null)
  const [synergyError, setSynergyError] = useState('')
  const [runes, setRunes] = useState<RunesResponse | null>(null)
  const [runeError, setRuneError] = useState('')
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderResponse | null>(null)
  const [purchaseOrderError, setPurchaseOrderError] = useState('')
  const requestIdRef = useRef(0)
  const resultChampionId = result?.me.id ?? null

  useEffect(() => {
    window.api
      .invoke('champions:list', {})
      .then(setChampionList)
      .catch(() => {
        setChampionList({ version: null, champions: [] })
      })
  }, [refreshKey])

  useEffect(() => {
    const championId = resultChampionId
    if (!championId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      setMatchupError('')
      try {
        const response = await window.api.invoke('matchups:list', { championId })
        if (!cancelled) setMatchups(response)
      } catch (reason) {
        if (!cancelled) {
          setMatchups(null)
          setMatchupError(invokeErrorMessage(reason))
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [resultChampionId])

  useEffect(() => {
    const championId = resultChampionId
    if (!championId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      setSynergyError('')
      try {
        const response = await window.api.invoke('synergies:list', { championId })
        if (!cancelled) setSynergies(response)
      } catch (reason) {
        if (!cancelled) {
          setSynergies(null)
          setSynergyError(invokeErrorMessage(reason))
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [resultChampionId])

  useEffect(() => {
    const championId = resultChampionId
    if (!championId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      setPurchaseOrderError('')
      try {
        const response = await window.api.invoke('timeline:purchaseOrder', { championId })
        if (!cancelled) setPurchaseOrder(response)
      } catch (reason) {
        if (!cancelled) {
          setPurchaseOrder(null)
          setPurchaseOrderError(invokeErrorMessage(reason))
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [resultChampionId, refreshKey])

  useEffect(() => {
    const championId = resultChampionId
    if (!championId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      setRuneError('')
      try {
        const response = await window.api.invoke('runes:popular', { championId })
        if (!cancelled) setRunes(response)
      } catch (reason) {
        if (!cancelled) {
          setRunes(null)
          setRuneError(invokeErrorMessage(reason))
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [resultChampionId])

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        const status = await window.api.invoke('champSelect:status', {})
        if (!cancelled) setChampSelect(status)
      } catch {
        if (!cancelled) {
          setChampSelect({ state: 'error', message: 'Could not read the League client.' })
        }
      }
    }

    void load()
    const timer = setInterval(() => {
      void load()
    }, 4000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!meId) {
      requestIdRef.current += 1
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const run = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await window.api.invoke('recommend:run', {
          meId,
          role,
          enemyIds: enemyIds.filter((id): id is string => id !== null),
        })
        if (requestIdRef.current !== requestId) return
        setResult(response)
        setLoading(false)
      } catch (reason) {
        if (requestIdRef.current !== requestId) return
        setResult(null)
        setError(invokeErrorMessage(reason))
        setLoading(false)
      }
    }

    void run()
  }, [meId, role, enemyIds])

  function setEnemy(index: number, id: string | null): void {
    setEnemyIds((current) =>
      current.map((value, currentIndex) => (currentIndex === index ? id : value)),
    )
  }

  function excludeForEnemy(index: number): string[] {
    const ids = enemyIds.filter(
      (id, otherIndex): id is string => id !== null && otherIndex !== index,
    )
    if (meId) ids.push(meId)
    return ids
  }

  function swapLane(): void {
    if (!meId || !enemyIds[0]) return
    const lane = enemyIds[0]
    const next = [...enemyIds]
    next[0] = meId
    setMeId(lane)
    setEnemyIds(next)
  }

  function promoteEnemy(index: number): void {
    if (index <= 0 || index >= enemyIds.length) return
    setEnemyIds((current) => {
      const next = [...current]
      const lane = next[0] ?? null
      next[0] = next[index] ?? null
      next[index] = lane
      return next
    })
  }

  function applyDetected(status: ChampionSelectStatus): void {
    if (status.state !== 'champ-select') return
    const me = status.me
    if (!me?.championId) return
    setMeId(me.championId)
    const detectedRole = me.position as Role
    const activeRole = ROLES.includes(detectedRole) ? detectedRole : role
    if (ROLES.includes(detectedRole)) setRole(detectedRole)

    const detected: { id: string; position: string }[] = []
    for (const enemy of status.enemies) {
      if (enemy.championId) detected.push({ id: enemy.championId, position: enemy.position })
    }
    const lane = detected.find((enemy) => enemy.position === activeRole) ?? detected[0]
    const used = new Set<string>(lane ? [lane.id] : [])
    const slots = ROLES.filter((value) => value !== activeRole).map((roleName) => {
      const found = detected.find((enemy) => enemy.position === roleName && !used.has(enemy.id))
      if (!found) return null
      used.add(found.id)
      return found.id
    })
    const leftovers = detected.filter((enemy) => !used.has(enemy.id)).map((enemy) => enemy.id)
    const filled = slots.map((id) => id ?? leftovers.shift() ?? null)
    setEnemyIds([lane?.id ?? null, ...filled].slice(0, 5))
    setApplyMessage('Detected picks applied.')
  }

  if (!championList) {
    return (
      <Card title="Recommendations">
        <StatusLine tone="muted">loading…</StatusLine>
      </Card>
    )
  }

  if (championList.version === null) {
    return (
      <Card title="Recommendations">
        <StatusLine tone="muted">No static data yet. Press &quot;Update data&quot;.</StatusLine>
      </Card>
    )
  }

  const otherRoles = ROLES.filter((value) => value !== role)
  const laneName = championList.champions.find((champion) => champion.id === enemyIds[0])?.name ?? null
  const laneRecord =
    matchups?.all.find((entry) => entry.championId === enemyIds[0]) ?? null

  return (
    <section className="space-y-4">
      <Card title="Lane matchup">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end">
          <div
            className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3"
            style={{ borderColor: 'var(--mm-accent)' }}
          >
            <Label>Your champion</Label>
            <div className="flex items-center gap-3">
              <ChampionIcon championId={meId} size={56} />
              <div className="min-w-0 flex-1">
                <ChampionPicker
                  label="You"
                  champions={championList.champions}
                  value={meId}
                  onChange={setMeId}
                  exclude={enemyIds.filter((id): id is string => id !== null)}
                  showIcon={false}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 pb-3">
            <span className="text-xs font-semibold tracking-widest text-slate-400">VS</span>
            <Button
              variant="secondary"
              onClick={swapLane}
              disabled={!meId || !enemyIds[0]}
              className="px-3"
            >
              ⇄ Swap
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
            <Label>Lane opponent · priority</Label>
            <div className="flex items-center gap-3">
              <ChampionIcon championId={enemyIds[0] ?? null} size={56} />
              <div className="min-w-0 flex-1">
                <ChampionPicker
                  label="Enemy pick"
                  champions={championList.champions}
                  value={enemyIds[0] ?? null}
                  onChange={(id) => setEnemy(0, id)}
                  exclude={excludeForEnemy(0)}
                  showIcon={false}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-40 flex-col gap-1">
            <Label>Role</Label>
            <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </label>
          <div className="space-y-1">
            <StatusLine tone="muted">
              {meId && enemyIds[0]
                ? 'The build below is calculated for your champion against this lane opponent.'
                : 'Pick both sides of the lane to see the build.'}
            </StatusLine>
            {meId && enemyIds[0] ? (
              matchups === null ? (
                <StatusLine tone="muted">Lane record: loading…</StatusLine>
              ) : laneRecord ? (
                <StatusLine>
                  {`Lane record: ${laneRecord.wins}–${laneRecord.games - laneRecord.wins} in ${laneRecord.games} games (${Math.round(laneRecord.winRate * 100)}%)`}
                </StatusLine>
              ) : (
                <StatusLine tone="muted">Lane record: no same-lane games in your sample yet.</StatusLine>
              )
            ) : null}
          </div>
        </div>
      </Card>

      {!meId ? (
        <Card title="Status">
          <EmptyState>Pick your champion.</EmptyState>
        </Card>
      ) : loading ? (
        <Card title="Status">
          <StatusLine tone="muted">loading…</StatusLine>
        </Card>
      ) : error ? (
        <Card title="Status">
          <StatusLine tone="error">error: {error}</StatusLine>
        </Card>
      ) : result ? (
        <>
          <Card title="Summary">
            <div className="flex flex-wrap items-center gap-3">
              <ChampionIcon championId={result.me.id} name={result.me.name} size={48} />
              {enemyIds[0] ? (
                <>
                  <span className="text-xs font-semibold tracking-widest text-slate-500">VS</span>
                  <ChampionIcon championId={enemyIds[0]} size={48} />
                </>
              ) : null}
              <div className="space-y-1">
                <StatusLine>
                  {`patch ${result.version} · ${result.level === 'rules' ? 'rules' : 'core fallback'} · build for ${result.me.name} vs ${laneName ?? 'lane opponent'} (${result.me.damage}, ${result.me.archetype})`}
                </StatusLine>
                {result.profile.metrics.enemies > 0 ? (
                  <StatusLine tone="muted">
                    {`Enemy team: ${Math.round(result.profile.metrics.adShare * 100)}% physical / ${Math.round(result.profile.metrics.apShare * 100)}% magic · healers: ${names(result.profile.names.healers)} · hard CC: ${names(result.profile.names.hardCc)} · tanks: ${names(result.profile.names.tanks)}`}
                  </StatusLine>
                ) : null}
                <StatusLine tone="muted">
                  Rune pages from your own sample are shown below.
                </StatusLine>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Suggested items</p>
              <BuildStrip items={[...result.core, ...result.items, ...result.boots]} />
            </div>
          </Card>

          <Card title="Core">
            <RecommendationList items={result.core} />
          </Card>

          <Card title="Situational">
            <RecommendationList items={result.items} />
          </Card>

          <Card title="Boots">
            <RecommendationList items={result.boots} />
          </Card>

          <Card title="Purchase order (own sample)">
            <PurchaseOrderBlock data={purchaseOrder} error={purchaseOrderError} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Matchups (own sample)">
              <MatchupBlock data={matchups} error={matchupError} />
            </Card>

            <Card title="Synergies (own sample)">
              <SynergyBlock data={synergies} error={synergyError} />
            </Card>
          </div>

          <Card title="Runes (own sample)">
            <RuneBlock data={runes} error={runeError} />
          </Card>

          <Card title="Personal stats">
            <PersonalStatsBlock personal={result.personal} meName={result.me.name} />
          </Card>
        </>
      ) : null}

      <Card title="Other enemies">
        <div className="grid gap-3 sm:grid-cols-2">
          {otherRoles.map((otherRole, offset) => {
            const index = offset + 1
            return (
              <div key={otherRole} className="space-y-1">
                <ChampionPicker
                  label={otherRole}
                  champions={championList.champions}
                  value={enemyIds[index] ?? null}
                  onChange={(id) => setEnemy(index, id)}
                  exclude={excludeForEnemy(index)}
                />
                {enemyIds[index] ? (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-[11px]"
                    onClick={() => promoteEnemy(index)}
                  >
                    Move to lane
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>
      </Card>

      <ChampionSelectCard status={champSelect} message={applyMessage} onApply={applyDetected} />
    </section>
  )
}
