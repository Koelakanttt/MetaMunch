import { describe, expect, it } from 'vitest'
import { getRiotApiKey, loadEnv } from '../../src/main/env'
import { HttpRiotApiProvider } from '../../src/main/providers/http-riot-api'
import { parseRiotId } from '../../src/shared/riot'

describe.skipIf(!process.env['LIVE_RIOT'])('Riot API live', () => {
  it(
    'resolves the test account and fetches a recent match',
    async () => {
      loadEnv(process.cwd())

      const apiKey = getRiotApiKey()
      const testId = process.env['RIOT_TEST_ID']
      if (!apiKey || !testId) {
        throw new Error('RIOT_API_KEY and RIOT_TEST_ID must be set in .env for the live test')
      }

      const provider = new HttpRiotApiProvider({ apiKey })
      const riotId = parseRiotId(testId)
      const account = await provider.getAccountByRiotId(riotId.gameName, riotId.tagLine)

      const found: string[] = []
      for (const queue of [420, 440, 400]) {
        const batch = await provider.getMatchIds(account.puuid, { queue, start: 0, count: 3 })
        if (batch.length > 0) {
          found.push(...batch)
          break
        }
      }
      if (found.length === 0) {
        throw new Error('No recent matches returned for the test account')
      }

      const firstId = found[0]
      if (!firstId) throw new Error('No match id returned for the test account')

      const match = await provider.getMatch(firstId)
      expect(match.participants).toHaveLength(10)
      expect(match.participants.some((participant) => participant.puuid === account.puuid)).toBe(
        true,
      )
    },
    120000,
  )
})
