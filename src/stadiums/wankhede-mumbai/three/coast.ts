/** Helpers for the Arabian Sea coastline (OSM coastline chain stored at the start of `osm.s`). */
export type P = [number, number]

export function coastChain(s: number[]): P[] {
  const n = s.length / 2 - 2 // the last two polygon points only close the sea far offshore
  return Array.from({ length: n }, (_, i) => [s[i * 2], s[i * 2 + 1]] as P)
}

/**
 * Unit normals pointing out to sea. The side is decided once, where the coast is nearest the stadium (land is on the
 * stadium side), and then carried along the chain so it can never flip where the coast runs nearly towards the stadium.
 */
export function seawardNormals(chain: P[]): P[] {
  const raw = chain.map((_, i) => {
    const a = chain[Math.max(0, i - 1)]
    const b = chain[Math.min(chain.length - 1, i + 1)]
    const tx = b[0] - a[0]
    const tz = b[1] - a[1]
    const l = Math.hypot(tx, tz) || 1
    return [tz / l, -tx / l] as P
  })
  let m = 0
  chain.forEach((p, i) => {
    if (Math.hypot(p[0], p[1]) < Math.hypot(chain[m][0], chain[m][1])) m = i
  })
  const out = raw.slice()
  if (out[m][0] * -chain[m][0] + out[m][1] * -chain[m][1] > 0) out[m] = [-out[m][0], -out[m][1]]
  for (const dir of [1, -1]) {
    for (let i = m + dir; i >= 0 && i < chain.length; i += dir) {
      const prev = out[i - dir]
      if (raw[i][0] * prev[0] + raw[i][1] * prev[1] < 0) out[i] = [-raw[i][0], -raw[i][1]]
    }
  }
  return out
}

/** Point on the coast plus `off` metres seaward (negative = landward). */
export const at = (chain: P[], n: P[], i: number, off: number): P => [
  chain[i][0] + n[i][0] * off,
  chain[i][1] + n[i][1] * off,
]

/** 0..1: how much the sea is pushed out at a coast point (full near the stadium, none far away). */
export const pushK = (p: P) => Math.min(1, Math.max(0, (1700 - Math.hypot(p[0], p[1])) / 300))

/** Pushes the coast out to sea near the stadium so a promenade fits between the road and the water. */
export function pushedOut(chain: P[], n: P[], amount: number): P[] {
  return chain.map((p, i) => {
    return at(chain, n, i, amount * pushK(p))
  })
}

export function distToChain(x: number, z: number, chain: P[]) {
  let best = Infinity
  for (let i = 0; i < chain.length - 1; i++) {
    const [ax, az] = chain[i]
    const dx = chain[i + 1][0] - ax
    const dz = chain[i + 1][1] - az
    const l = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l))
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz))
  }
  return best
}
