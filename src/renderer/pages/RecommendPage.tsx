import { useEffect, useRef, useState } from 'react'
import { ROLES, type Role } from '@shared/rules'
import type {
  ChampionListResponse,
  RecommendationView,
  RecommendResponse,
} from '@shared/recommend-api'
import { ChampionPicker } from '../components/ChampionPicker'

function invokeErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

function names(list: string[]): string {
  return list.length > 0 ? list.join(', ') : 'none'
}

function RecommendationList({ items }: { items: RecommendationView[] }) {
  if (items.length === 0) return <p>none</p>

  return (
    <ol>
      {items.map((item) => (
        <li key={item.itemId}>
          <strong>{item.name}</strong> [{item.source}]
          <ul>
            {item.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

export function RecommendPage({ refreshKey }: { refreshKey: number }) {
  const [championList, setChampionList] = useState<ChampionListResponse | null>(null)
  const [role, setRole] = useState<Role>('TOP')
  const [meId, setMeId] = useState<string | null>(null)
  const [enemyIds, setEnemyIds] = useState<(string | null)[]>([null, null, null, null, null])
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestIdRef = useRef(0)

  useEffect(() => {
    window.api
      .invoke('champions:list', {})
      .then(setChampionList)
      .catch(() => {
        setChampionList({ version: null, champions: [] })
      })
  }, [refreshKey])

  useEffect(() => {
    if (!meId) {
      requestIdRef.current += 1
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const run = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await window.api.invoke('recommend:run', {
          meId,
          role,
          enemyIds: enemyIds.filter((id): id is string => id !== null),
        })
        if (requestIdRef.current !== requestId) return
        setResult(response)
        setLoading(false)
      } catch (reason) {
        if (requestIdRef.current !== requestId) return
        setResult(null)
        setError(invokeErrorMessage(reason))
        setLoading(false)
      }
    }

    void run()
  }, [meId, role, enemyIds])

  function setEnemy(index: number, id: string | null): void {
    setEnemyIds((current) => current.map((value, currentIndex) => (currentIndex === index ? id : value)))
  }

  if (!championList) return <p>loading…</p>

  if (championList.version === null) {
    return <p>No static data yet. Press "Update data".</p>
  }

  return (
    <section>
      <h2>Recommendations</h2>

      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <ChampionPicker
        label="You"
        champions={championList.champions}
        value={meId}
        onChange={setMeId}
        listId="champion-me"
      />

      {enemyIds.map((enemyId, index) => (
        <ChampionPicker
          key={index}
          label={`Enemy ${index + 1}`}
          champions={championList.champions}
          value={enemyId}
          onChange={(id) => setEnemy(index, id)}
          exclude={enemyIds.filter((id, otherIndex): id is string => id !== null && otherIndex !== index)}
          listId={`champion-enemy-${index + 1}`}
        />
      ))}

      {!meId ? (
        <p>Pick your champion.</p>
      ) : loading ? (
        <p>loading…</p>
      ) : error ? (
        <p>error: {error}</p>
      ) : result ? (
        <div>
          <p>
            {`patch ${result.version} · ${result.level === 'rules' ? 'rules' : 'core fallback'} · you: ${result.me.name} (${result.me.damage})`}
          </p>
          {result.profile.metrics.enemies > 0 ? (
            <p>
              {`Enemy team: ${Math.round(result.profile.metrics.adShare * 100)}% physical / ${Math.round(result.profile.metrics.apShare * 100)}% magic · healers: ${names(result.profile.names.healers)} · hard CC: ${names(result.profile.names.hardCc)} · tanks: ${names(result.profile.names.tanks)}`}
            </p>
          ) : null}
          <h3>Items</h3>
          <RecommendationList items={result.items} />
          <h3>Boots</h3>
          <RecommendationList items={result.boots} />
        </div>
      ) : null}
    </section>
  )
}
