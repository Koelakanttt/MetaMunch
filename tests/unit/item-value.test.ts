import { describe, expect, it } from 'vitest'
import type { Champion } from '../../src/shared/ddragon'
import {
  championStatWeights,
  itemMath,
  itemStats,
  optimizeBuild,
  statGoldValue,
  type ThreatMetrics,
} from '../../src/shared/item-value'
import { mkItem, stats } from '../helpers/items'

const noThreats: ThreatMetrics = {
  adShare: 0,
  apShare: 0,
  healers: 0,
  hardCc: 0,
  tanks: 0,
  assassins: 0,
  marksmen: 0,
  mages: 0,
}

function champion(tags: string[]): Champion {
  return {
    key: 1,
    id: 'TestChampion',
    name: 'Test Champion',
    tags,
    info: { attack: 7, defense: 4, magic: 2, difficulty: 3 },
    stats: { hp: 600, armor: 30, spellblock: 30 },
  }
}

describe('item math', () => {
  it('normalizes Data Dragon stats and reads ability haste from the description', () => {
    const item = mkItem(1, 'Test Blade', {
      stats: {
        FlatPhysicalDamageMod: 40,
        PercentAttackSpeedMod: 0.25,
        FlatCritChanceMod: 0.2,
      },
      description: stats([20, 'Ability Haste']),
      goldTotal: 3000,
    })

    const vector = itemStats(item)

    expect(vector.ad).toBe(40)
    expect(vector.attackSpeed).toBe(25)
    expect(vector.crit).toBe(20)
    expect(vector.abilityHaste).toBe(20)
    expect(statGoldValue(vector)).toBeGreaterThan(0)
  })

  it('values AD higher than AP for an AD marksman', () => {
    const ad = mkItem(1, 'AD Item', { stats: { FlatPhysicalDamageMod: 40 } })
    const ap = mkItem(2, 'AP Item', { stats: { FlatMagicDamageMod: 80 } })
    const marksman = champion(['Marksman'])

    const adMath = itemMath(ad, 'ad', 'marksman', noThreats)
    const apMath = itemMath(ap, 'ad', 'marksman', noThreats)

    expect(adMath.utility).toBeGreaterThan(apMath.utility)
    expect(marksman.tags).toContain('Marksman')
  })

  it('raises the value of defensive stats against a physical threat', () => {
    const physical = championStatWeights('ad', 'tank', {
      ...noThreats,
      adShare: 1,
    })
    const magic = championStatWeights('ad', 'tank', {
      ...noThreats,
      apShare: 1,
    })

    expect(physical.armor).toBeGreaterThan(magic.armor)
    expect(magic.mr).toBeGreaterThan(physical.mr)
  })

  it('values antiheal when the enemy team has a healer', () => {
    const item = mkItem(1, 'Wounds Item', {
      description: stats([40, '% Wounds']),
      stats: { FlatPhysicalDamageMod: 30 },
    })

    const withoutHealer = itemMath(item, 'ad', 'bruiser', noThreats)
    const withHealer = itemMath(item, 'ad', 'bruiser', {
      ...noThreats,
      healers: 1,
    })

    expect(withHealer.utility).toBeGreaterThan(withoutHealer.utility)
  })
})

describe('optimizeBuild', () => {
  const items = [
    mkItem(1, 'AD One', { stats: { FlatPhysicalDamageMod: 40 } }),
    mkItem(2, 'AD Two', { stats: { FlatPhysicalDamageMod: 30 } }),
    mkItem(3, 'AP One', { stats: { FlatMagicDamageMod: 80 } }),
    mkItem(4, 'Tank One', { stats: { FlatHPPoolMod: 500, FlatArmorMod: 40 } }),
  ]
  const boots = [mkItem(10, 'Boots', { tags: ['Boots'], stats: { FlatMovementSpeedMod: 45 } })]

  it('maximizes utility under the slot and boot constraints', () => {
    const build = optimizeBuild(items, boots, 'ad', 'marksman', noThreats, {
      maxItems: 3,
      requireBoots: true,
    })

    expect(build).not.toBeNull()
    if (!build) throw new Error('optimizer returned no build')
    expect(build.boots?.name).toBe('Boots')
    expect(build.items.map((item) => item.name)).toContain('AD One')
    expect(build.items.map((item) => item.name)).not.toContain('AP One')
    expect(build.items.length + (build.boots ? 1 : 0)).toBeLessThanOrEqual(3)
  })

  it('respects item group limits', () => {
    const wounds = [
      mkItem(20, 'Wounds A', {
        stats: { FlatPhysicalDamageMod: 35 },
        description: stats([40, '% Wounds']),
      }),
      mkItem(21, 'Wounds B', {
        stats: { FlatPhysicalDamageMod: 35 },
        description: stats([40, '% Wounds']),
      }),
    ]

    const build = optimizeBuild(wounds, boots, 'ad', 'marksman', {
      ...noThreats,
      healers: 1,
    }, {
      maxItems: 2,
      groups: [{ trait: 'antiheal', max: 1 }],
    })

    expect(build?.items.filter((item) => item.name.startsWith('Wounds'))).toHaveLength(1)
  })

  it('is deterministic', () => {
    const first = optimizeBuild(items, boots, 'ad', 'marksman', noThreats, {
      maxItems: 3,
    })
    const second = optimizeBuild(items, boots, 'ad', 'marksman', noThreats, {
      maxItems: 3,
    })

    expect(first?.items.map((item) => item.id)).toEqual(second?.items.map((item) => item.id))
  })
})
