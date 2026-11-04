import {
  buildItemPool,
  isPurchasableOnSR,
  itemLaneRequirement,
} from './item-traits'
import { ROLES, type Role } from './rules'

export interface ShopInventory {
  /** Every item purchasable on Summoner's Rift, by role (lane-restricted items filtered). */
  poolByRole: Record<Role, ReturnType<typeof buildItemPool>>
  /** Names of tier-3 quest boots the lane may receive. */
  laneLockedBoots: string[]
  /** Catalog items that fail the strict Summoner's Rift check (event, legacy, tombstone). */
  rejected: string[]
}

/** One source of truth for what the shop and the recommendations may use on map 11. */
export function shopInventory(items: Parameters<typeof buildItemPool>[0]): ShopInventory {
  const poolByRole = {} as Record<Role, ReturnType<typeof buildItemPool>>
  const laneLocked = new Set<string>()
  const rejected: string[] = []
  for (const role of ROLES) {
    poolByRole[role] = buildItemPool(items, [], role)
  }
  for (const item of items) {
    if (!isPurchasableOnSR(item)) {
      rejected.push(item.name)
      continue
    }
    if (item.tags.includes('Boots') && itemLaneRequirement(item.name) !== null) {
      laneLocked.add(item.name)
    }
  }
  return { poolByRole, laneLockedBoots: [...laneLocked], rejected }
}
