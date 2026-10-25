import { z } from 'zod'

export interface RiotId {
  gameName: string
  tagLine: string
}

export interface RiotAccount extends RiotId {
  puuid: string
}

export interface MatchParticipant {
  puuid: string
  teamId: number // 100 or 200
  championId: number // numeric champion key, same as Champion.key
  position: string // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY, or '' when not applicable
  win: boolean
  items: number[] // exactly 6 slots, 0 = empty
  trinket: number // item6, 0 = none
  summoner1: number
  summoner2: number
  keystone: number | null
  primaryStyle: number | null
  subStyle: number | null
}

export interface Match {
  id: string // e.g. "EUW1_7000000001"
  platform: string // prefix of the id, e.g. "EUW1"
  queueId: number
  patch: string // "16.21", the first two parts of gameVersion
  gameVersion: string // e.g. "16.21.600.1234"
  gameCreation: number // epoch ms
  durationSec: number
  remake: boolean
  participants: MatchParticipant[]
}

/** First two parts of a version string: "16.21.600.1234" -> "16.21", "16.21.1" -> "16.21". */
export function toPatch(version: string): string {
  const m = /^(\d+)\.(\d+)(?:\.|$)/.exec(version)
  if (!m) throw new Error(`Invalid game version: ${version}`)
  return `${m[1]}.${m[2]}`
}

/** Parses "Name#TAG" (split at the last '#'). Validation is intentionally light; the API answers 404 for unknown ids. */
export function parseRiotId(input: string): RiotId {
  const text = input.trim()
  const idx = text.lastIndexOf('#')
  if (idx <= 0 || idx === text.length - 1) throw new Error('Riot ID must look like Name#TAG')
  const gameName = text.slice(0, idx).trim()
  const tagLine = text.slice(idx + 1).trim()
  if (!gameName || !tagLine || /[/\\\s]/.test(tagLine) || gameName.includes('/')) {
    throw new Error('Riot ID must look like Name#TAG')
  }
  return { gameName, tagLine }
}

const AccountRaw = z.object({ puuid: z.string().min(1), gameName: z.string().min(1), tagLine: z.string().min(1) })

export function parseAccount(json: unknown): RiotAccount {
  return AccountRaw.parse(json)
}

const MatchIdSchema = z.string().regex(/^[A-Za-z0-9]+_\d+$/)

export function parseMatchIds(json: unknown): string[] {
  return z.array(MatchIdSchema).parse(json)
}

const PerkStyleRaw = z.object({
  description: z.string(),
  style: z.number(),
  selections: z.array(z.object({ perk: z.number() })).default([]),
})

const ParticipantRaw = z.object({
  puuid: z.string(),
  teamId: z.number(),
  championId: z.number(),
  teamPosition: z.string().default(''),
  win: z.boolean(),
  item0: z.number().default(0),
  item1: z.number().default(0),
  item2: z.number().default(0),
  item3: z.number().default(0),
  item4: z.number().default(0),
  item5: z.number().default(0),
  item6: z.number().default(0),
  summoner1Id: z.number().default(0),
  summoner2Id: z.number().default(0),
  perks: z.object({ styles: z.array(PerkStyleRaw).default([]) }).optional(),
  gameEndedInEarlySurrender: z.boolean().default(false),
})

const MatchRaw = z.object({
  metadata: z.object({ matchId: z.string().min(1) }),
  info: z.object({
    gameCreation: z.number(),
    gameDuration: z.number(),
    gameVersion: z.string(),
    queueId: z.number(),
    participants: z.array(ParticipantRaw).min(1),
  }),
})

const REMAKE_MAX_SECONDS = 300

/** Parses a match-v5 match. Throws on malformed data. */
export function parseMatch(json: unknown): Match {
  const raw = MatchRaw.parse(json)
  const id = raw.metadata.matchId
  const info = raw.info
  const participants: MatchParticipant[] = info.participants.map((p) => {
    const primary = p.perks?.styles.find((s) => s.description === 'primaryStyle')
    const sub = p.perks?.styles.find((s) => s.description === 'subStyle')
    return {
      puuid: p.puuid,
      teamId: p.teamId,
      championId: p.championId,
      position: p.teamPosition,
      win: p.win,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5],
      trinket: p.item6,
      summoner1: p.summoner1Id,
      summoner2: p.summoner2Id,
      keystone: primary?.selections[0]?.perk ?? null,
      primaryStyle: primary?.style ?? null,
      subStyle: sub?.style ?? null,
    }
  })
  return {
    id,
    platform: id.split('_')[0] ?? '',
    queueId: info.queueId,
    patch: toPatch(info.gameVersion),
    gameVersion: info.gameVersion,
    gameCreation: info.gameCreation,
    durationSec: info.gameDuration,
    remake:
      info.gameDuration < REMAKE_MAX_SECONDS ||
      info.participants.some((p) => p.gameEndedInEarlySurrender),
    participants,
  }
}
