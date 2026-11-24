/**
 * Infill buildings for the open ground north-east of the stadium, where the OpenStreetMap extract has none.
 * Lots are laid out on a loose grid, turned to face the nearest road, and kept clear of roads, parks, rails,
 * the stadium forecourt and every real building.
 */
import { coastChain, seawardNormals } from './coast'

interface Src {
  b: { p: number[]; h: number }[]
  r: { c: string; p: number[] }[]
  g: { p: number[] }[]
  p: { p: number[]; c: [number, number] }[]
  s: number[]
}

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const inPoly = (x: number, z: number, p: number[]) => {
  let c = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if (p[i + 1] > z !== p[j + 1] > z && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c
  }
  return c
}

const aabb = (p: number[]) => {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i])
    x1 = Math.max(x1, p[i])
    z0 = Math.min(z0, p[i + 1])
    z1 = Math.max(z1, p[i + 1])
  }
  return { x0, x1, z0, z1 }
}

/** Small leftover green patches inside the infill zone: these are built over, so they are not drawn as park. */
export function isInfillPark(p: number[]) {
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length
    a += p[i] * p[j + 1] - p[j] * p[i + 1]
    cx += p[i]
    cz += p[i + 1]
  }
  cx /= p.length / 2
  cz /= p.length / 2
  return Math.abs(a) / 2 <= 2500 && cz > -1050 && cz < -30 && cx < 900 && (cx > 30 || (cx > -430 && cz < -420))
}

export function fillerBuildings(osm: Src, roadW: (c: string) => number, clear: number): { p: number[]; h: number }[] {
  const X0 = -430
  const X1 = 900
  const Z0 = -1050
  const Z1 = -30
  const CELL = 100

  // road segments by 100 m cell
  type Seg = { ax: number; az: number; bx: number; bz: number; r: number }
  const segs = new Map<string, Seg[]>()
  const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`
  for (const r of osm.r) {
    if (r.c === 'footway' || r.c === 'pedestrian') continue
    const half = r.c === 'rail' ? 9 : roadW(r.c) / 2 + 1.5
    for (let i = 0; i < r.p.length - 2; i += 2) {
      const s = { ax: r.p[i], az: r.p[i + 1], bx: r.p[i + 2], bz: r.p[i + 3], r: half }
      if (Math.max(s.ax, s.bx) < X0 - 80 || Math.min(s.ax, s.bx) > X1 + 80 || Math.max(s.az, s.bz) < Z0 - 80 || Math.min(s.az, s.bz) > Z1 + 80) continue
      const c0x = Math.floor(Math.min(s.ax, s.bx) / CELL)
      const c1x = Math.floor(Math.max(s.ax, s.bx) / CELL)
      const c0z = Math.floor(Math.min(s.az, s.bz) / CELL)
      const c1z = Math.floor(Math.max(s.az, s.bz) / CELL)
      for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) (segs.get(`${cx},${cz}`) ?? segs.set(`${cx},${cz}`, []).get(`${cx},${cz}`)!).push(s)
    }
  }
  const nearSegs = (x: number, z: number): Seg[] => {
    const out: Seg[] = []
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(segs.get(`${cx + i},${cz + j}`) ?? []))
    return out
  }
  void key
  const segDist = (s: Seg, x: number, z: number) => {
    const dx = s.bx - s.ax
    const dz = s.bz - s.az
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)))
    return Math.hypot(x - s.ax - t * dx, z - s.az - t * dz)
  }

  const reals = osm.b.map((b) => ({ p: b.p, ...aabb(b.p) })).filter((b) => b.x1 > X0 - 40 && b.x0 < X1 + 40 && b.z1 > Z0 - 40 && b.z0 < Z1 + 40)
  // large parks stay green; the small leftover green patches are built over
  const polyArea = (p: number[]) => {
    let a = 0
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length
      a += p[i] * p[j + 1] - p[j] * p[i + 1]
    }
    return Math.abs(a) / 2
  }
  const greens = [...osm.g, ...osm.p].filter((g) => polyArea(g.p) > 2500).map((g) => ({ p: g.p, ...aabb(g.p) }))
  // the sea side of the coast, plus a margin landward for the promenade, wall and rocks
  const ch = coastChain(osm.s)
  const nrm = seawardNormals(ch)
  const nearCoast = (x: number, z: number) => {
    let best = Infinity
    let k = 0
    for (let i = 0; i < ch.length; i++) {
      const d = Math.abs(ch[i][0] - x) + Math.abs(ch[i][1] - z)
      if (d < best) {
        best = d
        k = i
      }
    }
    // signed distance to the coast along its seaward normal: positive = at sea, small negative = still on the shore strip
    return (x - ch[k][0]) * nrm[k][0] + (z - ch[k][1]) * nrm[k][1] > -55
  }
  const placed: { x: number; z: number; r: number }[] = []
  const out: { p: number[]; h: number }[] = []

  let n = 0
  for (let gz = Z0; gz < Z1; gz += 20) {
    for (let gx = X0; gx < X1; gx += 20) {
      n++
      if (gx < 30 && gz > -420) continue // west of the railway only up north, where the land is open
      if (hash(n) < 0.18) continue // leave some gaps so it doesn't look like a grid
      const cx = gx + (hash(n + 1) - 0.5) * 10
      const cz = gz + (hash(n + 2) - 0.5) * 10
      const w = 11 + hash(n + 3) * 12
      const d = 11 + hash(n + 4) * 12
      const near = nearSegs(cx, cz)
      // face the nearest road, else stay square to the map
      let ang = 0
      let best = Infinity
      for (const s of near) {
        const dist = segDist(s, cx, cz)
        if (dist < best) {
          best = dist
          ang = Math.atan2(s.bz - s.az, s.bx - s.ax)
        }
      }
      if (best > 70) ang = 0
      const ux = Math.cos(ang)
      const uz = Math.sin(ang)
      const vx = -uz
      const vz = ux
      const corner = (a: number, b: number): [number, number] => [cx + ux * a * w + vx * b * d, cz + uz * a * w + vz * b * d]
      const pts: [number, number][] = []
      for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) pts.push(corner(a, b))
      let ok = Math.hypot(cx, cz) > clear + 30
      for (let i = 0; ok && i < pts.length; i++) {
        const [x, z] = pts[i]
        for (const s of near) if (segDist(s, x, z) < s.r) ok = false
        if (nearCoast(x, z)) ok = false
        for (const g of greens) if (x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1 && inPoly(x, z, g.p)) ok = false
        for (const b of reals) if (x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3 && (inPoly(x, z, b.p) || (i === 4))) ok = false
        if (!ok) break
      }
      if (!ok) continue
      // a real building's corner poking into the lot
      const lot = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)].flat()
      for (const b of reals) {
        if (!ok) break
        if (b.x1 < cx - w - 4 || b.x0 > cx + w + 4 || b.z1 < cz - d - 4 || b.z0 > cz + d + 4) continue
        for (let k = 0; k < b.p.length; k += 2) if (inPoly(b.p[k], b.p[k + 1], lot)) ok = false
      }
      const rad = Math.hypot(w, d) / 2
      for (const q of placed) if (Math.hypot(q.x - cx, q.z - cz) < (q.r + rad) * 0.85) ok = false
      if (!ok) continue
      placed.push({ x: cx, z: cz, r: rad })
      // mostly mid-rise, a few taller
      out.push({ p: lot, h: 9 + hash(n + 5) ** 1.6 * 34 })
    }
  }
  return out
}
