import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HttpDataDragonProvider } from '../../src/main/providers/http-data-dragon'

const REALM_URL = 'https://ddragon.leagueoflegends.com/realms/euw.json'
const CHAMPION_URL = 'https://ddragon.leagueoflegends.com/cdn/16.3.1/data/en_US/champion.json'
const ITEM_URL = 'https://ddragon.leagueoflegends.com/cdn/16.3.1/data/en_US/item.json'

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'tests/fixtures/ddragon', name), 'utf8')
}

describe('HttpDataDragonProvider', () => {
  it('requests the default URLs and sends the user agent', async () => {
    const calls: { url: string; userAgent: string | null }[] = []
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push({ url, userAgent: new Headers(init?.headers).get('User-Agent') })
      if (url === REALM_URL) return new Response(fixture('realm-euw.json'))
      if (url === CHAMPION_URL) return new Response(fixture('champion.json'))
      if (url === ITEM_URL) return new Response(fixture('item.json'))
      return new Response('missing', { status: 404 })
    }

    const provider = new HttpDataDragonProvider({ fetchFn })

    expect(await provider.getLatestVersion()).toBe('16.3.1')
    expect((await provider.getChampions('16.3.1')).values).toHaveLength(3)
    await provider.getItems('16.3.1')

    expect(calls.map((call) => call.url)).toEqual([REALM_URL, CHAMPION_URL, ITEM_URL])
    expect(calls.every((call) => call.userAgent === 'MetaMunch (personal project)')).toBe(true)
  })

  it('throws on a non-2xx response', async () => {
    const fetchFn: typeof fetch = async () => new Response('unavailable', { status: 503 })
    const provider = new HttpDataDragonProvider({ fetchFn })

    await expect(provider.getLatestVersion()).rejects.toThrow('HTTP 503')
  })

  it('fetches versions and champion details', async () => {
    const versionsUrl = 'https://ddragon.leagueoflegends.com/api/versions.json'
    const detailUrl =
      'https://ddragon.leagueoflegends.com/cdn/16.21.1/data/en_US/champion/Camille.json'
    const detail = JSON.stringify({
      data: {
        Camille: {
          id: 'Camille',
          name: 'Camille',
          stats: { hp: 650 },
          passive: { name: 'Adaptive Defenses' },
          spells: [],
        },
      },
    })

    const calls: string[] = []
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url === versionsUrl) return new Response(JSON.stringify(['16.21.1', '16.20.1']))
      if (url === detailUrl) return new Response(detail)
      return new Response('missing', { status: 404 })
    }

    const provider = new HttpDataDragonProvider({ fetchFn })

    expect(await provider.getVersions()).toEqual(['16.21.1', '16.20.1'])
    const parsed = await provider.getChampionDetail('16.21.1', 'Camille')
    expect(parsed.name).toBe('Camille')
    expect(parsed.stats.hp).toBe(650)
    expect(parsed.passiveName).toBe('Adaptive Defenses')
    expect(calls).toEqual([versionsUrl, detailUrl])
  })
})
