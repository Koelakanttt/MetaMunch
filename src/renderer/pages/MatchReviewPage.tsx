import { useEffect, useState } from 'react'
import type { MatchReviewInput, MatchReviewView, ReviewChecklistKey } from '@shared/review'
import { REVIEW_CHECKLIST_KEYS } from '@shared/review'
import { Button, Card, EmptyState, Label, StatusLine, TextInput } from '../components/ui'
import { ChampionIcon } from '../components/Icon'
import { SwingChart } from '../components/SwingChart'

const CHECKLIST_LABELS: Record<ReviewChecklistKey, string> = {
  died_too_much: 'Died too much',
  missed_cs: 'Missed CS',
  bad_recall: 'Bad recall',
  lost_vision: 'Lost vision',
  poor_teamfight: 'Poor teamfight',
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function MatchReviewPage({
  matchId,
  onClose,
  onSaved,
}: {
  matchId: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [data, setData] = useState<MatchReviewView | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [fixText, setFixText] = useState('')
  const [checklist, setChecklist] = useState<Record<ReviewChecklistKey, boolean>>({
    died_too_much: false,
    missed_cs: false,
    bad_recall: false,
    lost_vision: false,
    poor_teamfight: false,
  })
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api
      .invoke('review:get', { matchId })
      .then((view) => {
        if (cancelled) return
        setData(view)
        setLoaded(true)
        if (view?.review) {
          setFixText(view.review.fixText)
          setChecklist(view.review.checklist)
          setTags(view.review.tags.join(', '))
        } else {
          setFixText('')
          setChecklist({
            died_too_much: false,
            missed_cs: false,
            bad_recall: false,
            lost_vision: false,
            poor_teamfight: false,
          })
          setTags('')
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(message(reason))
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [matchId])

  async function save(): Promise<void> {
    const input: MatchReviewInput = {
      fixText,
      checklist,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    }
    setSaving(true)
    setError('')
    try {
      const review = await window.api.invoke('review:save', { matchId, review: input })
      if (review) {
        setData((current) => (current ? { ...current, review } : current))
        setSaved(true)
        onSaved?.()
      }
    } catch (reason) {
      setError(message(reason))
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <Card title="Match review">
        <StatusLine tone="error">error: {error}</StatusLine>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </Card>
    )
  }
  if (!data) {
    return (
      <Card title="Match review">
        {loaded ? <EmptyState>Match review is unavailable.</EmptyState> : null}
        {!loaded ? <StatusLine tone="muted">loading review…</StatusLine> : null}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </Card>
    )
  }

  return (
    <Card title={`Match review · ${data.match.championName ?? data.match.matchId}`}>
      <div className="space-y-3">
        {(() => {
          const largestSwing = data.timeline?.swings[0] ?? null
          return largestSwing ? (
            <StatusLine tone="muted">
              {`Largest gold swing: ${largestSwing.deltaGold >= 0 ? '+' : ''}${largestSwing.deltaGold} gold at ${largestSwing.minute}m.`}
            </StatusLine>
          ) : null
        })()}
        <div className="flex flex-wrap items-center gap-3">
          <ChampionIcon championId={data.match.championId} name={data.match.championName} size={42} />
          <div className="text-sm text-slate-300">
            <div>
              {data.match.championName ?? 'Unknown champion'} · {data.match.position || 'role unknown'}
            </div>
            <div className="text-xs text-slate-500">
              {data.match.win ? 'Win' : 'Loss'} · patch {data.match.patch} ·{' '}
              {Math.round(data.match.durationSec / 60)}m
            </div>
          </div>
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>

        {data.timeline ? (
          <>
            <SwingChart data={data.timeline} />
            <div className="grid gap-1 text-xs text-slate-300 sm:grid-cols-3">
              {data.timeline.swings.map((swing) => (
                <div key={swing.minute} className="rounded border border-slate-800 p-2">
                  <div className="text-slate-400">
                    {swing.minute}m · {swing.classification}
                  </div>
                  <div className={swing.deltaGold >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {swing.deltaGold >= 0 ? '+' : ''}
                    {swing.deltaGold} gold
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState>
            No compact timeline for this match yet. The post-game watcher will fetch it after a game.
          </EmptyState>
        )}

        <label className="flex flex-col gap-1">
          <Label>1 thing to fix next game</Label>
          <textarea
            value={fixText}
            maxLength={500}
            onChange={(event) => setFixText(event.target.value)}
            rows={3}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            placeholder="One concrete change for the next game"
          />
        </label>

        <div>
          <Label>Checklist</Label>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {REVIEW_CHECKLIST_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={checklist[key]}
                  onChange={(event) =>
                    setChecklist((current) => ({ ...current, [key]: event.target.checked }))
                  }
                />
                {CHECKLIST_LABELS[key]}
              </label>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <Label>Tags (comma separated, max 8)</Label>
          <TextInput
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="wave, recall, vision"
          />
        </label>

        <div className="flex items-center gap-2">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save review'}
          </Button>
          {saved ? <StatusLine tone="success">Saved.</StatusLine> : null}
        </div>
      </div>
    </Card>
  )
}
