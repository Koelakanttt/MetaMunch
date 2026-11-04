import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_REGION, regionInfo, type RegionPlatform } from '@shared/region'
import type { RiotCircuitStatus } from '@shared/riot-status'
import type { Role } from '@shared/rules'
import { DEFAULT_THEME, type ThemeId } from '@shared/theme'
import { Badge, Button, cx } from './components/ui'
import { AboutPage, DisclaimerDialog } from './components/DisclaimerDialog'
import { GamePage } from './pages/GamePage'
import { MatchHistoryPage } from './pages/MatchHistoryPage'
import { PatchChangesPage } from './pages/PatchChangesPage'
import { PoolPage } from './pages/PoolPage'
import { RecommendPage } from './pages/RecommendPage'
import { ResearchPage } from './pages/ResearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'

type Tab =
  | 'recommend'
  | 'game'
  | 'pool'
  | 'matches'
  | 'stats'
  | 'research'
  | 'patch'
  | 'about'
  | 'settings'

interface TabEntry {
  id: Tab
  label: string
}

const TAB_GROUPS: { label: string; items: TabEntry[] }[] = [
  {
    label: 'Play',
    items: [
      { id: 'recommend', label: 'Recommendations' },
      { id: 'game', label: 'Game' },
    ],
  },
  {
    label: 'Your data',
    items: [
      { id: 'pool', label: 'My pool' },
      { id: 'matches', label: 'Matches' },
      { id: 'stats', label: 'Stats' },
    ],
  },
  {
    label: 'Research',
    items: [
      { id: 'research', label: 'Research' },
      { id: 'patch', label: 'Patch changes' },
    ],
  },
  {
    label: 'App',
    items: [
      { id: 'about', label: 'About / Legal' },
      { id: 'settings', label: 'Settings' },
    ],
  },
]

const ALL_TABS: TabEntry[] = TAB_GROUPS.flatMap((group) => group.items)

export default function App() {
  const [tab, setTab] = useState<Tab>('recommend')
  const [refreshKey, setRefreshKey] = useState(0)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [labsEnabled, setLabsEnabled] = useState(false)
  const [disclaimerAcknowledged, setDisclaimerAcknowledged] = useState(true)
  const [setupSkipped, setSetupSkipped] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('metamunch.setupSkipped') === '1'
    } catch {
      return false
    }
  })
  const [region, setRegion] = useState<RegionPlatform>(DEFAULT_REGION)
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME)
  const [focus, setFocus] = useState<{ championId: string; role?: Role } | null>(null)
  const [riotStatus, setRiotStatus] = useState<RiotCircuitStatus | null>(null)

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    const background =
      theme === 'reforged'
        ? `url("${new URL('./themes/reforged/background.webp', window.location.href).toString()}")`
        : 'none'
    document.documentElement.style.setProperty('--mm-bg-image', background)
  }, [theme])

  useEffect(() => {
    window.api
      .invoke('settings:get', {})
      .then((status) => {
        setHasKey(status.hasRiotKey)
        setRegion(status.region)
        setTheme(status.theme)
        setLabsEnabled(status.labsEnabled)
        setDisclaimerAcknowledged(status.disclaimerAcknowledged)
        setSettingsLoaded(true)
      })
      .catch(() => {
        setHasKey(true)
        setSettingsLoaded(true)
      })
  }, [])

  useEffect(() => {
    return window.api.onStaticDataUpdated(() => setRefreshKey((value) => value + 1))
  }, [])

  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      try {
        const status = await window.api.invoke('riot:status', {})
        if (!cancelled) setRiotStatus(status)
      } catch {
        // The banner is optional; a status failure must not break the app.
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const bump = (): void => setRefreshKey((value) => value + 1)

  const retryRiot = async (): Promise<void> => {
    try {
      setRiotStatus(await window.api.invoke('riot:retry', {}))
    } catch {
      // Keep the existing banner state if the retry IPC fails.
    }
  }

  const skipSetup = (): void => {
    try {
      window.localStorage.setItem('metamunch.setupSkipped', '1')
    } catch {
      // Local storage is optional; the session still works without it.
    }
    setSetupSkipped(true)
  }

  const openRecommendations = (championId: string, role?: Role): void => {
    setFocus({ championId, role })
    setTab('recommend')
  }

  if (hasKey === null || !settingsLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        loading…
      </div>
    )
  }

  const inSetup = !hasKey && !setupSkipped
  const currentTab: Tab = tab === 'game' && !labsEnabled ? 'recommend' : tab
  const currentEntry: TabEntry =
    ALL_TABS.find((entry) => entry.id === currentTab) ?? {
      id: 'recommend',
      label: 'Recommendations',
    }
  const visibleGroups = TAB_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((entry) => entry.id !== 'game' || labsEnabled),
  })).filter((group) => group.items.length > 0)

  const navButton = (entry: TabEntry, mobile = false): ReactNode => (
    <button
      key={entry.id}
      type="button"
      onClick={() => setTab(entry.id)}
      aria-current={currentTab === entry.id ? 'page' : undefined}
      className={cx(
        'rounded-md text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400',
        mobile ? 'shrink-0 px-3 py-1.5 text-xs' : 'w-full px-3 py-1.5 text-sm',
        currentTab === entry.id
          ? 'bg-indigo-500/15 font-medium text-indigo-200 ring-1 ring-inset ring-indigo-500/40'
          : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200',
      )}
    >
      {entry.label}
    </button>
  )

  const statusChips = (
    <>
      <Badge>alpha</Badge>
      {!hasKey ? <Badge tone="warning">static mode</Badge> : null}
      {labsEnabled ? <Badge tone="accent">Labs</Badge> : null}
    </>
  )

  return (
    <div className="mm-app flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/70 lg:flex">
        <div className="shrink-0 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">MetaMunch</span>
            <Badge>alpha</Badge>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Read-only companion · {regionInfo(region).label}
          </p>
        </div>

        {!inSetup ? (
          <nav className="mm-slim-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {visibleGroups.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  {group.label}
                </div>
                <div className="space-y-0.5">{group.items.map((entry) => navButton(entry))}</div>
              </div>
            ))}
          </nav>
        ) : null}

        <div className="shrink-0 space-y-1 border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500">
          <p>{hasKey ? 'Riot key stored locally' : 'No Riot key · static mode'}</p>
          <p>{labsEnabled ? 'Labs features enabled' : 'Labs features off'}</p>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-slate-800 bg-slate-900/80">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 font-semibold tracking-tight text-slate-100 lg:hidden">
                MetaMunch
              </span>
              <span className="hidden shrink-0 text-slate-600 lg:inline">/</span>
              <span className="truncate text-sm font-semibold tracking-tight text-slate-100">
                {inSetup ? 'Set up MetaMunch' : currentEntry.label}
              </span>
              <span className="hidden text-xs text-slate-500 sm:inline">
                {regionInfo(region).label}
              </span>
            </div>
            <div className="flex items-center gap-2">{statusChips}</div>
            <Button
              variant="ghost"
              className="shrink-0 px-2 py-1 text-[11px]"
              onClick={bump}
              title="Reload this page's data"
            >
              Refresh
            </Button>
          </div>

          {!inSetup ? (
            <nav className="mm-slim-scroll flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
              {visibleGroups.flatMap((group) => group.items).map((entry) => navButton(entry, true))}
            </nav>
          ) : null}
        </header>

        {riotStatus?.state === 'open' ? (
          <div className="shrink-0 border-b border-amber-700/60 bg-amber-950/50 px-4 py-2.5 text-sm text-amber-200 lg:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <strong>Riot API unreachable, background jobs paused.</strong>
              <span className="text-amber-300/80">
                Sync, timelines and research will not retry until you resume them.
              </span>
              <Button
                variant="secondary"
                className="ml-auto shrink-0 px-3 py-1"
                onClick={() => {
                  void retryRiot()
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        <main className="mm-slim-scroll min-h-0 flex-1 overflow-y-auto">
          {inSetup ? (
            <SettingsPage
              setup
              onSkip={skipSetup}
              onKeySaved={() => setHasKey(true)}
              onDataUpdated={bump}
              onAccountChanged={bump}
              onRegionChanged={setRegion}
              onThemeChanged={setTheme}
            />
          ) : (
            <>
              {currentTab === 'recommend' ? (
                <RecommendPage
                  refreshKey={refreshKey}
                  initialChampionId={focus?.championId ?? null}
                  initialRole={focus?.role ?? 'TOP'}
                  labsEnabled={labsEnabled}
                />
              ) : null}
              {currentTab === 'game' && labsEnabled ? <GamePage /> : null}
              {currentTab === 'pool' ? (
                <PoolPage refreshKey={refreshKey} onSelectChampion={openRecommendations} />
              ) : null}
              {currentTab === 'matches' ? (
                <MatchHistoryPage refreshKey={refreshKey} onSelectChampion={openRecommendations} />
              ) : null}
              {currentTab === 'stats' ? <StatsPage refreshKey={refreshKey} /> : null}
              {currentTab === 'research' ? <ResearchPage labsEnabled={labsEnabled} /> : null}
              {currentTab === 'patch' ? <PatchChangesPage /> : null}
              {currentTab === 'about' ? <AboutPage /> : null}
              {currentTab === 'settings' ? (
                <SettingsPage
                  onKeySaved={() => setHasKey(true)}
                  onDataUpdated={bump}
                  onAccountChanged={bump}
                  onRegionChanged={setRegion}
                  onThemeChanged={setTheme}
                  onLabsChanged={setLabsEnabled}
                />
              ) : null}
            </>
          )}
        </main>
      </div>
      {!disclaimerAcknowledged ? (
        <DisclaimerDialog onAcknowledged={() => setDisclaimerAcknowledged(true)} />
      ) : null}
    </div>
  )
}
