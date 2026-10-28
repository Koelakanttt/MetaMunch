import { useState } from 'react'
import { championIconUrl, itemIconUrl, runeIconUrl } from '@shared/assets'

const fallbackClass =
  'inline-flex shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-300'

export function ChampionIcon({
  championId,
  name,
  size = 28,
  className = '',
}: {
  championId: string | null
  name?: string | null
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }

  if (!championId || failed) {
    return (
      <span
        className={`${fallbackClass} ${className}`}
        style={style}
        title={name ?? championId ?? 'unknown champion'}
      >
        <span className="text-[10px] font-semibold uppercase">
          {(name ?? championId ?? '?').slice(0, 1)}
        </span>
      </span>
    )
  }

  return (
    <img
      src={championIconUrl(championId)}
      width={size}
      height={size}
      alt={name ?? championId}
      title={name ?? championId}
      loading="lazy"
      className={`shrink-0 rounded-md border border-slate-700 object-cover ${className}`}
      style={style}
      onError={() => setFailed(true)}
    />
  )
}

export function ItemIcon({
  itemId,
  name,
  hint,
  size = 32,
  className = '',
}: {
  itemId: number
  name?: string
  hint?: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  const title = hint ? `${name ?? `Item ${itemId}`} — ${hint}` : (name ?? `Item ${itemId}`)

  if (failed) {
    return (
      <span className={`${fallbackClass} ${className}`} style={style} title={title}>
        <span className="text-[10px] font-semibold">?</span>
      </span>
    )
  }

  return (
    <img
      src={itemIconUrl(itemId)}
      width={size}
      height={size}
      alt={name ?? `Item ${itemId}`}
      title={title}
      loading="lazy"
      className={`shrink-0 rounded-md border border-slate-700 object-cover ${className}`}
      style={style}
      onError={() => setFailed(true)}
    />
  )
}

export function RuneIcon({
  iconPath,
  name,
  size = 30,
  className = '',
}: {
  iconPath: string | null
  name?: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }

  if (!iconPath || failed) {
    return (
      <span
        className={`${fallbackClass} rounded-full ${className}`}
        style={style}
        title={name ?? 'rune'}
      >
        <span className="text-[10px] font-semibold uppercase">{(name ?? '?').slice(0, 1)}</span>
      </span>
    )
  }

  return (
    <img
      src={runeIconUrl(iconPath)}
      width={size}
      height={size}
      alt={name ?? 'rune'}
      title={name ?? 'rune'}
      loading="lazy"
      className={`shrink-0 rounded-full border border-slate-700 object-cover ${className}`}
      style={style}
      onError={() => setFailed(true)}
    />
  )
}
