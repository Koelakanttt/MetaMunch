import { useEffect, useState } from 'react'
import { Badge, Card, PageHeader, PageLayout, StatusLine } from './ui'

const DISCLAIMER =
  "MetaMunch isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."

interface AppInfo {
  appVersion: string
  dataPath: string
  schemaVersion: number
}

export function AboutPage() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api
      .invoke('db:info', {})
      .then((value) =>
        setInfo({
          appVersion: value.appVersion,
          dataPath: value.dataPath,
          schemaVersion: value.schemaVersion,
        }),
      )
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  return (
    <PageLayout>
      <PageHeader
        title="About / Legal"
        subtitle="Policy links, app information and where your data lives."
        badges={<Badge>unofficial</Badge>}
      />
      <Card title="Riot Games notice">
        <p className="text-sm leading-relaxed text-slate-300">{DISCLAIMER}</p>
        {error ? <StatusLine tone="error">error: {error}</StatusLine> : null}
        {info ? (
          <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
            <div>{`Version: ${info.appVersion}`}</div>
            <div>{`Schema: ${info.schemaVersion}`}</div>
            <div className="break-all sm:col-span-2">{`Data folder: ${info.dataPath}`}</div>
          </div>
        ) : (
          <StatusLine tone="muted">loading app information…</StatusLine>
        )}
        <div className="space-y-1 text-xs text-slate-400">
          <p>All data stays on this computer. No telemetry, no analytics, no sharing.</p>
          <p>MetaMunch is read-only: it never reads game memory or automates the client.</p>
        </div>
      </Card>
      <Card title="Policy pages">
        <div className="flex flex-wrap gap-3 text-xs text-indigo-400">
          <a href="https://developer.riotgames.com/policies/general" target="_blank" rel="noreferrer">
            Riot General Policies
          </a>
          <a
            href="https://support-developer.riotgames.com/hc/en-us/articles/22698698001939-League-of-Legends"
            target="_blank"
            rel="noreferrer"
          >
            League of Legends Developer Policy
          </a>
          <a href="https://developer.riotgames.com/terms" target="_blank" rel="noreferrer">
            API Terms
          </a>
        </div>
      </Card>
    </PageLayout>
  )
}

export function DisclaimerDialog({ onAcknowledged }: { onAcknowledged: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function acknowledge(): Promise<void> {
    setSaving(true)
    setError('')
    try {
      await window.api.invoke('settings:ackDisclaimer', {})
      onAcknowledged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100">Before you continue</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{DISCLAIMER}</p>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          MetaMunch is read-only and stores data locally. It is not endorsed by Riot Games.
        </p>
        {error ? <p className="mt-3 text-xs text-rose-400">error: {error}</p> : null}
        <button
          type="button"
          onClick={() => void acknowledge()}
          disabled={saving}
          className="mt-5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'I understand'}
        </button>
      </div>
    </div>
  )
}
