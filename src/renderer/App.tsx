import { useEffect, useState } from 'react'

interface StaticDataStatus {
  version: string | null
  champions: number
  items: number
  fetchedAt: number | null
}

export default function App() {
  const [reply, setReply] = useState('')
  const [dbInfo, setDbInfo] = useState('loading…')
  const [staticStatus, setStaticStatus] = useState<StaticDataStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')

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

  async function updateData(): Promise<void> {
    setUpdating(true)
    try {
      const res = await window.api.invoke('staticData:refresh', {})
      setUpdateMessage(res.fromCache ? 'up to date' : 'updated')
      const status = await window.api.invoke('staticData:status', {})
      setStaticStatus(status)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setUpdateMessage(`update failed: ${message}`)
    } finally {
      setUpdating(false)
    }
  }

  const statusLine =
    staticStatus && staticStatus.version
      ? `patch ${staticStatus.version} · ${staticStatus.champions} champions · ${staticStatus.items} items`
      : 'no data yet'

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-slate-100">
      <h1 className="text-3xl font-semibold">MetaMunch</h1>
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
    </div>
  )
}
