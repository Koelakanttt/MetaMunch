import { z } from 'zod'
import type { Champion } from '@shared/ddragon'
import type { ChampionSelectStatus, DetectedChampion } from '@shared/champion-select'
import type { LcuConnection } from '../providers/lcu-client'
import { createLcuConnection, findLockfile } from '../providers/lcu-client'
import type { StaticDataSource } from './recommendation-service'

const MemberSchema = z.object({
  cellId: z.number(),
  championId: z.number().default(0),
  assignedPosition: z.string().default(''),
})

const SessionSchema = z.object({
  localPlayerCellId: z.number(),
  myTeam: z.array(MemberSchema).default([]),
  theirTeam: z.array(MemberSchema).default([]),
})

export interface SessionMember {
  cellId: number
  championId: number
  assignedPosition: string
}

export interface ChampionSelectSession {
  localPlayerCellId: number
  myTeam: SessionMember[]
  theirTeam: SessionMember[]
}

export function parseChampionSelectSession(json: unknown): ChampionSelectSession {
  return SessionSchema.parse(json)
}

export interface ChampionSelectDeps {
  getLeaguePath: () => string | null
  source: StaticDataSource
  findLockfile?: (configured: string | null) => string | null
  connect?: (lockfilePath: string) => LcuConnection
}

const NOT_FOUND_MESSAGE =
  'League client not detected. Start the client and open champion select, or set the client folder in Settings.'

function detected(
  member: SessionMember,
  byKey: ReadonlyMap<number, Champion>,
): DetectedChampion {
  const champion = member.championId > 0 ? byKey.get(member.championId) : undefined
  return {
    championKey: member.championId,
    championId: champion?.id ?? null,
    name: champion?.name ?? null,
    position: member.assignedPosition.toUpperCase(),
  }
}

/** Read-only access to the local League client champion select. Never sends input to the client. */
export class ChampionSelectService {
  private readonly getLeaguePath: () => string | null
  private readonly source: StaticDataSource
  private readonly locateLockfile: (configured: string | null) => string | null
  private readonly connect: (lockfilePath: string) => LcuConnection

  constructor(deps: ChampionSelectDeps) {
    this.getLeaguePath = deps.getLeaguePath
    this.source = deps.source
    this.locateLockfile = deps.findLockfile ?? findLockfile
    this.connect = deps.connect ?? createLcuConnection
  }

  async status(): Promise<ChampionSelectStatus> {
    const lockfilePath = this.locateLockfile(this.getLeaguePath())
    if (!lockfilePath) return { state: 'not-found', message: NOT_FOUND_MESSAGE }

    try {
      const connection = this.connect(lockfilePath)
      const phase = await connection.phase()
      if (phase !== 'ChampSelect') return { state: 'idle', phase }

      const session = parseChampionSelectSession(await connection.session())
      const version = this.source.latestVersion()
      const champions = version === null ? [] : this.source.champions(version)
      const byKey = new Map(champions.map((champion) => [champion.key, champion]))

      const meMember =
        session.myTeam.find((member) => member.cellId === session.localPlayerCellId) ?? null
      const enemies = session.theirTeam
        .filter((member) => member.championId > 0)
        .map((member) => detected(member, byKey))

      return {
        state: 'champ-select',
        phase,
        me: meMember ? detected(meMember, byKey) : null,
        enemies,
        hiddenEnemies: session.theirTeam.filter((member) => member.championId <= 0).length,
      }
    } catch (error) {
      return {
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
