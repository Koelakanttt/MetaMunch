import { useState } from 'react'
import type { ChampionSummary } from '@shared/recommend-api'

interface Props {
  label: string
  champions: ChampionSummary[]
  value: string | null
  onChange: (id: string | null) => void
  exclude?: string[]
  listId: string
}

export function ChampionPicker({
  label,
  champions,
  onChange,
  exclude = [],
  listId,
}: Props) {
  const [text, setText] = useState('')

  const excluded = new Set(exclude)
  const available = champions.filter((champion) => !excluded.has(champion.id))
  const match = available.find(
    (champion) => champion.name.toLowerCase() === text.trim().toLowerCase(),
  )
  const unknown = text.trim() !== '' && match === undefined

  function handleChange(next: string): void {
    setText(next)
    const found = available.find(
      (champion) => champion.name.toLowerCase() === next.trim().toLowerCase(),
    )
    onChange(found ? found.id : null)
  }

  return (
    <label>
      {label}
      <input list={listId} value={text} onChange={(event) => handleChange(event.target.value)} />
      <datalist id={listId}>
        {available.map((champion) => (
          <option key={champion.id} value={champion.name} />
        ))}
      </datalist>
      {unknown ? <span>unknown champion</span> : null}
    </label>
  )
}
