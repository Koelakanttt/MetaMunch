import type { Match, RiotAccount } from '@shared/riot'
import type { RiotApiProvider } from './riot-api'

const MISSING_KEY_MESSAGE = 'RIOT_API_KEY is not set. Open Settings and add your Riot API key.'

export class MissingKeyRiotApiProvider implements RiotApiProvider {
  async getAccountByRiotId(): Promise<RiotAccount> {
    throw new Error(MISSING_KEY_MESSAGE)
  }

  async getMatchIds(): Promise<string[]> {
    throw new Error(MISSING_KEY_MESSAGE)
  }

  async getMatch(): Promise<Match> {
    throw new Error(MISSING_KEY_MESSAGE)
  }
}
