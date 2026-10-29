import { useEffect, useState } from 'react'
import { DEFAULT_REGION, REGIONS, regionInfo, type RegionPlatform } from '@shared/region'
import { THEMES, DEFAULT_THEME, type ThemeId } from '@shared/theme'
import { Badge, Button, Card, Label, Select, StatusLine, TextInput } from '../components/ui'

interface SettingsStatus {
  hasRiotKey: boolean
  keySource: 'stored' | 'env' | null
  region: RegionPlatform
  leaguePath: string | null
  externalStatsEnabled: boolean
  theme: ThemeId
}

interface StaticStatus {
  version: string | null
  champions: number
  items: number
  fetchedAt: number | null
}

interface MatchStatus {
  account: { gameName: string; tagLine: string } | null
  matches: number
  lastGameCreation: number | null
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

export function SettingsPage({
  setup = false,
  onSkip,
  onKeySaved,
  onDataUpdated,
  onAccountChanged,
  onRegionChanged,
  onThemeChanged,
}: {
  setup?: boolean
  onSkip?: () => void
  onKeySaved: () => void
  onDataUpdated: () => void
  onAccountChanged: () => void
  onRegionChanged: (region: RegionPlatform) => void
  onThemeChanged: (theme: ThemeId) => void
}) {
  const [settings, setSettings] = useState<SettingsStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyMessage, setKeyMessage] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  const [regionDraft, setRegionDraft] = useState<RegionPlatform>(DEFAULT_REGION)
  const [regionMessage, setRegionMessage] = useState('')
  const [savingRegion, setSavingRegion] = useState(false)

  const [leaguePathDraft, setLeaguePathDraft] = useState('')
  const [leaguePathMessage, setLeaguePathMessage] = useState('')
  const [savingLeaguePath, setSavingLeaguePath] = useState(false)
  const [savingStatsSource, setSavingStatsSource] = useState(false)
  const [statsSourceMessage, setStatsSourceMessage] = useState('')
  const [savingTheme, setSavingTheme] = useState(false)
  const [themeMessage, setThemeMessage] = useState('')

  const [staticStatus, setStaticStatus] = useState<StaticStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')

  const [matchStatus, setMatchStatus] = useState<MatchStatus | null>(null)
  const [riotId, setRiotId] = useState('')
  const [accountMessage, setAccountMessage] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [timelineMessage, setTimelineMessage] = useState('')

  const [dbInfo, setDbInfo] = useState('')

  useEffect(() => {
    window.api
      .invoke('settings:get', {})
      .then((status) => {
        setSettings(status)
        setRegionDraft(status.region)
        setLeaguePathDraft(status.leaguePath ?? '')
      })
      .catch(() => setSettings(null))
    window.api
      .invoke('staticData:status', {})
      .then(setStaticStatus)
      .catch(() => setStaticStatus(null))
    window.api
      .invoke('matches:status', {})
      .then(setMatchStatus)
      .catch(() => setMatchStatus(null))
    window.api
      .invoke('db:info', {})
      .then((info) =>
        setDbInfo(
          `MetaMunch ${info.appVersion} · schema v${info.schemaVersion} · SQLite ${info.sqliteVersion}`,
        ),
      )
      .catch(() => setDbInfo('database unavailable'))
  }, [])

  async function saveKey(): Promise<void> {
    setSavingKey(true)
    setKeyMessage('')
    try {
      await window.api.invoke('settings:setRiotKey', { key: keyInput })
      setKeyInput('')
      setKeyMessage('API key saved. It is stored encrypted on this device.')
      setSettings(await window.api.invoke('settings:get', {}))
      onKeySaved()
    } catch (error) {
      setKeyMessage(`failed: ${errorMessage(error)}`)
    } finally {
      setSavingKey(false)
    }
  }

  async function saveRegion(): Promise<void> {
    setSavingRegion(true)
    setRegionMessage('')
    try {
      await window.api.invoke('settings:setRegion', { region: regionDraft })
      const next = await window.api.invoke('settings:get', {})
      setSettings(next)
      setRegionDraft(next.region)
      setRegionMessage(`region saved: ${regionInfo(next.region).label}`)
      onRegionChanged(next.region)
    } catch (error) {
      setRegionMessage(`failed: ${errorMessage(error)}`)
    } finally {
      setSavingRegion(false)
    }
  }

  async function saveLeaguePath(): Promise<void> {
    setSavingLeaguePath(true)
    setLeaguePathMessage('')
    try {
      await window.api.invoke('settings:setLeaguePath', { path: leaguePathDraft })
      const next = await window.api.invoke('settings:get', {})
      setSettings(next)
      setLeaguePathDraft(next.leaguePath ?? '')
      setLeaguePathMessage(next.leaguePath ? 'League folder saved.' : 'Auto-detect enabled.')
    } catch (error) {
      setLeaguePathMessage(`failed: ${errorMessage(error)}`)
    } finally {
      setSavingLeaguePath(false)
    }
  }

  async function changeTheme(next: ThemeId): Promise<void> {
    setSavingTheme(true)
    setThemeMessage('')
    try {
      await window.api.invoke('settings:setTheme', { theme: next })
      const status = await window.api.invoke('settings:get', {})
      setSettings(status)
      onThemeChanged(status.theme)
    } catch (error) {
      setThemeMessage(`failed: ${errorMessage(error)}`)
    } finally {
      setSavingTheme(false)
    }
  }

  async function toggleExternalStats(): Promise<void> {
    setSavingStatsSource(true)
    setStatsSourceMessage('')
    try {
      await window.api.invoke('settings:setExternalStats', {
        enabled: !settings?.externalStatsEnabled,
      })
      setSettings(await window.api.invoke('settings:get', {}))
    } catch (error) {
      setStatsSourceMessage(`failed: ${errorMessage(error)}`)
    } finally {
      setSavingStatsSource(false)
    }
  }

  async function updateData(): Promise<void> {
    setUpdating(true)
    setUpdateMessage('')
    try {
      const res = await window.api.invoke('staticData:refresh', {})
      setUpdateMessage(res.fromCache ? 'up to date' : 'updated')
      setStaticStatus(await window.api.invoke('staticData:status', {}))
      onDataUpdated()
    } catch (error) {
      setUpdateMessage(`update failed: ${errorMessage(error)}`)
    } finally {
      setUpdating(false)
    }
  }

  async function loadMatchStatus(): Promise<void> {
    setMatchStatus(await window.api.invoke('matches:status', {}))
  }

  async function backfillTimelines(): Promise<void> {
    setBackfilling(true)
    setTimelineMessage('')
    try {
      const res = await window.api.invoke('matches:backfillTimelines', {})
      setTimelineMessage(
        `timelines: ${res.saved} saved of ${res.requested}${res.failed > 0 ? `, ${res.failed} failed` : ''}`,
      )
      onAccountChanged()
    } catch (error) {
      setTimelineMessage(`timeline fetch failed: ${errorMessage(error)}`)
    } finally {
      setBackfilling(false)
    }
  }

  async function saveAccount(): Promise<void> {
    setAccountMessage('')
    try {
      const res = await window.api.invoke('account:set', { riotId })
      setAccountMessage(`account set: ${res.gameName}#${res.tagLine}`)
      await loadMatchStatus()
      onAccountChanged()
    } catch (error) {
      setAccountMessage(`failed: ${errorMessage(error)}`)
    }
  }

  async function syncMatches(): Promise<void> {
    setSyncing(true)
    setAccountMessage('syncing… (can take a few minutes)')
    try {
      const res = await window.api.invoke('matches:sync', {})
      setAccountMessage(`saved ${res.saved}, skipped ${res.skippedExisting}, failed ${res.failed}`)
      await loadMatchStatus()
      onAccountChanged()
    } catch (error) {
      setAccountMessage(`failed: ${errorMessage(error)}`)
    } finally {
      setSyncing(false)
    }
  }

  const keyLine =
    settings === null
      ? 'checking…'
      : settings.hasRiotKey
        ? `set (${settings.keySource === 'stored' ? 'saved on this device' : 'from RIOT_API_KEY'})`
        : 'not set'

  const staticLine =
    staticStatus && staticStatus.version
      ? `patch ${staticStatus.version} · ${staticStatus.champions} champions · ${staticStatus.items} items`
      : 'no data yet'

  const accountLine = matchStatus?.account
    ? `${matchStatus.account.gameName}#${matchStatus.account.tagLine} · ${matchStatus.matches} matches`
    : 'no account yet'

  const keyCard = (
    <Card title="Riot API key">
      <StatusLine tone={settings?.hasRiotKey ? 'success' : 'muted'}>API key: {keyLine}</StatusLine>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <Label>{settings?.hasRiotKey ? 'Replace key' : 'Paste key'}</Label>
          <TextInput
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder="RGAPI-…"
            autoComplete="off"
          />
        </label>
        <Button
          onClick={() => {
            void saveKey()
          }}
          disabled={savingKey || keyInput.trim() === ''}
        >
          {savingKey ? 'saving…' : 'Save key'}
        </Button>
      </div>
      {keyMessage ? <StatusLine tone={keyMessage.startsWith('failed') ? 'error' : 'success'}>{keyMessage}</StatusLine> : null}
      <StatusLine tone="muted">
        Development keys expire every 24 hours. The key is encrypted with the operating system
        keystore and is never written to logs or sent anywhere except Riot.
      </StatusLine>
    </Card>
  )

  const regionCard = (
    <Card title="Region">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <Label>Server</Label>
          <Select
            value={regionDraft}
            onChange={(event) => setRegionDraft(event.target.value as RegionPlatform)}
          >
            {REGIONS.map((region) => (
              <option key={region.platform} value={region.platform}>
                {region.label} ({region.platform})
              </option>
            ))}
          </Select>
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            void saveRegion()
          }}
          disabled={savingRegion || regionDraft === settings?.region}
        >
          {savingRegion ? 'saving…' : 'Save region'}
        </Button>
      </div>
      {regionMessage ? (
        <StatusLine tone={regionMessage.startsWith('failed') ? 'error' : 'success'}>
          {regionMessage}
        </StatusLine>
      ) : null}
      <StatusLine tone="muted">
        Region affects Riot ID lookups and match syncs. Static data is the same everywhere. After
        switching servers, set your Riot ID again.
      </StatusLine>
    </Card>
  )

  const leagueCard = (
    <Card title="League client">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <Label>League of Legends folder</Label>
          <TextInput
            value={leaguePathDraft}
            onChange={(event) => setLeaguePathDraft(event.target.value)}
            placeholder="C:\Riot Games\League of Legends"
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            void saveLeaguePath()
          }}
          disabled={
            savingLeaguePath || leaguePathDraft.trim() === (settings?.leaguePath ?? '')
          }
        >
          {savingLeaguePath ? 'saving…' : 'Save path'}
        </Button>
      </div>
      {leaguePathMessage ? (
        <StatusLine tone={leaguePathMessage.startsWith('failed') ? 'error' : 'success'}>
          {leaguePathMessage}
        </StatusLine>
      ) : null}
      <StatusLine tone="muted">
        Folder that contains the League client lockfile. Leave empty to auto-detect common install
        locations. MetaMunch only reads champion select, never sends clicks or input.
      </StatusLine>
    </Card>
  )

  const statsSourceCard = (
    <Card title="Statistics source">
      <StatusLine>
        {`External statistics: ${
          settings?.externalStatsEnabled ? 'enabled (falls back to own sample)' : 'disabled'
        }`}
      </StatusLine>
      <Button
        variant="secondary"
        onClick={() => {
          void toggleExternalStats()
        }}
        disabled={savingStatsSource}
      >
        {settings?.externalStatsEnabled ? 'Disable external source' : 'Enable external source'}
      </Button>
      <StatusLine tone="muted">
        No external statistics source is configured yet. The switch reserves the setting; the app
        keeps using your own sample and falls back automatically when a source is added.
      </StatusLine>
      {statsSourceMessage ? (
        <StatusLine tone="error">{statsSourceMessage}</StatusLine>
      ) : null}
    </Card>
  )

  const themeCard = (
    <Card title="Theme">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <Label>Theme</Label>
          <Select
            value={settings?.theme ?? DEFAULT_THEME}
            onChange={(event) => {
              void changeTheme(event.target.value as ThemeId)
            }}
            disabled={savingTheme}
          >
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {themeMessage ? <StatusLine tone="error">{themeMessage}</StatusLine> : null}
      <StatusLine tone="muted">
        Themes change colors, backgrounds, fonts and corner styles. Add a theme by copying a
        [data-theme] block in src/renderer/index.css.
      </StatusLine>
    </Card>
  )

  const legalCard = (
    <Card title="Legal">
      <p className="text-slate-400">
        MetaMunch isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions
        of Riot Games or anyone officially involved in producing or managing Riot Games properties.
        Riot Games, and all associated properties are trademarks or registered trademarks of Riot
        Games, Inc.
      </p>
      <p className="text-slate-500">
        MetaMunch is free, open-source software under the MIT license. It is read-only, stores your
        data locally, and has no telemetry, advertising or monetization. Source:
        github.com/Koelakanttt/MetaMunch
      </p>
    </Card>
  )

  if (setup) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card title="Welcome to MetaMunch">
          <p>
            MetaMunch shows recommended items for your champion and tracks your personal record
            from public Riot data.
          </p>
          <p className="text-slate-400">
            You can use static champion recommendations and the local game companion without a Riot
            API key. Add a key later to sync your own matches and enable personal statistics.
          </p>
        </Card>
        {keyCard}
        {regionCard}
        {leagueCard}
        {statsSourceCard}
        {themeCard}
        {legalCard}
        {onSkip ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={onSkip}>
              Continue without a Riot API key
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Settings</h2>
        <Badge>local data only</Badge>
      </div>

      {keyCard}

      {regionCard}

      {leagueCard}

      {statsSourceCard}

      {themeCard}

      <Card title="Riot account">
        <StatusLine tone={matchStatus?.account ? 'default' : 'muted'}>
          Account: {accountLine}
        </StatusLine>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <Label>Riot ID</Label>
            <TextInput
              value={riotId}
              onChange={(event) => setRiotId(event.target.value)}
              placeholder="Name#TAG"
            />
          </label>
          <Button
            variant="secondary"
            onClick={() => {
              void saveAccount()
            }}
            disabled={riotId.trim() === '' || !settings?.hasRiotKey}
          >
            Set account
          </Button>
          <Button
            onClick={() => {
              void syncMatches()
            }}
            disabled={syncing || !matchStatus?.account}
          >
            {syncing ? 'syncing…' : 'Sync matches'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void backfillTimelines()
            }}
            disabled={backfilling || !matchStatus?.account || !settings?.hasRiotKey}
          >
            {backfilling ? 'fetching timelines…' : 'Fetch timelines'}
          </Button>
        </div>
        {timelineMessage ? <StatusLine tone="muted">{timelineMessage}</StatusLine> : null}
        {accountMessage ? (
          <StatusLine tone={accountMessage.startsWith('failed') ? 'error' : 'default'}>
            {accountMessage}
          </StatusLine>
        ) : null}
        <StatusLine tone="muted">
          Only Summoner&apos;s Rift queues (normal, ranked solo, ranked flex) are counted. ARAM and
          remakes are ignored.
        </StatusLine>
        {!settings?.hasRiotKey ? (
          <StatusLine tone="muted">
            Add a Riot API key above to sync matches and enable personal statistics.
          </StatusLine>
        ) : null}
      </Card>

      <Card title="Data Dragon">
        <StatusLine>{staticLine}</StatusLine>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void updateData()
            }}
            disabled={updating}
          >
            {updating ? 'updating…' : 'Update data'}
          </Button>
          {updateMessage ? <StatusLine tone="muted">{updateMessage}</StatusLine> : null}
        </div>
        <StatusLine tone="muted">
          The patch is checked automatically on every launch; this button forces a refresh.
        </StatusLine>
      </Card>

      <Card title="Diagnostics">
        <StatusLine tone="muted">{dbInfo || 'checking…'}</StatusLine>
        <StatusLine tone="muted">
          All data stays on this computer in the app data folder. No telemetry, no analytics.
        </StatusLine>
      </Card>

      {legalCard}
    </div>
  )
}
