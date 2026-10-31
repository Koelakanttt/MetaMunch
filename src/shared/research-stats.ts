/**
 * 95% Wilson score interval lower bound. Used whenever options are ordered by win rate:
 * a 3/3 option must not beat a 60/100 option by accident.
 */
export function wilsonLowerBound(wins: number, games: number, z = 1.96): number {
  if (games <= 0) return 0
  const p = Math.max(0, Math.min(1, wins / games))
  const z2 = z * z
  const denominator = 1 + z2 / games
  const centre = p + z2 / (2 * games)
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * games)) / games)
  return Math.max(0, Math.min(1, (centre - spread) / denominator))
}
