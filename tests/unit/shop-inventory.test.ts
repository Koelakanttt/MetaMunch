import { describe, expect, it } from 'vitest'
import { shopInventory } from '../../src/shared/shop-inventory'
import { mkItem } from '../helpers/items'

describe('shopInventory', () => {
  it('exposes lane pools, quest boots and the rejected catalog entries', () => {
    const catalog = [
      mkItem(3031, 'Infinity Edge'),
      mkItem(3047, 'Plated Steelcaps', { tags: ['Boots'], goldTotal: 1200 }),
      mkItem(3174, 'Armored Advance', { tags: ['Boots'], goldTotal: 1200 }),
      // Tombstones that still claim every SR flag; the event-item rule must reject them.
      mkItem(3904, "Demon King's Crown", { tags: ['Boots'], goldTotal: 1200 }),
      mkItem(1091, 'Quest: Mid', { goldTotal: 0 }),
    ]

    const inventory = shopInventory(catalog)

    expect(inventory.poolByRole.BOTTOM.boots.map((item) => item.name)).toEqual(['Plated Steelcaps'])
    expect(inventory.poolByRole.MIDDLE.boots.map((item) => item.name)).toEqual([
      'Plated Steelcaps',
      'Armored Advance',
    ])
    expect(inventory.laneLockedBoots).toEqual(['Armored Advance'])
    expect(inventory.rejected).toEqual(["Demon King's Crown", 'Quest: Mid'])
  })
})
