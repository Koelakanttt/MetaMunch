import { useEffect, useState } from 'react'
import { DEFAULT_REGION, regionInfo, type RegionPlatform } from '@shared/region'
import type { Role } from '@shared/rules'
import { DEFAULT_THEME, type ThemeId } from '@shared/theme'
import { Badge, Button } from './components/ui'
import { GamePage } from './pages/GamePage'
import { MatchHistoryPage } from './pages/MatchHistoryPage'
import { PatchChangesPage } from './pages/PatchChangesPage'
import { PoolPage } from './pages/PoolPage'
import { RecommendPage } from './pages/RecommendPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'

type Tab = 'recommend' | 'game' | 'pool' | 'matches' | 'stats' | 'patch' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'recommend', label: 'Recommendations' },
  { id: 'game', label: 'Game' },
  { id: 'pool', label: 'My pool' },
  { id: 'matches', label: 'Matches' },
  { id: 'stats', label: 'Stats' },
  { id: 'patch', label: 'Patch changes' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('recommend')
  const [refreshKey, setRefreshKey] = useState(0)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [region, setRegion] = useState<RegionPlatform>(DEFAULT_REGION)
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME)
  const [focus, setFocus] = useState<{ championId: string; role?: Role } | null>(null)

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
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

  const bump = (): void => setRefreshKey((value) => value + 1)

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

  return (
    <div className="mm-app min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">MetaMunch</h1>
          <Badge>alpha</Badge>
          <span className="ml-auto text-xs text-slate-500">
            League of Legends companion · {regionInfo(region).label}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {!hasKey ? (
          <SettingsPage
            setup
            onKeySaved={() => setHasKey(true)}
            onDataUpdated={bump}
            onAccountChanged={bump}
            onRegionChanged={setRegion}
            onThemeChanged={setTheme}
          />
        ) : (
          <>
            <nav className="mb-5 flex flex-wrap gap-2">
              {TABS.map((entry) => (
                <Button
                  key={entry.id}
                  variant={tab === entry.id ? 'primary' : 'secondary'}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </Button>
              ))}
            </nav>

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
              <MatchHistoryPage refreshKey={refreshKey} onSelectChampion={openRecommendations} />
            ) : null}
            {tab === 'stats' ? <StatsPage refreshKey={refreshKey} /> : null}
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
  )
}
