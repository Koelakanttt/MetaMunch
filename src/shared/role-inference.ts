import type { Role } from './rules'
import { ROLES } from './rules'

export type RoleSource = 'riot' | 'inferred' | 'unknown'

const VALID_ROLES = new Set<string>(ROLES)
const SMITE = 11

export interface RoleInferenceInput {
  teamPosition: string
  individualPosition: string
  summoner1: number
  summoner2: number
}

export interface RoleInference {
  role: Role | null
  source: RoleSource
}

function asRole(value: string): Role | null {
  return VALID_ROLES.has(value) ? (value as Role) : null
}

/** Uses only trustworthy Riot fields; ambiguous positions stay unknown rather than guessed. */
export function inferRole(input: RoleInferenceInput): RoleInference {
  const team = asRole(input.teamPosition)
  if (team) return { role: team, source: 'riot' }
  const individual = asRole(input.individualPosition)
  if (individual) return { role: individual, source: 'inferred' }
  if (input.summoner1 === SMITE || input.summoner2 === SMITE) {
    return { role: 'JUNGLE', source: 'inferred' }
  }
  return { role: null, source: 'unknown' }
}
