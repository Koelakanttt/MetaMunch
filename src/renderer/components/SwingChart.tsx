import type { TimelineReviewView } from '@shared/swing'

export function SwingChart({ data }: { data: TimelineReviewView }) {
  const points = data.summary.minutes
  if (points.length === 0) return null
  const width = 720
  const height = 190
  const padding = 18
  const values = points.map((point) => point.blueGold - point.redGold)
  const limit = Math.max(1000, ...values.map((value) => Math.abs(value)))
  const x = (index: number): number =>
    padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2)
  const y = (value: number): number =>
    height / 2 - (value / limit) * (height / 2 - padding)
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.blueGold - point.redGold)}`)
    .join(' ')
  const last = points[points.length - 1]
  const decidedAt = data.decidedAt
  const decidedIndex =
    decidedAt === null ? -1 : points.findIndex((point) => point.minute >= decidedAt)

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full rounded-md border border-slate-800 bg-slate-950/60"
        role="img"
        aria-label="Gold difference timeline"
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={height / 2}
          y2={height / 2}
          stroke="rgb(51 65 85)"
          strokeWidth="1"
        />
        {data.summary.markers
          .filter((marker) => marker.type !== 'ITEM_PURCHASED')
          .map((marker, index) => {
            const minute = Math.round(marker.atMs / 60_000)
            const pointIndex = points.findIndex((point) => point.minute >= minute)
            if (pointIndex < 0) return null
            return (
              <line
                key={`${marker.atMs}-${index}`}
                x1={x(pointIndex)}
                x2={x(pointIndex)}
                y1={padding}
                y2={height - padding}
                stroke={marker.type === 'CHAMPION_KILL' ? 'rgb(244 63 94)' : 'rgb(56 189 248)'}
                strokeWidth="1"
                opacity="0.55"
              />
            )
          })}
        <path d={path} fill="none" stroke="rgb(52 211 153)" strokeWidth="2" />
        {decidedIndex >= 0 ? (
          <line
            x1={x(decidedIndex)}
            x2={x(decidedIndex)}
            y1={padding}
            y2={height - padding}
            stroke="rgb(250 204 21)"
            strokeDasharray="4 5"
            strokeWidth="1.5"
          />
        ) : null}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>gold difference · blue vs red</span>
        <span>
          {last ? `${last.minute}m · ${last.blueGold - last.redGold >= 0 ? '+' : ''}${last.blueGold - last.redGold}` : ''}
        </span>
      </div>
    </div>
  )
}
