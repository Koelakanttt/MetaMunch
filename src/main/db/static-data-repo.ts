import type { DatabaseSync } from 'node:sqlite'
import type { Champion, ChampionInfo, Item } from '@shared/ddragon'

export interface PatchStatus {
  version: string
  fetchedAt: number
  champions: number
  items: number
}

export function hasPatch(db: DatabaseSync, version: string): boolean {
  const row = db.prepare('SELECT 1 AS present FROM patches WHERE version = ? LIMIT 1').get(version)
  return row !== undefined
}

export function savePatch(
  db: DatabaseSync,
  version: string,
  champions: Champion[],
  items: Item[],
  fetchedAt: number,
): void {
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO patches (version, fetched_at) VALUES (?, ?)').run(version, fetchedAt)

    const insertChampion = db.prepare(
      'INSERT INTO champions (patch, key, id, name, tags, info, stats) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const champion of champions) {
      insertChampion.run(
        version,
        champion.key,
        champion.id,
        champion.name,
        JSON.stringify(champion.tags),
        JSON.stringify(champion.info),
        JSON.stringify(champion.stats),
      )
    }

    const insertItem = db.prepare(
      `INSERT INTO items
        (patch, id, name, plaintext, description, tags, stats, gold_total, purchasable,
         from_ids, into_ids, maps, in_store, required_ally, required_champion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const item of items) {
      insertItem.run(
        version,
        item.id,
        item.name,
        item.plaintext,
        item.description,
        JSON.stringify(item.tags),
        JSON.stringify(item.stats),
        item.goldTotal,
        item.purchasable ? 1 : 0,
        JSON.stringify(item.from),
        JSON.stringify(item.into),
        JSON.stringify(item.maps),
        item.inStore ? 1 : 0,
        item.requiredAlly,
        item.requiredChampion,
      )
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function getLatestPatch(db: DatabaseSync): PatchStatus | null {
  const row = db
    .prepare(
      `SELECT p.version AS version,
              p.fetched_at AS fetched_at,
              (SELECT count(*) FROM champions c WHERE c.patch = p.version) AS champions,
              (SELECT count(*) FROM items i WHERE i.patch = p.version) AS items
       FROM patches p
       ORDER BY p.fetched_at DESC, p.version DESC
       LIMIT 1`,
    )
    .get() as
    | { version?: unknown; fetched_at?: unknown; champions?: unknown; items?: unknown }
    | undefined
  if (!row) return null
  return {
    version: String(row.version),
    fetchedAt: Number(row.fetched_at),
    champions: Number(row.champions),
    items: Number(row.items),
  }
}

export function listChampions(db: DatabaseSync, version: string): Champion[] {
  const rows = db
    .prepare('SELECT key, id, name, tags, info, stats FROM champions WHERE patch = ? ORDER BY key')
    .all(version) as {
    key?: unknown
    id?: unknown
    name?: unknown
    tags?: unknown
    info?: unknown
    stats?: unknown
  }[]

  return rows.map((row) => ({
    key: Number(row.key),
    id: String(row.id),
    name: String(row.name),
    tags: JSON.parse(String(row.tags)) as string[],
    info: JSON.parse(String(row.info)) as ChampionInfo,
    stats: JSON.parse(String(row.stats)) as Record<string, number>,
  }))
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

export function listItems(db: DatabaseSync, version: string): Item[] {
  const rows = db
    .prepare(
      `SELECT id, name, plaintext, description, tags, stats, gold_total, purchasable,
              from_ids, into_ids, maps, in_store, required_ally, required_champion
       FROM items
       WHERE patch = ?
       ORDER BY id`,
    )
    .all(version) as {
    id?: unknown
    name?: unknown
    plaintext?: unknown
    description?: unknown
    tags?: unknown
    stats?: unknown
    gold_total?: unknown
    purchasable?: unknown
    from_ids?: unknown
    into_ids?: unknown
    maps?: unknown
    in_store?: unknown
    required_ally?: unknown
    required_champion?: unknown
  }[]

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    plaintext: String(row.plaintext),
    description: String(row.description),
    tags: JSON.parse(String(row.tags)) as string[],
    stats: JSON.parse(String(row.stats)) as Record<string, number>,
    goldTotal: Number(row.gold_total),
    purchasable: Number(row.purchasable) === 1,
    from: JSON.parse(String(row.from_ids)) as number[],
    into: JSON.parse(String(row.into_ids)) as number[],
    maps: JSON.parse(String(row.maps)) as Record<string, boolean>,
    inStore: Number(row.in_store) === 1,
    requiredAlly: nullableString(row.required_ally),
    requiredChampion: nullableString(row.required_champion),
  }))
}
