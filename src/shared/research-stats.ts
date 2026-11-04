/** 95% Wilson score interval lower bound. */
export function wilsonLowerBound(wins: number, games: number, z = 1.96): number {
  return wilsonInterval(wins, games, z).low
}

/**
 * 95% Wilson score interval. Returns fractions in [0, 1]; the UI formats them.
 */
export function wilsonInterval(
  wins: number,
  games: number,
  z = 1.96,
): { low: number; high: number } {
  if (games <= 0) return { low: 0, high: 0 }
  const p = Math.max(0, Math.min(1, wins / games))
  const z2 = z * z
  const denominator = 1 + z2 / games
  const centre = p + z2 / (2 * games)
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * games)) / games)
  return {
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
  }
}
