/** Compares dotted version strings numerically, part by part ("16.9" < "16.21"). */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  const length = Math.max(partsA.length, partsB.length)
  for (let index = 0; index < length; index += 1) {
    const left = partsA[index] ?? 0
    const right = partsB[index] ?? 0
    if (left !== right) return left - right
  }
  return 0
}

export function compareVersionsDesc(a: string, b: string): number {
  return compareVersions(b, a)
}
