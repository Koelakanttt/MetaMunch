import { useState } from 'react'
import type { ChampionSummary } from '@shared/recommend-api'
import { ChampionIcon } from './Icon'
import { Label, TextInput } from './ui'

interface Props {
  label: string
  champions: ChampionSummary[]
  value: string | null
  onChange: (id: string | null) => void
  exclude?: string[]
  placeholder?: string
  showIcon?: boolean
}

/** Searchable champion combobox with icons and a clear button. */
export function ChampionPicker({
  label,
  champions,
  value,
  onChange,
  exclude = [],
  placeholder = 'Search champion…',
  showIcon = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)

  const excluded = new Set(exclude)
  const selected = champions.find((champion) => champion.id === value)
  const display = draft ?? selected?.name ?? ''
  const query = draft ?? ''

  const filtered = champions
    .filter((champion) => !excluded.has(champion.id))
    .filter((champion) => champion.name.toLowerCase().includes(query.trim().toLowerCase()))

  function commit(champion: ChampionSummary): void {
    setDraft(null)
    setOpen(false)
    onChange(champion.id)
  }

  function clear(): void {
    setDraft(null)
    setOpen(false)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="relative">
        {showIcon && selected ? (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">
            <ChampionIcon championId={selected.id} name={selected.name} size={22} />
          </span>
        ) : null}
        <TextInput
          value={display}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-9"
          style={{
            paddingLeft: showIcon && selected ? 36 : undefined,
            paddingRight: 36,
          }}
          onFocus={(event) => {
            event.currentTarget.select()
            setOpen(true)
            setHighlight(0)
          }}
          onBlur={() => {
            setDraft(null)
            setOpen(false)
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(null)
              setOpen(false)
              return
            }
            if (!open) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setHighlight((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlight((current) => Math.max(0, current - 1))
            } else if (event.key === 'Enter') {
              const champion = filtered[highlight]
              if (champion) {
                event.preventDefault()
                commit(champion)
              }
            }
          }}
        />
        {value || display ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            title="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-sm text-slate-400 hover:text-slate-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
          >
            ×
          </button>
        ) : null}

        {open ? (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500">No champions found.</li>
            ) : (
              filtered.map((champion, index) => (
                <li key={champion.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                      index === highlight
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      commit(champion)
                    }}
                    onMouseEnter={() => setHighlight(index)}
                  >
                    <ChampionIcon championId={champion.id} name={champion.name} size={24} />
                    <span className="truncate">{champion.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
