import { useEffect, useRef, useState } from 'react'
import type { LiveGameStatus } from '@shared/live-game'
import type { PostGameResult } from '@shared/post-game'
import type { RecommendationView, RecommendResponse } from '@shared/recommend-api'
import { ROLES, type Role } from '@shared/rules'
import { ChampionIcon, ItemIcon } from '../components/Icon'
import { Button, Card, EmptyState, StatusLine } from '../components/ui'

const QUEUE_NAMES: Record<number, string> = {
  400: 'Normal',
  420: 'Ranked Solo',
  440: 'Ranked Flex',
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function roleFor(position: string): Role {
  return ROLES.includes(position as Role) ? (position as Role) : 'TOP'
}

function nextItems(result: RecommendResponse, owned: ReadonlySet<string>): RecommendationView[] {
  const seen = new Set<string>()
  const next: RecommendationView[] = []
  for (const item of [...result.core, ...result.items, ...result.boots]) {
    if (owned.has(item.name) || seen.has(item.name)) continue
    seen.add(item.name)
    next.push(item)
    if (next.length >= 6) break
  }
  return next
}

export function GamePage() {
  const [live, setLive] = useState<LiveGameStatus | null>(null)
  const [review, setReview] = useState<PostGameResult | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [suggestions, setSuggestions] = useState<RecommendResponse | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const suggestionKeyRef = useRef('')

  useEffect(() => {
    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        const status = await window.api.invoke('live:status', {})
        if (!cancelled) setLive(status)
      } catch {
        if (!cancelled) {
          setLive({ state: 'error', message: 'Could not read the live game client.' })
        }
      }
    }

    void load()
    const timer = setInterval(() => {
      void load()
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      setReviewLoading(true)
      setReviewError('')
      try {
        const result = await window.api.invoke('review:last', {})
        if (!cancelled) setReview(result)
      } catch (reason) {
        if (!cancelled) {
          setReview(null)
          setReviewError(errorMessage(reason))
        }
      } finally {
        if (!cancelled) setReviewLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (live?.state !== 'live') {
      suggestionKeyRef.current = ''
      return
    }
    const championId = live.me.championId
    if (!championId) {
      suggestionKeyRef.current = ''
      return
    }
    const role = roleFor(live.me.position)
    const enemyIds = live.enemies
      .map((enemy) => enemy.championId)
      .filter((id): id is string => id !== null)
    const key = `${championId}|${enemyIds.join(',')}|${role}`
    if (suggestionKeyRef.current === key) return
    suggestionKeyRef.current = key

    let cancelled = false
    const run = async (): Promise<void> => {
      setSuggestLoading(true)
      setSuggestError('')
      try {
        const result = await window.api.invoke('recommend:run', {
          meId: championId,
          role,
          enemyIds,
        })
        if (!cancelled) setSuggestions(result)
      } catch (reason) {
        if (!cancelled) {
          setSuggestions(null)
          setSuggestError(errorMessage(reason))
        }
      } finally {
        if (!cancelled) setSuggestLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [live])

  async function reloadReview(): Promise<void> {
    setReviewLoading(true)
    setReviewError('')
    try {
      setReview(await window.api.invoke('review:last', {}))
    } catch (reason) {
      setReview(null)
      setReviewError(errorMessage(reason))
    } finally {
      setReviewLoading(false)
    }
  }

  if (!live) {
    return (
      <Card title="Game">
        <StatusLine tone="muted">Checking the live game…</StatusLine>
      </Card>
    )
  }

  if (live.state === 'live') {
    const owned = new Set(live.me.items.map((item) => item.name))
    const next = suggestions ? nextItems(suggestions, owned) : []

    return (
      <section className="space-y-4">
        <Card title="Live game">
          <StatusLine>
            {`${live.gameMode || 'game'} · ${live.mapName || 'map'} · ${formatDuration(live.gameTime)}`}
          </StatusLine>
          <div className="flex items-center gap-3">
            <ChampionIcon
              championId={live.me.championId}
              name={live.me.name}
              size={44}
            />
            <StatusLine>
              {`You: ${live.me.name ?? 'unknown'} (${live.me.position || 'role unknown'}) · items: ${
                live.me.items.map((item) => item.name).join(', ') || 'none'
              }`}
            </StatusLine>
          </div>
          {live.me.items.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {live.me.items.map((item) => (
                <ItemIcon key={`${item.id}-${item.name}`} itemId={item.id} name={item.name} size={26} />
              ))}
            </div>
          ) : null}
          {live.enemies.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {live.enemies.map((enemy) => (
                <ChampionIcon
                  key={`${enemy.championKey}-${enemy.position}`}
                  championId={enemy.championId}
                  name={enemy.name}
                  size={26}
                />
              ))}
            </div>
          ) : null}
          <StatusLine tone="muted">
            {`Enemies: ${
              live.enemies.map((enemy) => enemy.name ?? enemy.championId ?? 'hidden').join(', ') ||
              'none'
            }`}
          </StatusLine>
          <StatusLine tone="muted">
            Read-only: only information you already see in game. No overlay, no automation.
          </StatusLine>
        </Card>

        <Card title="Next items">
          {!live.me.championId ? (
            <EmptyState>
              Your champion is not resolved because static data is missing. Press &quot;Update
              data&quot; in Settings.
            </EmptyState>
          ) : suggestLoading ? (
            <StatusLine tone="muted">loading tips…</StatusLine>
          ) : suggestError ? (
            <StatusLine tone="error">error: {suggestError}</StatusLine>
          ) : next.length === 0 ? (
            <EmptyState>You already own the recommended items.</EmptyState>
          ) : (
            <ol className="space-y-2">
              {next.map((item) => (
                <li
                  key={item.itemId}
                  className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                >
                  <ItemIcon
                    itemId={item.itemId}
                    name={item.name}
                    hint={[item.gold > 0 ? `${item.gold}g` : null, item.plaintext]
                      .filter((part): part is string => Boolean(part))
                      .join(' · ')}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <strong className="font-medium text-slate-100">{item.name}</strong>
                      <span className="text-xs text-slate-500">[{item.source}]</span>
                    </div>
                    {item.reasons.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-400">
                        {item.reasons.slice(0, 2).map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>
    )
  }

  const readyReview = review?.state === 'ready' ? review.review : null

  return (
    <section className="space-y-4">
      {live.state === 'error' ? (
        <Card title="Live game">
          <StatusLine tone="error">{live.message}</StatusLine>
        </Card>
      ) : null}

      <Card title="Last game">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void reloadReview()
            }}
            disabled={reviewLoading}
          >
            {reviewLoading ? 'loading…' : 'Refresh review'}
          </Button>
          <StatusLine tone="muted">
            Compares what you bought with recommendations regenerated for that game.
          </StatusLine>
        </div>
        {reviewError ? <StatusLine tone="error">error: {reviewError}</StatusLine> : null}
        {!review && !reviewError ? <StatusLine tone="muted">loading…</StatusLine> : null}
        {review?.state === 'no-account' ? (
          <EmptyState>No account set. Connect a Riot ID in Settings.</EmptyState>
        ) : null}
        {review?.state === 'no-matches' ? (
          <EmptyState>No stored matches yet. Sync your matches in Settings.</EmptyState>
        ) : null}
      </Card>

      {readyReview ? (
        <>
          <Card title="Match">
            <div className="flex items-center gap-3">
              <ChampionIcon
                championId={readyReview.match.championId}
                name={readyReview.match.championName}
                size={44}
              />
              <div className="space-y-1">
                <StatusLine>
                  {`${readyReview.match.championName ?? 'Unknown champion'} · ${
                    readyReview.match.win ? 'Win' : 'Loss'
                  } · ${QUEUE_NAMES[readyReview.match.queueId] ?? readyReview.match.queueId} · patch ${readyReview.match.patch} · ${formatDuration(readyReview.match.durationSec)}`}
                </StatusLine>
                <StatusLine tone="muted">
                  {`${new Date(readyReview.match.gameCreation).toLocaleDateString()}`}
                </StatusLine>
              </div>
            </div>
            {readyReview.match.items.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {readyReview.match.items.map((item) => (
                  <ItemIcon key={item.id} itemId={item.id} name={item.name} size={26} />
                ))}
              </div>
            ) : null}
          </Card>

          <Card title="Missed from the recommendation">
            {readyReview.missed.length === 0 ? (
              <EmptyState>You bought every recommended item.</EmptyState>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-400">
                {readyReview.missed.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Patch changes for this champion">
            {readyReview.patchChanges === null ? (
              <EmptyState>Patch comparison unavailable for this champion.</EmptyState>
            ) : readyReview.patchChanges.length === 0 ? (
              <EmptyState>No changes in the latest patch.</EmptyState>
            ) : (
              <ul className="space-y-1 text-xs text-slate-400">
                {readyReview.patchChanges.map((change, index) => (
                  <li key={index}>
                    <span className="text-slate-300">{change.label}</span>: {change.before} →{' '}
                    {change.after}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </section>
  )
}
