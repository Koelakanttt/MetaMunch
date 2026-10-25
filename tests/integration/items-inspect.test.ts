import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HttpDataDragonProvider } from '../../src/main/providers/http-data-dragon'
import { buildItemPool, itemTraits, plainText, unknownStatLabels } from '../../src/shared/item-traits'
import { parseChampionTags, parseRules } from '../../src/shared/rules'

function readData(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'data', name), 'utf8'))
}

function histogram(values: Iterable<string>): string[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${k}: ${n}`)
}

// Live check of the item traits and the draft data files against real Data Dragon.
// Run with: npm run inspect:items  (writes tmp/items-inspect.txt)
describe.skipIf(!process.env['LIVE'])('item inspection (live)', () => {
  it('writes tmp/items-inspect.txt and sanity-checks the pool', async () => {
    const provider = new HttpDataDragonProvider()
    const version = await provider.getLatestVersion()
    const items = (await provider.getItems(version)).values
    const champions = (await provider.getChampions(version)).values
    const rules = parseRules(readData('rules.json'))
    const tags = parseChampionTags(readData('champion-tags.json'))
    const pool = buildItemPool(items, rules.excludeItems)

    const line = (i: (typeof items)[number]) => `${i.name} | ${i.goldTotal}g | ${itemTraits(i).join(',') || '-'}`
    const sr = items.filter((i) => i.purchasable && i.inStore && i.maps['11'] === true)
    const knownIds = new Set(champions.map((c) => c.id))

    const byName = new Map<string, typeof items>()
    for (const i of sr.filter((x) => x.goldTotal >= 1000)) byName.set(i.name, [...(byName.get(i.name) ?? []), i])
    const duplicates = [...byName.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) =>
        `${name}: ` + list.map((i) => `id=${i.id} ${i.goldTotal}g maps=[${Object.keys(i.maps).filter((m) => i.maps[m]).join(',')}] from=${i.from.length}`).join(' || '),
      )

    const healMention = /wound|anti-?heal|heal\w* reduc|reduc\w*[^.]{0,40}heal/i
    const snippets = pool.items.flatMap((i) => {
      const text = plainText(i.description)
      const m = healMention.exec(text)
      return m ? [`${i.name} [${itemTraits(i).includes('antiheal') ? 'antiheal' : 'NOT TAGGED'}]: ...${text.slice(Math.max(0, m.index - 70), m.index + 90)}...`] : []
    })
    const fullText = pool.items
      .filter((i) => ['Thornmail', 'Chempunk Chainsword'].includes(i.name))
      .map((i) => `${i.name}: ${plainText(i.description)}`)

    const unknownByLabel = new Map<string, string[]>()
    for (const i of sr) for (const l of unknownStatLabels(i.description)) unknownByLabel.set(l, [...(unknownByLabel.get(l) ?? []), i.name])
    const unknownItems = [...unknownByLabel.entries()].map(([l, n]) => `${l}: ${[...new Set(n)].slice(0, 6).join(', ')}`)
    const out: string[] = [
      `Data Dragon ${version}: ${items.length} items, ${champions.length} champions`,
      `Pool: ${pool.items.length} items, ${pool.boots.length} boots (shop items on Summoner's Rift: ${sr.length})`,
      '',
      '== POOL ITEMS (name | gold | traits) ==',
      ...pool.items.map(line).sort(),
      '',
      '== POOL BOOTS ==',
      ...pool.boots.map(line).sort(),
      '',
      '== TRAIT COUNTS IN POOL ==',
      ...histogram(pool.items.flatMap((i) => itemTraits(i))),
      '',
      '== POOL ITEMS WITHOUT ANY TRAIT ==',
      ...pool.items.filter((i) => itemTraits(i).length === 0).map((i) => i.name),
      '',
      '== STAT LABELS NOT UNDERSTOOD (shop items, label: count) ==',
      ...histogram(sr.flatMap((i) => unknownStatLabels(i.description))),
      '',
      '== DUPLICATE NAMES (shop items on Summoner\'s Rift, gold >= 1000) ==',
      ...duplicates,
      '',
      '== HEAL-REDUCTION MENTIONS IN POOL DESCRIPTIONS ==',
      ...snippets,
      '',
      '== FULL TEXT OF TWO ITEMS ==',
      ...fullText,
      '',
      '== NOT UNDERSTOOD LABELS -> EXAMPLE ITEMS ==',
      ...unknownItems,
      '',
      '== champion-tags.json IDS NOT FOUND IN DATA DRAGON ==',
      ...Object.keys(tags.champions).filter((id) => !knownIds.has(id)),
      '',
      '== DATA DRAGON CHAMPION TAGS (count) ==',
      ...histogram(champions.flatMap((c) => c.tags)),
    ]
    mkdirSync(join(process.cwd(), 'tmp'), { recursive: true })
    writeFileSync(join(process.cwd(), 'tmp', 'items-inspect.txt'), out.join('\n') + '\n', 'utf8')

    const withTrait = (t: string) => pool.items.filter((i) => (itemTraits(i) as string[]).includes(t)).length
    expect(pool.items.length).toBeGreaterThan(40)
    expect(pool.boots.length).toBeGreaterThanOrEqual(3)
    expect(withTrait('antiheal')).toBeGreaterThanOrEqual(4)
    expect(withTrait('armor')).toBeGreaterThanOrEqual(8)
    expect(withTrait('mr')).toBeGreaterThanOrEqual(5)
    expect(withTrait('ad')).toBeGreaterThanOrEqual(15)
    expect(withTrait('ap')).toBeGreaterThanOrEqual(10)
  }, 60000)
})
