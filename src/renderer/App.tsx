import { useEffect, useState } from 'react'
import { DEFAULT_REGION, regionInfo, type RegionPlatform } from '@shared/region'
import type { RiotCircuitStatus } from '@shared/riot-status'
import type { Role } from '@shared/rules'
import { DEFAULT_THEME, type ThemeId } from '@shared/theme'
import { Badge, Button } from './components/ui'
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
  | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'recommend', label: 'Recommendations' },
  { id: 'game', label: 'Game' },
  { id: 'pool', label: 'My pool' },
  { id: 'matches', label: 'Matches' },
  { id: 'stats', label: 'Stats' },
  { id: 'research', label: 'Research' },
  { id: 'patch', label: 'Patch changes' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('recommend')
  const [refreshKey, setRefreshKey] = useState(0)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
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
      })
      .catch(() => setHasKey(true))
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

  if (hasKey === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        loading…
      </div>
    )
  }

  const inSetup = !hasKey && !setupSkipped

  return (
    <div className="mm-app min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1500px]">
        <aside className="hidden w-56 shrink-0 border-r border-slate-800 bg-slate-900/70 lg:flex lg:flex-col">
          <div className="px-4 py-5">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">MetaMunch</h1>
              <Badge>alpha</Badge>
            </div>
            {!hasKey ? <Badge>static mode</Badge> : null}
          </div>

          {!inSetup ? (
            <nav className="flex flex-col gap-1 px-2">
              {TABS.map((entry) => (
                <Button
                  key={entry.id}
                  variant={tab === entry.id ? 'primary' : 'ghost'}
                  className="w-full justify-start text-left"
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </Button>
              ))}
            </nav>
          ) : null}

          <div className="mt-auto space-y-1 px-4 py-5 text-xs text-slate-500">
            <p>Better decisions.</p>
            <p>Stronger games.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-slate-800 bg-slate-900/80">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
              <h1 className="text-lg font-semibold tracking-tight lg:hidden">MetaMunch</h1>
              <Badge>alpha</Badge>
              {!hasKey ? <Badge>no key · static mode</Badge> : null}
              <span className="ml-auto text-xs text-slate-500">
                League of Legends companion · {regionInfo(region).label}
              </span>
            </div>

            {!inSetup ? (
              <nav className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
                {TABS.map((entry) => (
                  <Button
                    key={entry.id}
                    variant={tab === entry.id ? 'primary' : 'secondary'}
                    className="shrink-0"
                    onClick={() => setTab(entry.id)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </nav>
            ) : null}
          </header>

          {riotStatus?.state === 'open' ? (
            <div className="border-b border-amber-700/60 bg-amber-950/50 px-4 py-3 text-sm text-amber-200 lg:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <strong>Riot API unreachable, background jobs paused.</strong>
                <span className="text-amber-300/80">
                  Sync, timelines and research will not retry until you resume them.
                </span>
                <Button
                  variant="secondary"
                  className="ml-auto shrink-0"
                  onClick={() => {
                    void retryRiot()
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : null}

          <main className="px-4 py-5 lg:px-6">
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
                {tab === 'recommend' ? (
                  <RecommendPage
                    refreshKey={refreshKey}
                    initialChampionId={focus?.championId ?? null}
                    initialRole={focus?.role ?? 'TOP'}
                  />
                ) : null}
                {tab === 'game' ? <GamePage /> : null}
                {tab === 'pool' ? (
                  <PoolPage refreshKey={refreshKey} onSelectChampion={openRecommendations} />
                ) : null}
                {tab === 'matches' ? (
                  <MatchHistoryPage
                    refreshKey={refreshKey}
                    onSelectChampion={openRecommendations}
                  />
                ) : null}
                {tab === 'stats' ? <StatsPage refreshKey={refreshKey} /> : null}
                {tab === 'research' ? <ResearchPage /> : null}
                {tab === 'patch' ? <PatchChangesPage /> : null}
                {tab === 'settings' ? (
                  <SettingsPage
                    onKeySaved={() => setHasKey(true)}
                    onDataUpdated={bump}
                    onAccountChanged={bump}
                    onRegionChanged={setRegion}
                    onThemeChanged={setTheme}
                  />
                ) : null}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
