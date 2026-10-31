import { z } from 'zod'

export interface RiotId {
  gameName: string
  tagLine: string
}

export interface RiotAccount extends RiotId {
  puuid: string
}

export interface MatchPerkStyle {
  style: number
  selections: number[]
}

export interface MatchStatPerks {
  offense: number
  flex: number
  defense: number
}

export interface MatchParticipant {
  participantId: number // 1..10, matches the timeline participantId
  puuid: string
  teamId: number // 100 or 200
  championId: number // numeric champion key, same as Champion.key
  position: string // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY, or '' when not applicable
  win: boolean
  items: number[] // exactly 6 slots, 0 = empty
  trinket: number // item6, 0 = none
  summoner1: number
  summoner2: number
  kills: number
  deaths: number
  assists: number
  goldEarned: number
  damageToChampions: number
  visionScore: number
  cs: number
  keystone: number | null
  primaryStyle: number | null
  subStyle: number | null
  /** Full rune selections (keystone included), null on older matches. */
  perks: MatchPerkStyle[] | null
  /** Stat shards (offense/flex/defense), null on older matches. */
  statPerks: MatchStatPerks | null
}

export interface MatchBan {
  teamId: number
  championId: number
}

export interface Match {
  id: string // e.g. "EUW1_7000000001"
  platform: string // prefix of the id, e.g. "EUW1"
  queueId: number
  mapId: number
  patch: string // "16.21", the first two parts of gameVersion
  gameVersion: string // e.g. "16.21.600.1234"
  gameCreation: number // epoch ms
  durationSec: number
  remake: boolean
  participants: MatchParticipant[]
  bans: MatchBan[]
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
  participantId: z.number().default(0),
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
  kills: z.number().default(0),
  deaths: z.number().default(0),
  assists: z.number().default(0),
  goldEarned: z.number().default(0),
  totalDamageDealtToChampions: z.number().default(0),
  visionScore: z.number().default(0),
  totalMinionsKilled: z.number().default(0),
  neutralMinionsKilled: z.number().default(0),
  perks: z.object({
    styles: z.array(PerkStyleRaw).default([]),
    statPerks: z
      .object({
        offense: z.number(),
        flex: z.number(),
        defense: z.number(),
      })
      .optional(),
  }).optional(),
  gameEndedInEarlySurrender: z.boolean().default(false),
})

const TeamRaw = z.object({
  teamId: z.number(),
  bans: z.array(z.object({ championId: z.number() })).default([]),
})

const MatchRaw = z.object({
  metadata: z.object({ matchId: z.string().min(1) }),
  info: z.object({
    gameCreation: z.number(),
    gameDuration: z.number(),
    gameVersion: z.string(),
    queueId: z.number(),
    mapId: z.number().default(11),
    participants: z.array(ParticipantRaw).min(1),
    teams: z.array(TeamRaw).default([]),
  }),
})

const REMAKE_MAX_SECONDS = 300

/** Parses a match-v5 match. Throws on malformed data. */
export function parseMatch(json: unknown): Match {
  const raw = MatchRaw.parse(json)
  const id = raw.metadata.matchId
  const info = raw.info
  const participants: MatchParticipant[] = info.participants.map((p, index) => {
    const primary = p.perks?.styles.find((s) => s.description === 'primaryStyle')
    const sub = p.perks?.styles.find((s) => s.description === 'subStyle')
    return {
      participantId: p.participantId > 0 ? p.participantId : index + 1,
      puuid: p.puuid,
      teamId: p.teamId,
      championId: p.championId,
      position: p.teamPosition,
      win: p.win,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5],
      trinket: p.item6,
      summoner1: p.summoner1Id,
      summoner2: p.summoner2Id,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      goldEarned: p.goldEarned,
      damageToChampions: p.totalDamageDealtToChampions,
      visionScore: p.visionScore,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      keystone: primary?.selections[0]?.perk ?? null,
      primaryStyle: primary?.style ?? null,
      subStyle: sub?.style ?? null,
      perks:
        p.perks?.styles.map((style) => ({
          style: style.style,
          selections: style.selections.map((selection) => selection.perk),
        })) ?? null,
      statPerks: p.perks?.statPerks ?? null,
    }
  })
  return {
    id,
    platform: id.split('_')[0] ?? '',
    queueId: info.queueId,
    mapId: info.mapId,
    patch: toPatch(info.gameVersion),
    gameVersion: info.gameVersion,
    gameCreation: info.gameCreation,
    durationSec: info.gameDuration,
    remake:
      info.gameDuration < REMAKE_MAX_SECONDS ||
      info.participants.some((p) => p.gameEndedInEarlySurrender),
    participants,
    bans: info.teams.flatMap((team) =>
      team.bans
        .filter((ban) => ban.championId > 0)
        .map((ban) => ({ teamId: team.teamId, championId: ban.championId })),
    ),
  }
}
