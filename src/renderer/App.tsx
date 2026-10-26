import { useEffect, useState } from 'react'
import { PatchChangesPage } from './pages/PatchChangesPage'
import { RecommendPage } from './pages/RecommendPage'

interface StaticDataStatus {
  version: string | null
  champions: number
  items: number
  fetchedAt: number | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function App() {
  const [reply, setReply] = useState('')
  const [dbInfo, setDbInfo] = useState('loading…')
  const [staticStatus, setStaticStatus] = useState<StaticDataStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [riotId, setRiotId] = useState('')
  const [account, setAccount] = useState<{ gameName: string; tagLine: string } | null>(null)
  const [matchCount, setMatchCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [matchMessage, setMatchMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  async function ping(): Promise<void> {
    const res = await window.api.invoke('app:ping', { message: 'hi' })
    setReply(res.reply)
  }

  useEffect(() => {
    window.api
      .invoke('db:info', {})
      .then((info) => {
        setDbInfo(`schema v${info.schemaVersion} · SQLite ${info.sqliteVersion}`)
      })
      .catch(() => {
        setDbInfo('db error')
      })
  }, [])

  useEffect(() => {
    window.api
      .invoke('staticData:status', {})
      .then(setStaticStatus)
      .catch(() => {
        setStaticStatus(null)
      })
  }, [])

  useEffect(() => {
    window.api
      .invoke('matches:status', {})
      .then((status) => {
        setAccount(status.account)
        setMatchCount(status.matches)
      })
      .catch(() => {
        setAccount(null)
        setMatchCount(0)
      })
  }, [])

  async function updateData(): Promise<void> {
    setUpdating(true)
    try {
      const res = await window.api.invoke('staticData:refresh', {})
      setUpdateMessage(res.fromCache ? 'up to date' : 'updated')
      setRefreshKey((value) => value + 1)
      const status = await window.api.invoke('staticData:status', {})
      setStaticStatus(status)
    } catch (error) {
      setUpdateMessage(`update failed: ${errorMessage(error)}`)
    } finally {
      setUpdating(false)
    }
  }

  async function loadMatchStatus(): Promise<void> {
    const status = await window.api.invoke('matches:status', {})
    setAccount(status.account)
    setMatchCount(status.matches)
  }

  async function saveAccount(): Promise<void> {
    setMatchMessage('')
    try {
      const res = await window.api.invoke('account:set', { riotId })
      setMatchMessage(`account set: ${res.gameName}#${res.tagLine}`)
      await loadMatchStatus()
    } catch (error) {
      setMatchMessage(`failed: ${errorMessage(error)}`)
    }
  }

  async function syncMatches(): Promise<void> {
    setSyncing(true)
    setMatchMessage('syncing… (can take a few minutes)')
    try {
      const res = await window.api.invoke('matches:sync', {})
      setMatchMessage(`saved ${res.saved}, skipped ${res.skippedExisting}, failed ${res.failed}`)
      await loadMatchStatus()
    } catch (error) {
      setMatchMessage(`failed: ${errorMessage(error)}`)
    } finally {
      setSyncing(false)
    }
  }

  const statusLine =
    staticStatus && staticStatus.version
      ? `patch ${staticStatus.version} · ${staticStatus.champions} champions · ${staticStatus.items} items`
      : 'no data yet'

  const accountLine = account
    ? `${account.gameName}#${account.tagLine} · ${matchCount} matches`
    : 'no account yet'

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-slate-100">
      <h1 className="text-3xl font-semibold">MetaMunch</h1>
      <RecommendPage refreshKey={refreshKey} />
      <PatchChangesPage />
      <button
        type="button"
        className="mt-6 rounded bg-slate-700 px-4 py-2 hover:bg-slate-600"
        onClick={() => {
          void ping()
        }}
      >
        Ping
      </button>
      <p className="mt-6">{reply}</p>
      <p className="mt-2">{dbInfo}</p>
      <div className="mt-6">
        <p>{statusLine}</p>
        <button
          type="button"
          className="mt-2 rounded bg-slate-700 px-4 py-2 hover:bg-slate-600 disabled:opacity-50"
          disabled={updating}
          onClick={() => {
            void updateData()
          }}
        >
          Update data
        </button>
        {updateMessage ? <p className="mt-2">{updateMessage}</p> : null}
      </div>
      <div className="mt-6">
        <input
          type="text"
          placeholder="Name#TAG"
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            void saveAccount()
          }}
        >
          Set account
        </button>
        <p>{accountLine}</p>
        <button
          type="button"
          disabled={syncing}
          onClick={() => {
            void syncMatches()
          }}
        >
          Sync matches
        </button>
        {matchMessage ? <p>{matchMessage}</p> : null}
      </div>
    </div>
  )
}
