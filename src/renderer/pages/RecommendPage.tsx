import { useEffect, useRef, useState } from 'react'
import type { ChampionSelectStatus } from '@shared/champion-select'
import type { MatchupEntry, MatchupsResponse } from '@shared/matchups'
import type { MatchupEntry as PersonalMatchup, PersonalStats } from '@shared/personal'
import type {
  ChampionListResponse,
  RecommendationView,
  RecommendResponse,
} from '@shared/recommend-api'
import type { PopularRunePage, RuneRef, RunesResponse } from '@shared/runes'
import type { SynergiesResponse, SynergyEntry } from '@shared/synergies'
import type { PurchaseOrderResponse, SkillOrderResponse } from '@shared/timeline'
import { ROLES, type Role } from '@shared/rules'
import { ChampionPicker } from '../components/ChampionPicker'
import { ChampionIcon, ItemIcon, RuneIcon } from '../components/Icon'
import { Button, Card, EmptyState, Label, StatusLine } from '../components/ui'

function invokeErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function names(list: string[]): string {
  return list.length > 0 ? list.join(', ') : 'none'
}

function recommendationLabel(item: RecommendationView): string {
  if (item.source === 'personal') return 'your build'
  if (item.source === 'research') return 'research sample'
  if (item.source === 'core') return 'class core'
  return 'rules'
}

function formatGames(games: number): string {
  return games >= 1000 ? `${(games / 1000).toFixed(1)}k` : String(games)
}

function itemHint(item: RecommendationView): string {
  return [item.gold > 0 ? `${item.gold}g` : null, item.plaintext]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

function evidenceLine(item: RecommendationView, sourceLabel?: string): string | null {
  const evidence = item.evidence
  if (!evidence) return null
  const sign = evidence.deltaWinRate >= 0 ? '+' : ''
  return `${Math.round(evidence.winRate * 100)}% WR · ${Math.round(
    evidence.pickRate * 100,
  )}% pick · ${sign}${(evidence.deltaWinRate * 100).toFixed(1)}pp · ${
    evidence.games
  } games${sourceLabel ? ` · ${sourceLabel}` : ''}${evidence.games < 5 ? ' · low sample' : ''}`
}

function RecommendationList({
  items,
  sourceLabel,
}: {
  items: RecommendationView[]
  sourceLabel?: string
}) {
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
            {evidenceLine(item, sourceLabel) ? (
              <div className="text-[11px] text-emerald-400">
                {evidenceLine(item, sourceLabel)}
              </div>
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
          <ItemIcon itemId={item.itemId} name={item.name} hint={itemHint(item)} size={42} />
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
  const winRate = Math.round(rawWinRate * 100)

  return (
    <div className="space-y-2">
      <p className="font-medium">Your stats ({personal.account})</p>
      {personal.games === 0 ? (
        <StatusLine tone="muted">No games on {meName} yet.</StatusLine>
      ) : (
        <StatusLine>
          {`${meName}: ${personal.games} games, ${personal.wins} wins (${winRate}%)`}
          {personal.lowSample ? ' · low sample' : ''}
        </StatusLine>
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
        Not enough same-role games yet (at least 5 per matchup). Sync more matches.
      </EmptyState>
    )
  }
  return (
    <div className="space-y-3">
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
        Not enough games with the same teammates yet (at least 5 per duo). Sync more matches.
      </EmptyState>
    )
  }
  return (
    <div className="space-y-3">
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
      {data.paths.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Typical opening</p>
          <ul className="space-y-1">
            {data.paths.map((path) => (
              <li
                key={path.items.map((item) => item.itemId).join('-')}
                className="flex items-center gap-1 text-xs"
              >
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  {path.items.map((item, index) => (
                    <span key={item.itemId} className="flex items-center gap-1">
                      <ItemIcon itemId={item.itemId} name={item.name} size={22} />
                      {index < path.items.length - 1 ? (
                        <span className="text-slate-600">→</span>
                      ) : null}
                    </span>
                  ))}
                </div>
                <span className="text-slate-500">{path.games}g</span>
                <span className="text-emerald-400">{Math.round(path.winRate * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function SkillOrderBlock({ data, error }: { data: SkillOrderResponse | null; error: string }) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading skill order…</StatusLine>
  if (!data.hasTimeline) {
    return (
      <EmptyState>
        No timeline data yet. Sync new matches or use &quot;Fetch timelines&quot; in Settings.
      </EmptyState>
    )
  }
  if (data.orders.length === 0) return <EmptyState>No skill level-ups in the sample.</EmptyState>
  return (
    <div className="space-y-2">
      <StatusLine tone="muted">
        {`${data.sampleMatches} matches with skill data; first 9 level-ups.`}
      </StatusLine>
      <ul className="space-y-1">
        {data.orders.map((order) => (
          <li key={order.slots.join('')} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate text-slate-300">{order.slots.join(' → ')}</span>
            <span className="text-emerald-400">{Math.round(order.winRate * 100)}%</span>
            <span className="text-slate-500">{order.games}g</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RuneGrid({
  slots,
  selected,
  size,
}: {
  slots: RuneRef[][]
  selected: readonly RuneRef[]
  size: number
}) {
  if (slots.length === 0) return null
  const selectedIds = new Set(selected.map((rune) => rune.id))
  return (
    <div className="space-y-1">
      {slots.map((row, index) => (
        <div key={index} className="grid grid-cols-3 justify-items-center gap-1">
          {row.map((rune) => (
            <RuneIcon
              key={rune.id}
              iconPath={rune.icon}
              name={rune.name}
              size={size}
              className={
                selectedIds.has(rune.id)
                  ? 'ring-1 ring-emerald-400'
                  : 'opacity-20 grayscale'
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function RunePageDetail({
  page,
  source,
  championGames,
}: {
  page: PopularRunePage
  source: string
  championGames?: number
}) {
  const label = `${Math.round(page.winRate * 10000) / 100}% Win Rate`
  const sample =
    championGames && championGames > 0
      ? `${page.games.toLocaleString()} of ${championGames.toLocaleString()} games`
      : `${page.games.toLocaleString()} games`
  return (
    <div className="space-y-3">
      <div
        className={
          page.statShards.length > 0
            ? 'grid grid-cols-[1.2fr_1fr_0.8fr] gap-2'
            : 'grid grid-cols-2 gap-2'
        }
      >
        <div>
          <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-slate-400">
            Primary Runes
          </p>
          <RuneGrid slots={page.primarySlots} selected={page.primaryRunes} size={27} />
        </div>
        <div>
          <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-slate-400">
            Secondary
          </p>
          <RuneGrid slots={page.secondarySlots} selected={page.secondaryRunes} size={25} />
        </div>
        {page.statShards.length > 0 ? (
          <div>
            <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-slate-400">
              Stat Mods
            </p>
            <div className="grid grid-cols-3 justify-items-center gap-1">
              {page.statShards.map((shard) => (
                <RuneIcon
                  key={shard.id}
                  iconPath={shard.icon}
                  name={shard.name}
                  size={22}
                  className="ring-1 ring-emerald-400"
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="text-center">
        <div className="text-base font-semibold text-emerald-400">{label}</div>
        <div className="text-[11px] text-slate-400">
          {`${sample}${page.pickRate === undefined ? '' : ` · ${Math.round(page.pickRate * 100)}% pick`} · ${source}${page.lowSample ? ' · low sample' : ''}`}
        </div>
      </div>
    </div>
  )
}

function RuneBlock({ data, error }: { data: RunesResponse | null; error: string }) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading runes…</StatusLine>
  if (!data.hasStaticData) {
    return <EmptyState>No static data. Update it in Settings to see runes.</EmptyState>
  }

  const ownPage = data.pages[0]
  const researchPage = data.researchPages[0]
  const page = researchPage ?? ownPage
  const source = researchPage ? 'research sample' : 'your sample'
  const alternatives = researchPage
    ? data.researchPages.slice(1)
    : data.pages.slice(1)

  if (!page) {
    return (
      <EmptyState>
        No data yet. Sync matches or collect a research sample to see rune pages.
      </EmptyState>
    )
  }

  return (
    <>
      {data.note ? <StatusLine tone="muted">{data.note}</StatusLine> : null}
      {data.researchScope && researchPage ? (
        <StatusLine tone="muted">
          {`${data.researchScope.region} · ${data.researchScope.rankScope} · ${
            data.researchScope.fallback && data.researchScope.samplePatch
              ? `from patch ${data.researchScope.samplePatch}, ${formatGames(
                  data.researchScope.championGames ?? researchPage.games,
                )} games`
              : `patch ${data.researchScope.patch} · ${formatGames(
                  data.researchScope.championGames ?? researchPage.games,
                )} games`
          } (not global)`}
        </StatusLine>
      ) : null}
      <RunePageDetail
        page={page}
        source={source}
        championGames={data.researchScope?.championGames}
      />
      {alternatives.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Other pages</p>
          <ul className="space-y-1">
            {alternatives.map((entry) => (
              <li key={`${entry.keystone.id}-${entry.games}-${entry.wins}`}>
                <div
                  className="flex w-full items-center gap-2 rounded-md border border-slate-800 bg-slate-950/50 p-1.5 text-left text-[11px] text-slate-400"
                  title={`${entry.keystone.name}: ${entry.games} games`}
                >
                  <RuneIcon iconPath={entry.keystone.icon} name={entry.keystone.name} size={22} />
                  <span className="min-w-0 flex-1 truncate">{entry.keystone.name}</span>
                  <span>{`${Math.round(entry.winRate * 100)}%`}</span>
                  <span className="text-slate-600">{`${entry.games}g`}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
  const [skillOrder, setSkillOrder] = useState<SkillOrderResponse | null>(null)
  const [skillOrderError, setSkillOrderError] = useState('')
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
      setSkillOrderError('')
      try {
        const response = await window.api.invoke('timeline:skillOrder', { championId })
        if (!cancelled) setSkillOrder(response)
      } catch (reason) {
        if (!cancelled) {
          setSkillOrder(null)
          setSkillOrderError(invokeErrorMessage(reason))
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
        const response = await window.api.invoke('runes:popular', { championId, role })
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
  }, [resultChampionId, role])

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
  const researchCore = result?.core.some((item) => item.source === 'research') ?? false
  const levelLabel = researchCore
    ? 'research core'
    : result?.level === 'rules'
      ? 'rules'
      : 'core fallback'

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">New matchup</h2>
        <p className="text-sm text-slate-400">
          Pick both sides of the lane; the build and stored sample update below.
        </p>
      </div>

      <Card title="Lane matchup">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end">
          <div
            className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3"
            style={{ borderColor: 'var(--mm-accent)' }}
          >
            <Label>Your champion</Label>
            <div className="flex items-center gap-3">
              <ChampionIcon championId={meId} size={72} />
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
              <ChampionIcon championId={enemyIds[0] ?? null} size={72} />
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
          <div className="space-y-1">
            <Label>Role</Label>
            <div className="flex flex-wrap gap-1">
              {ROLES.map((value) => (
                <Button
                  key={value}
                  variant={role === value ? 'primary' : 'ghost'}
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setRole(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <StatusLine tone="muted">
              {meId && enemyIds[0]
                ? 'The build below is based on the selected champions and any stored sample.'
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Card title="Summary">
              <div className="flex flex-wrap items-center gap-3">
                <ChampionIcon championId={result.me.id} name={result.me.name} size={48} />
                {enemyIds[0] ? (
                  <>
                    <span className="text-xs font-semibold tracking-widest text-slate-500">
                      VS
                    </span>
                    <ChampionIcon championId={enemyIds[0]} size={48} />
                  </>
                ) : null}
                <div className="space-y-1">
                  <StatusLine>
                    {`patch ${result.version} · ${levelLabel} · build for ${result.me.name} vs ${laneName ?? 'lane opponent'} (${result.me.damage}, ${result.me.archetype})`}
                  </StatusLine>
                  {result.profile.metrics.enemies > 0 ? (
                    <StatusLine tone="muted">
                      {`Enemy team: ${Math.round(result.profile.metrics.adShare * 100)}% physical / ${Math.round(result.profile.metrics.apShare * 100)}% magic · healers: ${names(result.profile.names.healers)} · hard CC: ${names(result.profile.names.hardCc)} · tanks: ${names(result.profile.names.tanks)}`}
                    </StatusLine>
                  ) : null}
                  <StatusLine tone="muted">
                    Rune pages come from your sample or the research sample; the source is labeled.
                  </StatusLine>
                  <StatusLine tone="muted">
                    {result.researchNote
                      ? result.researchNote
                      : result.evidence
                        ? `Research sample: ${result.evidence.region} · ${result.evidence.rankScope} · queue ${result.evidence.queueId} · ${
                            result.evidence.fallback && result.evidence.samplePatch
                              ? `from patch ${result.evidence.samplePatch}, ${formatGames(result.evidence.championGames)} games`
                              : `patch ${result.evidence.patch} · ${formatGames(result.evidence.championGames)} games on this champion/role`
                          } (not global).`
                        : 'No data yet. Start the research crawl on the Research page.'}
                  </StatusLine>
                  {result.laneEvidence ? (
                    <StatusLine>
                      {`vs ${result.laneEvidence.enemyName}: ${Math.round(
                        result.laneEvidence.winRate * 100,
                      )}% WR · ${result.laneEvidence.games} games · research sample${result.laneEvidence.games < 5 ? ' · low sample' : ''} · ${result.laneEvidence.deltaWinRate >= 0 ? '+' : ''}${(
                        result.laneEvidence.deltaWinRate * 100
                      ).toFixed(1)}pp`}
                    </StatusLine>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Suggested items
                </p>
                <BuildStrip items={[...result.core, ...result.items, ...result.boots]} />
              </div>
            </Card>

            <Card title="Core">
              <RecommendationList
                items={result.core}
                sourceLabel={researchCore ? 'research sample' : undefined}
              />
            </Card>

            <Card title="Situational">
              <RecommendationList
                items={result.items}
                sourceLabel={result.evidence ? 'research sample' : undefined}
              />
            </Card>

            <Card title="Boots">
              <RecommendationList
                items={result.boots}
                sourceLabel={result.evidence ? 'research sample' : undefined}
              />
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Purchase order (own sample)">
                <PurchaseOrderBlock data={purchaseOrder} error={purchaseOrderError} />
              </Card>

              <Card title="Skill order (own sample)">
                <SkillOrderBlock data={skillOrder} error={skillOrderError} />
              </Card>
            </div>
          </div>

          <aside className="space-y-4">
            <Card title="Matchups (own sample)">
              <MatchupBlock data={matchups} error={matchupError} />
            </Card>

            <Card title="Synergies (own sample)">
              <SynergyBlock data={synergies} error={synergyError} />
            </Card>

            <Card title="Runes">
              <RuneBlock data={runes} error={runeError} />
            </Card>

            <Card title="Personal stats">
              <PersonalStatsBlock personal={result.personal} meName={result.me.name} />
            </Card>
          </aside>
        </div>
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
