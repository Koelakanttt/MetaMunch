import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChampionSelectStatus } from '@shared/champion-select'
import type { MatchupEntry, MatchupsResponse } from '@shared/matchups'
import type { MatchupEntry as PersonalMatchup, PersonalStats } from '@shared/personal'
import type {
  ChampionListResponse,
  MathBuildView,
  RecommendationView,
  RecommendResponse,
} from '@shared/recommend-api'
import type { PopularRunePage, RuneRef, RunesResponse } from '@shared/runes'
import type { ResearchFilters, ResearchTierFilter } from '@shared/research'
import type { PatchChangesResponse } from '@shared/patch-diff'
import {
  canCompareWinRates,
  DEFAULT_RESEARCH_FILTERS,
  NOT_ENOUGH_GAMES_FOR_WIN_RATES,
  RESEARCH_TIER_FILTERS,
  roleScopeLabel,
  shortTierScopeLabel,
  tierScopeLabel,
  wilsonHalfWidth,
} from '@shared/research'
import type { ResearchBuildModel } from '@shared/research-build'
import { orderBuildOptions } from '@shared/research-build'
import type { SynergiesResponse, SynergyEntry } from '@shared/synergies'
import type { PurchaseOrderResponse, SkillOrderResponse } from '@shared/timeline'
import { ROLES, type Role } from '@shared/rules'
import { wilsonInterval, wilsonLowerBound } from '@shared/research-stats'
import { ChampionPicker } from '../components/ChampionPicker'
import { ChampionIcon, ItemIcon, RuneIcon } from '../components/Icon'
import {
  Button,
  Card,
  EmptyState,
  PageLayout,
  StatusLine,
} from '../components/ui'

const TIER_LABEL: Record<ResearchTierFilter, string> = {
  diamond: 'Diamond+',
  master: 'Master+ only',
  emerald: 'Diamond+ & Emerald',
}

const RESULT_TABS = {
  situational: 'Situational vs this team',
  matchups: 'Matchups',
  synergies: 'Synergies',
  patch: 'Patch changes',
  games: 'Your games',
} as const

type ResultTab = keyof typeof RESULT_TABS

/** Win rate with its 95% Wilson interval and the number of games behind it. */
function rateLabel(wins: number, games: number): string {
  if (games <= 0) return 'no games'
  return `${Math.round((wins / games) * 100)}% ±${Math.round(wilsonHalfWidth(wins, games) * 100)}`
}

function lowerBound(item: RecommendationView): number {
  return item.evidence ? wilsonLowerBound(item.evidence.wins, item.evidence.games) : -1
}

/** Pick rate stays the default; the win-rate view is only meaningful on a large sample. */
function orderItems(
  items: RecommendationView[],
  ordering: 'pick' | 'win',
): RecommendationView[] {
  if (ordering === 'pick') return items
  return [...items].sort(
    (a, b) =>
      lowerBound(b) - lowerBound(a) ||
      (b.evidence?.games ?? 0) - (a.evidence?.games ?? 0),
  )
}

function invokeErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function recommendationLabel(item: RecommendationView): string {
  if (item.source === 'personal') return 'your build'
  if (item.source === 'research') return 'research sample'
  if (item.source === 'math') return 'math prior'
  if (item.source === 'core') return 'class core'
  return 'rules'
}

function formatGames(games: number): string {
  return games >= 1000 ? `${(games / 1000).toFixed(1)}k` : String(games)
}

function DashboardPanel({
  title,
  right,
  children,
  className = '',
}: {
  title?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`relative flex min-w-0 flex-col rounded-lg border border-slate-800 bg-slate-900/70 p-3 shadow-lg shadow-black/20 ${className}`}
    >
      {title || right ? (
        <div className="mb-2 flex items-center gap-2">
          {title ? (
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {title}
            </h2>
          ) : null}
          <div className="ml-auto">{right}</div>
        </div>
      ) : null}
      <div className="space-y-2 text-xs text-slate-200">{children}</div>
    </section>
  )
}

function ThreatChip({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'border-slate-700 bg-slate-800/60 text-slate-300',
    amber: 'border-amber-600/40 bg-amber-950/40 text-amber-300',
    rose: 'border-rose-600/40 bg-rose-950/40 text-rose-300',
    sky: 'border-sky-600/40 bg-sky-950/40 text-sky-300',
    emerald: 'border-emerald-600/40 bg-emerald-950/40 text-emerald-300',
  }
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  )
}

/** Starting items and consumables belong to the recorded opening, not the build path. */
function isStartingItem(item: RecommendationView): boolean {
  return /^(Doran|Cull|Tear of the Goddess|World Atlas|Stealth Ward|Control Ward|Oracle Lens|.*Potion|Elixir)/i.test(
    item.name,
  )
}

function PriorityList({ items }: { items: RecommendationView[] }) {
  const seen = new Set<string>()
  const entries = items
    .filter((item) => !isStartingItem(item))
    .filter((item) => {
      if (seen.has(item.name)) return false
      seen.add(item.name)
      return true
    })
  if (entries.length === 0) return <EmptyState>No algorithmic priorities yet.</EmptyState>
  return (
    <ol className="space-y-1.5">
      {entries.slice(0, 5).map((item, index) => (
        <li key={item.itemId} className="flex items-center gap-2 rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
          <span className="w-4 text-[10px] text-slate-500">{index + 1}</span>
          <ItemIcon itemId={item.itemId} name={item.name} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-slate-100">{item.name}</div>
            <div className="truncate text-[10px] text-slate-500">
              {item.reasons[0] ?? recommendationLabel(item)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function BuildDashboard({
  core,
  boots,
}: {
  core: RecommendationView[]
  boots: RecommendationView[]
}) {
  const buildCore = core.filter((item) => !isStartingItem(item))
  return (
    <div className="space-y-2">
      {buildCore.length === 0 ? (
        <EmptyState>No core items for this draft.</EmptyState>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {buildCore.map((item, index) => (
            <div key={item.itemId} className="flex shrink-0 items-center gap-1">
              <div className="w-[76px] text-center">
                <ItemIcon itemId={item.itemId} name={item.name} size={38} />
                <div className="mt-1 truncate text-[10px] text-slate-300">{item.name}</div>
                <div className="text-[10px] text-slate-500">{`${item.gold}g`}</div>
              </div>
              {index < buildCore.length - 1 ? <span className="text-slate-600">→</span> : null}
            </div>
          ))}
        </div>
      )}
      {boots.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Boots</span>
          {boots.map((item) => (
            <span key={item.itemId} className="flex items-center gap-1 text-[11px] text-slate-300">
              <ItemIcon itemId={item.itemId} name={item.name} size={24} />
              {item.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StartingItemsBlock({ data }: { data: PurchaseOrderResponse | null }) {
  const bundle = data?.startingBundles[0]
  if (!bundle) {
    return <div className="text-[10px] text-slate-500">No starting-item sample yet.</div>
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {bundle.items.map((item) => (
          <span key={item.itemId} className="flex items-center gap-1">
            <ItemIcon itemId={item.itemId} name={item.name} size={28} />
            <span className="text-[10px] text-slate-300">{item.name}</span>
          </span>
        ))}
      </div>
      <div className="text-[10px] text-slate-500">
        {`${bundle.games} games · ${Math.round((bundle.games / Math.max(1, data?.sampleMatches ?? 0)) * 100)}% pick · ${rateLabel(Math.round(bundle.winRate * bundle.games), bundle.games)} WR`}
      </div>
    </div>
  )
}

function SituationalTech({ items }: { items: RecommendationView[] }) {
  const entries = items.filter((item) => !isStartingItem(item)).slice(0, 4)
  if (entries.length === 0) return <div className="text-[10px] text-slate-500">None for this draft.</div>
  return (
    <ul className="space-y-1">
      {entries.map((item) => (
        <li key={item.itemId} className="flex items-center gap-2">
          <ItemIcon itemId={item.itemId} name={item.name} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] text-slate-200">{item.name}</div>
            <div className="truncate text-[10px] text-slate-500">
              {item.reasons[0] ?? recommendationLabel(item)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function CompactRunes({
  data,
  error,
  source,
}: {
  data: RunesResponse | null
  error: string
  source: 'global' | 'personal' | 'combined'
}) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading runes…</StatusLine>
  const ownPage = data.pages[0]
  const researchPage = data.researchPages[0]
  const page =
    source === 'personal' ? ownPage : source === 'global' ? researchPage : researchPage ?? ownPage
  if (!page) return <EmptyState>No rune sample for this source.</EmptyState>
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <RuneIcon iconPath={page.keystone.icon} name={page.keystone.name} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-slate-200">{page.keystone.name}</div>
          <div className="text-[10px] text-slate-500">
            {`${page.primaryTree.name} / ${page.secondaryTree.name} · ${rateLabel(page.wins, page.games)} WR · ${page.games}g`}
          </div>
        </div>
        {page.pickRate !== undefined ? (
          <ThreatChip tone="emerald">{`${Math.round(page.pickRate * 100)}% pick`}</ThreatChip>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Primary</div>
          <div className="flex flex-wrap gap-1">
            {page.primaryRunes.map((rune: RuneRef) => (
              <RuneIcon key={rune.id} iconPath={rune.icon} name={rune.name} size={22} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Secondary</div>
          <div className="flex flex-wrap gap-1">
            {page.secondaryRunes.map((rune: RuneRef) => (
              <RuneIcon key={rune.id} iconPath={rune.icon} name={rune.name} size={22} />
            ))}
          </div>
        </div>
      </div>
      {data.note ? <div className="text-[10px] text-slate-500">{data.note}</div> : null}
    </div>
  )
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
  const interval = wilsonInterval(evidence.wins, evidence.games)
  return `${Math.round(evidence.winRate * 100)}% ±${Math.round(((interval.high - interval.low) / 2) * 100)} · ${Math.round(
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

  return (
    <div className="space-y-2">
      <p className="font-medium">Your stats ({personal.account})</p>
      {personal.games === 0 ? (
        <StatusLine tone="muted">No games on {meName} yet.</StatusLine>
      ) : (
        <StatusLine>
          {`${meName}: ${personal.games} games, ${personal.wins} wins (${rateLabel(personal.wins, personal.games)})`}
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
              <span className={tone}>{rateLabel(entry.wins, entry.games)}</span>
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
              <span className={tone}>{rateLabel(entry.wins, entry.games)}</span>
              <span className="text-slate-500">{entry.games}g</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ChampionPatchBlock({
  data,
  error,
  championId,
  championName,
}: {
  data: PatchChangesResponse | null
  error: string
  championId: string
  championName: string
}) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading patch changes…</StatusLine>
  const entry = data.champions.find((champion) => champion.id === championId)
  const changedItems = data.items.filter((item) => item.status !== 'unchanged')
  return (
    <div className="space-y-2">
      <StatusLine tone="muted">{`Patch ${data.from ?? '?'} → ${data.to ?? '?'} · Data Dragon diff`}</StatusLine>
      {entry ? (
        <div className="space-y-1">
          {entry.changes.length === 0 ? (
            <div className="text-slate-500">{`Listed as ${entry.status} without stat or ability details.`}</div>
          ) : null}
          <ul className="space-y-1">
            {entry.changes.map((change, index) => (
              <li key={`${change.label}-${index}`} className="flex flex-wrap items-baseline gap-2">
                <span className="text-slate-400">{change.label}</span>
                <span className="text-rose-400">{change.before}</span>
                <span className="text-slate-600">→</span>
                <span className="text-emerald-400">{change.after}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-slate-500">
          {`No recorded changes for ${championName} in this patch range.`}
        </div>
      )}
      {changedItems.length > 0 ? (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Changed items
          </div>
          <div className="flex flex-wrap gap-1">
            {changedItems.slice(0, 12).map((item) => (
              <ThreatChip key={item.id}>{item.name}</ThreatChip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MathBuildBlock({ data }: { data: MathBuildView }) {
  return (
    <div className="space-y-3">
      <StatusLine tone="muted">{data.note}</StatusLine>
      <StatusLine tone="muted">
        {`Formula gold value: ${data.gold.toLocaleString()} · utility score: ${Math.round(
          data.score,
        ).toLocaleString()}`}
      </StatusLine>
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Items</p>
        <RecommendationList items={data.items} />
      </div>
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Boots</p>
        <RecommendationList items={data.boots} />
      </div>
    </div>
  )
}

function abilityTone(slot: string | null): string {
  if (slot === 'Q') return 'border-sky-500/60 bg-sky-500/15 text-sky-300'
  if (slot === 'W') return 'border-violet-500/60 bg-violet-500/15 text-violet-300'
  if (slot === 'E') return 'border-amber-500/60 bg-amber-500/15 text-amber-300'
  if (slot === 'R') return 'border-emerald-400/70 bg-emerald-400/20 text-emerald-200'
  return 'border-slate-800 bg-slate-950/60 text-slate-600'
}

function SkillOrderBlock({ data, error }: { data: SkillOrderResponse | null; error: string }) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading skill order…</StatusLine>
  if (!data.hasTimeline || data.orders.length === 0) {
    return (
      <div className="space-y-2">
        {data.note ? <StatusLine tone="muted">{data.note}</StatusLine> : null}
        <EmptyState>
          No timeline skill data for this matchup. Sync new matches or fetch timelines in Settings.
        </EmptyState>
      </div>
    )
  }

  const primary = data.orders[0]
  if (!primary) return <EmptyState>No skill level-ups in the sample.</EmptyState>
  const slots = Array.from({ length: 18 }, (_, index) => primary.slots[index] ?? null)

  return (
    <div className="space-y-3">
      {data.note ? <StatusLine tone="muted">{data.note}</StatusLine> : null}
      <StatusLine tone="muted">
        {`${data.scope === 'matchup' && data.opponentName ? `vs ${data.opponentName}` : 'Champion-wide'} · ${data.sampleMatches} matches with skill data.`}
      </StatusLine>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-9">
        {slots.map((slot, index) => {
          const level = index + 1
          const ultimate = level === 6 || level === 11 || level === 16
          return (
            <div
              key={level}
              className={`rounded-md border p-1 text-center ${abilityTone(slot)} ${
                ultimate ? 'ring-1 ring-emerald-500/40' : ''
              }`}
            >
              <div className="text-[9px] text-slate-500">Lv {level}</div>
              <div className="text-sm font-bold">{slot ?? '·'}</div>
            </div>
          )
        })}
      </div>
      <StatusLine tone="muted">
        {`${primary.wins}W ${primary.games - primary.wins}L · ${rateLabel(primary.wins, primary.games)} · ${primary.games} games`}
      </StatusLine>
      {data.orders.length > 1 ? (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Other orders</p>
          <ul className="space-y-1">
            {data.orders.slice(1).map((order) => (
              <li key={order.slots.join('')} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-slate-400">{order.slots.join(' → ')}</span>
                <span className="text-emerald-400">{rateLabel(order.wins, order.games)}</span>
                <span className="text-slate-500">{order.games}g</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function BuildOrderBlock({
  data,
  error,
  loading,
  ordering,
}: {
  data: ResearchBuildModel | null
  error: string
  loading: boolean
  ordering: 'pick' | 'win'
}) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) {
    return (
      <StatusLine tone="muted">
        {loading
          ? 'loading build order…'
          : 'No research build for this champion and role yet (or the sample is empty under the current filters).'}
      </StatusLine>
    )
  }

  const scopeLine = `${data.scope.tierScope} · patch ${data.scope.samplePatch}${
    data.scope.fallback ? ' (previous patch)' : ''
  } · ${data.scope.games} timeline games${data.scope.laneMatchup ? ' · lane matchup' : ''}`

  const useHighestWin = ordering === 'win' && data.highestWin !== null
  const core = useHighestWin ? (data.highestWin?.steps ?? []) : data.core.steps
  const coreNote = useHighestWin ? data.highestWin?.note : data.core.note
  const starting = data.starting[0]
  const firstOrder = data.skillOrders[0]

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-slate-500">{scopeLine}</div>
      {data.scope.note ? (
        <div className="text-[10px] text-amber-400">{data.scope.note}</div>
      ) : null}
      {!data.hasTimelines ? (
        <div className="space-y-1">
          <StatusLine tone="muted">{data.note}</StatusLine>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
              Final-item inclusion
            </div>
            <div className="flex flex-wrap gap-2">
              {data.finalItems.slice(0, 6).map((item) => (
                <span key={item.itemId} className="flex items-center gap-1">
                  <ItemIcon itemId={item.itemId} size={22} />
                  <span className="text-[10px] text-slate-400">
                    {`${Math.round(item.pickRate * 100)}% · ${item.games}g`}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {starting ? (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                Starting items
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {starting.itemIds.map((itemId) => (
                  <ItemIcon key={itemId} itemId={itemId} size={24} />
                ))}
                <span className="text-[10px] text-slate-500">
                  {`${starting.games} games · ${Math.round(starting.pickRate * 100)}% pick · ${rateLabel(
                    starting.wins,
                    starting.games,
                  )} WR`}
                </span>
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
              <span>{useHighestWin ? 'Core (highest win)' : 'Core (pick order)'}</span>
              <span>{`${core.length} items`}</span>
            </div>
            {core.length === 0 ? (
              <div className="text-[10px] text-slate-500">No reliable core yet.</div>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {core.map((step, index) => (
                  <span key={step.itemId} className="flex items-center gap-1">
                    <span className="flex flex-col items-center">
                      <ItemIcon itemId={step.itemId} size={32} />
                      <span className="text-[9px] text-slate-500">
                        {`${Math.round(step.pickRate * 100)}% · ${step.games}g`}
                      </span>
                    </span>
                    {index < core.length - 1 ? <span className="text-slate-600">→</span> : null}
                  </span>
                ))}
              </div>
            )}
            {coreNote ? <div className="text-[10px] text-slate-500">{coreNote}</div> : null}
            {ordering === 'win' && data.highestWin === null && data.highestWinNote ? (
              <div className="text-[10px] text-amber-400">{data.highestWinNote}</div>
            ) : null}
          </div>

          {data.laterSlots.map((slot) => (
            <div key={slot.slot}>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                {`Item ${slot.slot + 1} alternatives`}
              </div>
              <div className="flex flex-wrap gap-2">
                {orderBuildOptions(
                  slot.options,
                  ordering === 'win' && canCompareWinRates(data.scope.games) ? 'win' : 'pick',
                ).map((option) => (
                  <span key={option.itemId} className="flex items-center gap-1">
                    <ItemIcon itemId={option.itemId} size={22} />
                    <span className="text-[10px] text-slate-400">
                      {`${Math.round(option.pickRate * 100)}% · ${rateLabel(
                        option.wins,
                        option.games,
                      )} · ${option.games}g`}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div className="grid gap-1 text-[10px] text-slate-400 sm:grid-cols-2">
            <div>
              {`Skill priority: ${
                data.skillPriority
                  .map(
                    (entry) =>
                      `${entry.ability} ${Math.round(entry.pickRate * 100)}% (${entry.games}g, ${rateLabel(
                        entry.wins,
                        entry.games,
                      )})`,
                  )
                  .join(' · ') || 'no sample'
              }`}
            </div>
            <div>
              {`Spells: ${
                data.spellPairs
                  .map(
                    (entry) =>
                      `${entry.spells.join('/')} ${Math.round(entry.pickRate * 100)}% (${
                        entry.games
                      }g)`,
                  )
                  .join(' · ') || 'no sample'
              }`}
            </div>
          </div>
          {firstOrder ? (
            <div className="text-[10px] text-slate-400">
              {`Level 1-15: ${firstOrder.slots.split('').join(' → ')} · ${firstOrder.games}g · ${rateLabel(
                firstOrder.wins,
                firstOrder.games,
              )}`}
            </div>
          ) : null}
        </>
      )}
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
  const label = `${Math.round(page.winRate * 10000) / 100}% ±${Math.round(
    ((wilsonInterval(page.wins, page.games).high - wilsonInterval(page.wins, page.games).low) / 2) *
      100,
  )} Win Rate`
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

function RuneBlock({
  data,
  error,
  source,
}: {
  data: RunesResponse | null
  error: string
  source: 'global' | 'personal' | 'combined'
}) {
  if (error) return <StatusLine tone="error">error: {error}</StatusLine>
  if (!data) return <StatusLine tone="muted">loading runes…</StatusLine>
  if (!data.hasStaticData) {
    return <EmptyState>No static data. Update it in Settings to see runes.</EmptyState>
  }

  const ownPage = data.pages[0]
  const researchPage = data.researchPages[0]
  const page =
    source === 'personal' ? ownPage : source === 'global' ? researchPage : researchPage ?? ownPage
  const pageSource =
    page === researchPage ? 'research sample' : page === ownPage ? 'your sample' : ''
  const alternatives =
    page === researchPage
      ? data.researchPages.slice(1)
      : page === ownPage
        ? data.pages.slice(1)
        : []

  if (!page) {
    return (
      <>
        {data.note ? <StatusLine tone="muted">{data.note}</StatusLine> : null}
        <EmptyState>
          {source === 'global'
            ? 'No research rune sample for this champion and role yet.'
            : source === 'personal'
              ? 'No personal rune sample yet. Sync more matches with rune data.'
              : 'No data yet. Sync matches or collect a research sample to see rune pages.'}
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {data.note ? <StatusLine tone="muted">{data.note}</StatusLine> : null}
      {data.researchScope && page === researchPage ? (
        <StatusLine tone="muted">
          {`${data.researchScope.region} · ${data.researchScope.rankScope} · ${
            data.researchScope.fallback && data.researchScope.samplePatch
              ? `from patch ${data.researchScope.samplePatch}, ${formatGames(
                  data.researchScope.championGames ?? researchPage.games,
                )} games`
              : `patch ${data.researchScope.patch} · ${formatGames(
                  data.researchScope.championGames ?? researchPage.games,
                )} games`
          } (research sample)`}
        </StatusLine>
      ) : null}
      <RunePageDetail
        page={page}
        source={pageSource}
        championGames={page === researchPage ? data.researchScope?.championGames : undefined}
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
                  <span>{rateLabel(entry.wins, entry.games)}</span>
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

export function RecommendPage({
  refreshKey,
  initialChampionId = null,
  initialRole = 'TOP',
  labsEnabled = false,
}: {
  refreshKey: number
  initialChampionId?: string | null
  initialRole?: Role
  labsEnabled?: boolean
}) {
  const [championList, setChampionList] = useState<ChampionListResponse | null>(null)
  const [role, setRole] = useState<Role>(initialRole)
  const [meId, setMeId] = useState<string | null>(initialChampionId)
  const [enemyIds, setEnemyIds] = useState<(string | null)[]>([null, null, null, null, null])
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [source, setSource] = useState<'global' | 'personal' | 'combined'>('combined')
  const [filters, setFilters] = useState<ResearchFilters>(DEFAULT_RESEARCH_FILTERS)
  const [ordering, setOrdering] = useState<'pick' | 'win'>('pick')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [champSelect, setChampSelect] = useState<ChampionSelectStatus | null>(null)
  const [matchups, setMatchups] = useState<MatchupsResponse | null>(null)
  const [matchupError, setMatchupError] = useState('')
  const [synergies, setSynergies] = useState<SynergiesResponse | null>(null)
  const [synergyError, setSynergyError] = useState('')
  const [runes, setRunes] = useState<RunesResponse | null>(null)
  const [runeError, setRuneError] = useState('')
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderResponse | null>(null)
  const [skillOrder, setSkillOrder] = useState<SkillOrderResponse | null>(null)
  const [skillOrderError, setSkillOrderError] = useState('')
  const [buildModel, setBuildModel] = useState<ResearchBuildModel | null>(null)
  const [buildLoading, setBuildLoading] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [tab, setTab] = useState<ResultTab>('situational')
  const [patchData, setPatchData] = useState<PatchChangesResponse | null>(null)
  const [patchError, setPatchError] = useState('')
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
    window.api
      .invoke('settings:get', {})
      .then((prefs) => setFilters(prefs.researchFilters))
      .catch(() => undefined)
  }, [refreshKey])

  function updateFilters(next: ResearchFilters): void {
    setFilters(next)
    void window.api.invoke('settings:setResearchFilters', next).catch(() => undefined)
  }

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
      try {
        const response = await window.api.invoke('timeline:purchaseOrder', { championId })
        if (!cancelled) setPurchaseOrder(response)
      } catch {
        if (!cancelled) setPurchaseOrder(null)
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
        const response = await window.api.invoke('timeline:skillOrder', {
          championId,
          opponentId: enemyIds[0],
          source,
        })
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
  }, [resultChampionId, refreshKey, enemyIds, source])

  useEffect(() => {
    const championId = resultChampionId
    if (!championId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      setRuneError('')
      try {
        const response = await window.api.invoke('runes:popular', {
          championId,
          role,
          opponentId: enemyIds[0],
          source,
          filters,
        })
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
  }, [resultChampionId, role, enemyIds, source, filters])

  useEffect(() => {
    const championId = resultChampionId
    let cancelled = false

    const run = async (): Promise<void> => {
      if (!championId) {
        setBuildModel(null)
        setBuildError('')
        return
      }
      setBuildError('')
      setBuildLoading(true)
      setBuildModel(null)
      try {
        const response = await window.api.invoke('research:build', {
          championId,
          role,
          opponentId: enemyIds[0] ?? null,
          filters,
        })
        if (!cancelled) setBuildModel(response)
      } catch (reason) {
        if (!cancelled) {
          setBuildModel(null)
          setBuildError(invokeErrorMessage(reason))
        }
      } finally {
        if (!cancelled) setBuildLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [resultChampionId, role, enemyIds, filters])

  useEffect(() => {
    if (tab !== 'patch' || !resultChampionId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      setPatchError('')
      setPatchData(null)
      try {
        const response = await window.api.invoke('patch:changes', {})
        if (!cancelled) setPatchData(response)
      } catch (reason) {
        if (!cancelled) {
          setPatchData(null)
          setPatchError(invokeErrorMessage(reason))
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [tab, resultChampionId])

  useEffect(() => {
    if (!labsEnabled) return
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
  }, [labsEnabled])

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
          source,
          filters,
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
  }, [meId, role, enemyIds, source, filters])

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

  function clearDraft(): void {
    setMeId(null)
    setEnemyIds([null, null, null, null, null])
  }

  if (!championList) {
    return (
      <PageLayout>
        <Card title="Recommendations">
          <StatusLine tone="muted">loading…</StatusLine>
        </Card>
      </PageLayout>
    )
  }

  if (championList.version === null) {
    return (
      <PageLayout>
        <Card title="Recommendations">
          <StatusLine tone="muted">No static data yet. Press &quot;Update data&quot;.</StatusLine>
        </Card>
      </PageLayout>
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

  const metrics = result?.profile.metrics ?? null
  const threatTags = result
    ? [
        ...(metrics && metrics.adShare >= metrics.apShare
          ? ['Armor priority']
          : ['Magic resist priority']),
        ...(result.profile.names.healers.length > 0 ? ['Heavy anti-heal'] : []),
        ...(result.profile.names.hardCc.length > 0 ? ['Hard CC'] : []),
        ...(metrics && metrics.tanks > 0 ? [`${metrics.tanks} tank${metrics.tanks > 1 ? 's' : ''}`] : []),
        ...(metrics && metrics.assassins > 0 ? [`${metrics.assassins} assassin`] : []),
      ]
    : []
  const clientLabel = !champSelect
    ? 'checking'
    : champSelect.state === 'champ-select'
      ? 'connected · champ select'
      : champSelect.state === 'idle'
        ? 'connected'
        : 'not running'
  const sourceDisplay = source === 'global' ? 'research sample' : source
  const researchGames = result?.research?.games ?? 0
  const tierChip = result?.research
    ? `${shortTierScopeLabel(result.research.scope.filters)} · ${formatGames(result.research.games)} games`
    : null
  const activeOrdering =
    ordering === 'win' && canCompareWinRates(researchGames) ? 'win' : 'pick'
  const runeSourceDisplay =
    runes?.source === 'global'
      ? 'research sample'
      : runes?.source === 'personal'
        ? 'personal'
        : runes?.source === 'combined'
          ? 'combined'
          : sourceDisplay

  return (
    <section className="relative flex flex-col gap-2 p-3 lg:p-4">
      <div className="shrink-0 rounded-lg border border-slate-800 bg-slate-900/70 p-2 shadow-lg shadow-black/20">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_26px_minmax(0,1.1fr)_repeat(4,minmax(0,1fr))]">
          <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2" style={{ borderColor: 'var(--mm-accent)' }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">My pick</span>
              <ThreatChip>{role}</ThreatChip>
            </div>
            <div className="flex items-center gap-2">
              <ChampionIcon championId={meId} size={52} />
              <div className="min-w-0 flex-1">
                <ChampionPicker
                  label=""
                  champions={championList.champions}
                  value={meId}
                  onChange={setMeId}
                  exclude={enemyIds.filter((id): id is string => id !== null)}
                  showIcon={false}
                  placeholder="Select your champion"
                />
              </div>
            </div>
            {result?.research ? (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <ThreatChip tone={result.research.games < 300 ? 'amber' : 'emerald'}>
                  {`${rateLabel(result.research.wins, result.research.games)} · ${formatGames(
                    result.research.games,
                  )} games`}
                </ThreatChip>
                {result.research.games < 300 ? (
                  <ThreatChip tone="amber">small sample</ThreatChip>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="hidden items-center justify-center text-[10px] font-semibold tracking-widest text-slate-500 lg:flex">
            VS
          </div>

          <div className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Lane opponent
            </div>
            <div className="flex items-center gap-2">
              <ChampionIcon championId={enemyIds[0] ?? null} size={52} />
              <div className="min-w-0 flex-1">
                <ChampionPicker
                  label=""
                  champions={championList.champions}
                  value={enemyIds[0] ?? null}
                  onChange={(id) => setEnemy(0, id)}
                  exclude={excludeForEnemy(0)}
                  showIcon={false}
                  placeholder="Lane opponent"
                />
              </div>
            </div>
          </div>

          {otherRoles.map((otherRole, offset) => {
            const index = offset + 1
            return (
              <div key={otherRole} className="min-w-0 rounded-md border border-slate-800 bg-slate-950/50 p-2">
                <div className="mb-1 truncate text-[10px] uppercase tracking-wide text-slate-500">
                  {otherRole}
                </div>
                <div className="flex items-center gap-1.5">
                  <ChampionIcon championId={enemyIds[index] ?? null} size={30} />
                  <div className="min-w-0 flex-1">
                    <ChampionPicker
                      label=""
                      champions={championList.champions}
                      value={enemyIds[index] ?? null}
                      onChange={(id) => setEnemy(index, id)}
                      exclude={excludeForEnemy(index)}
                      showIcon={false}
                      placeholder="Enemy"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Role</span>
          {ROLES.map((value) => (
            <Button
              key={value}
              variant={role === value ? 'primary' : 'ghost'}
              className="px-2 py-1 text-[10px]"
              onClick={() => setRole(value)}
            >
              {value}
            </Button>
          ))}
          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">Statistics</span>
          {(['combined', 'global', 'personal'] as const).map((value) => (
            <Button
              key={value}
              variant={source === value ? 'primary' : 'ghost'}
              className="px-2 py-1 text-[10px]"
              onClick={() => setSource(value)}
            >
              {value === 'combined' ? 'Combined' : value === 'global' ? 'Research sample' : 'Personal'}
            </Button>
          ))}
          <div className="ml-auto flex gap-1">
            <Button
              variant="secondary"
              className="px-2 py-1 text-[10px]"
              onClick={swapLane}
              disabled={!meId || !enemyIds[0]}
            >
              ⇄ Swap lane
            </Button>
            <Button variant="ghost" className="px-2 py-1 text-[10px]" onClick={clearDraft}>
              Clear draft
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Research tiers</span>
          {RESEARCH_TIER_FILTERS.map((tier) => (
            <Button
              key={tier}
              variant={filters.tier === tier ? 'primary' : 'ghost'}
              className="px-2 py-1 text-[10px]"
              onClick={() => updateFilters({ ...filters, tier })}
            >
              {TIER_LABEL[tier]}
            </Button>
          ))}
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            <input
              type="checkbox"
              checked={filters.includeInferred}
              onChange={(event) =>
                updateFilters({ ...filters, includeInferred: event.target.checked })
              }
            />
            inferred roles
          </label>
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            <input
              type="checkbox"
              checked={filters.includeUnknownTier}
              onChange={(event) =>
                updateFilters({ ...filters, includeUnknownTier: event.target.checked })
              }
            />
            unknown tier
          </label>
          <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">
            Research order
          </span>
          <Button
            variant={ordering === 'pick' ? 'primary' : 'ghost'}
            className="px-2 py-1 text-[10px]"
            onClick={() => setOrdering('pick')}
          >
            Pick rate
          </Button>
          {canCompareWinRates(researchGames) ? (
            <Button
              variant={ordering === 'win' ? 'primary' : 'ghost'}
              className="px-2 py-1 text-[10px]"
              onClick={() => setOrdering('win')}
            >
              Highest win
            </Button>
          ) : null}
          <span className="text-[10px] text-slate-500">
            {result?.research && !canCompareWinRates(researchGames)
              ? NOT_ENOUGH_GAMES_FOR_WIN_RATES
              : `${tierScopeLabel(filters)} · ${roleScopeLabel(filters)}`}
          </span>
        </div>

        {result && metrics && metrics.enemies > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-2">
            <div className="min-w-[190px] flex-1">
              <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                <span>{`${Math.round(metrics.adShare * 100)}% physical`}</span>
                <span>{`${Math.round(metrics.apShare * 100)}% magic`}</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded bg-slate-800">
                <div className="bg-rose-500" style={{ width: `${Math.round(metrics.adShare * 100)}%` }} />
                <div className="bg-sky-500" style={{ width: `${Math.round(metrics.apShare * 100)}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {threatTags.map((tag) => (
                <ThreatChip
                  key={tag}
                  tone={tag.includes('anti-heal') ? 'rose' : tag.includes('CC') ? 'rose' : tag.includes('Armor') ? 'amber' : 'sky'}
                >
                  {tag}
                </ThreatChip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {!meId ? (
        <DashboardPanel title="Status">
          <EmptyState>Pick your champion to start.</EmptyState>
        </DashboardPanel>
      ) : loading ? (
        <div className="grid min-w-0 gap-2 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="min-h-[160px] animate-pulse rounded-lg border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : error ? (
        <DashboardPanel title="Status">
          <StatusLine tone="error">error: {error}</StatusLine>
        </DashboardPanel>
      ) : result ? (
        <div className="grid min-w-0 gap-2 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-2">
            <DashboardPanel
              title="Algorithmic priorities"
              right={tierChip ? <ThreatChip>{tierChip}</ThreatChip> : undefined}
            >
              <PriorityList items={orderItems([...result.core, ...result.items], activeOrdering)} />
            </DashboardPanel>

            <DashboardPanel title="Lane & sample">
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Lane</span>
                  <span className="truncate text-slate-200">{laneName ?? 'not selected'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Own lane record</span>
                  <span className="text-slate-200">
                    {laneRecord
                      ? `${laneRecord.wins}–${laneRecord.games - laneRecord.wins} · ${laneRecord.games}g`
                      : 'no sample'}
                  </span>
                </div>
                {result.laneEvidence ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Research matchup</span>
                    <span className="text-emerald-400">
                      {`${rateLabel(result.laneEvidence.wins, result.laneEvidence.games)} · ${result.laneEvidence.games}g`}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Source</span>
                  <span className="text-slate-200">{sourceDisplay}</span>
                </div>
                {result.research ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Tier scope</span>
                    <span
                      className="truncate text-right text-slate-200"
                      title={result.research.scope.tierScope}
                    >
                      {shortTierScopeLabel(result.research.scope.filters)}
                    </span>
                  </div>
                ) : null}
                <div className="border-t border-slate-800 pt-1 text-[10px] leading-relaxed text-slate-500">
                  {result.researchNote ??
                    (result.research
                      ? `${tierScopeLabel(result.research.scope.filters)} · ${roleScopeLabel(result.research.scope.filters)} · patch ${result.research.scope.samplePatch}${result.research.scope.fallback ? ' (previous patch)' : ''} · ${formatGames(result.research.games)} games`
                      : result.evidence
                        ? `${result.evidence.rankScope} · patch ${result.evidence.patch} · ${formatGames(result.evidence.championGames)} games`
                        : 'No research sample.')}
                </div>
                {result.research ? (
                  <div className="text-[10px] leading-relaxed text-slate-500">
                    {`${result.research.scope.excludedInferred} games excluded (inferred roles) · ${result.research.scope.excludedUnknownTier} games excluded (unknown tier)`}
                  </div>
                ) : null}
              </div>
            </DashboardPanel>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <DashboardPanel
              title="Build path"
              right={
                <div className="flex flex-wrap gap-1">
                  {tierChip ? <ThreatChip>{tierChip}</ThreatChip> : null}
                  <ThreatChip tone="emerald">{levelLabel}</ThreatChip>
                </div>
              }
            >
              <BuildDashboard core={orderItems(result.core, activeOrdering)} boots={result.boots} />
            </DashboardPanel>

            <DashboardPanel
              title="Build order (research)"
              right={tierChip ? <ThreatChip>{tierChip}</ThreatChip> : undefined}
            >
              <BuildOrderBlock
                data={buildModel}
                error={buildError}
                loading={buildLoading}
                ordering={activeOrdering}
              />
            </DashboardPanel>

            <DashboardPanel title="Starting items">
              <StartingItemsBlock data={purchaseOrder} />
            </DashboardPanel>

            <DashboardPanel
              title="Situational tech"
              right={tierChip ? <ThreatChip>{tierChip}</ThreatChip> : undefined}
            >
              <SituationalTech items={result.items} />
            </DashboardPanel>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <DashboardPanel title="Runes" right={<ThreatChip>{runeSourceDisplay}</ThreatChip>}>
              <CompactRunes data={runes} error={runeError} source={source} />
            </DashboardPanel>

            <DashboardPanel title="Skill priority">
              <SkillOrderBlock data={skillOrder} error={skillOrderError} />
            </DashboardPanel>
          </div>
        </div>
      ) : null}

      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-[10px] text-slate-500">
        <span>{`Client: ${clientLabel}`}</span>
        <span>{`Patch: ${result?.version ?? championList.version}`}</span>
        <span>{`Statistics: ${sourceDisplay}`}</span>
        <span>{`Build: ${result ? levelLabel : 'waiting'}`}</span>
        <span>{`Sample: ${tierChip ?? (result?.evidence ? `${formatGames(result.evidence.championGames)} games` : 'none')}`}</span>
      </footer>

      {result ? (
        <div className="relative z-0 flex max-h-[60vh] flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-900/50">
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-800 px-2 py-1">
            {(Object.keys(RESULT_TABS) as ResultTab[]).map((key) => (
              <Button
                key={key}
                variant={tab === key ? 'primary' : 'ghost'}
                className="px-2 py-1 text-[10px]"
                onClick={() => setTab(key)}
              >
                {RESULT_TABS[key]}
              </Button>
            ))}
          </div>
          <div className="mm-slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 text-[11px]">
            {tab === 'situational' ? (
              <div className="grid gap-2 lg:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Core</div>
                  <RecommendationList
                    items={result.core}
                    sourceLabel={researchCore ? 'research sample' : undefined}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                    Situational
                  </div>
                  <RecommendationList
                    items={result.items}
                    sourceLabel={result.evidence ? 'research sample' : undefined}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Boots</div>
                  <RecommendationList
                    items={result.boots}
                    sourceLabel={result.evidence ? 'research sample' : undefined}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                    Suggested strip
                  </div>
                  <BuildStrip items={[...result.core, ...result.items, ...result.boots]} />
                </div>
                {result.mathBuild && labsEnabled ? (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                      Experimental: item value math
                    </div>
                    <MathBuildBlock data={result.mathBuild} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {tab === 'matchups' ? (
              <MatchupBlock data={matchups} error={matchupError} />
            ) : null}
            {tab === 'synergies' ? (
              <SynergyBlock data={synergies} error={synergyError} />
            ) : null}
            {tab === 'patch' ? (
              <ChampionPatchBlock
                data={patchData}
                error={patchError}
                championId={result.me.id}
                championName={result.me.name}
              />
            ) : null}
            {tab === 'games' ? (
              <div className="grid gap-2 lg:grid-cols-2">
                <PersonalStatsBlock personal={result.personal} meName={result.me.name} />
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                    Rune pages
                  </div>
                  <RuneBlock data={runes} error={runeError} source={source} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
