import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Playing field semi-axes (m), fitted to Wankhede's mapped outline (≈ circular, ~140 m across). */
export const A = 71
export const B = 69
export const DEPTH = 0.8
const SEAT_W = 0.48
/** Terrace is cut into blocks; each block = 1 aisle segment + 5 seat segments. */
const SEG = 6
const rad = (d: number) => (d * Math.PI) / 180

export interface Stand {
  id: number
  name: string
  t0: number
  t1: number
  color: string
  /** Offset of this stand's first block letter (A = 0). Ticketing sites letter blocks per stand, e.g. Vijay Merchant F–L. */
  firstBlock: number
  booked: number
  blocks: number
  roof?: boolean
  /** Level 1 is the players' pavilion building, not seating. */
  pavilion?: boolean
}

// Stand names, per-stand block letters (Vijay Merchant F–L, Gavaskar A–F, Dilip Vengsarkar from H, North from G…) and
// levels L1–L3 follow Wankhede's ticketing listings. Their placement around the bowl is approximate.
const bounds = [-30, 0, 30, 75, 120, 170, 225, 280, 330]
const GAP = 1.75
const defs: Omit<Stand, 'id' | 't0' | 't1'>[] = [
  { name: 'MCA Pavilion', firstBlock: 0, color: '#e8a3b4', booked: 0.8, blocks: 4, roof: true },
  { name: 'Grand Stand', firstBlock: 0, color: '#f4c29b', booked: 0.7, blocks: 4, roof: true },
  { name: 'Vijay Merchant Stand', firstBlock: 5, color: '#bfa8e8', booked: 0.4, blocks: 7, roof: true },
  { name: 'Garware Stand', firstBlock: 0, color: '#f1de9a', booked: 0.65, blocks: 6, roof: true },
  { name: 'Sunil Gavaskar Stand', firstBlock: 0, color: '#9fdbe8', booked: 0.5, blocks: 6, roof: true },
  { name: 'Dilip Vengsarkar Stand', firstBlock: 7, color: '#a9e0bf', booked: 0.45, blocks: 7, roof: true },
  { name: 'Sachin Tendulkar Stand', firstBlock: 0, color: '#9fc2f0', booked: 0.55, blocks: 7, roof: true },
  { name: 'North Stand', firstBlock: 6, color: '#f0b3d4', booked: 0.3, blocks: 7, roof: true },
]
export const STANDS: Stand[] = defs.map((d, id) => ({ ...d, id, t0: bounds[id] + GAP, t1: bounds[id + 1] - GAP }))

export const TIER_NAMES = ['Level 1', 'Level 2', 'Level 3'] as const
/** Neutral moulded-plastic seat colours used in first-person view (no availability colours). */
export const SEAT_COLORS = ['#2b5aa8', '#1f4382', '#3f78c4']
export const levelsOf = (s: Stand): number[] => (s.pavilion ? [1, 2] : [0, 1, 2])

const WALL = 0
const TREAD = 1
const RISER = 2
const DECK = 3
const HOARD = 4
type Kind = 0 | 1 | 2 | 3 | 4
/** Cross-section: (distance from boundary, height, surface kind arriving at this point). */
export const PROFILE: [number, number, Kind][] = [
  [1.5, 0, HOARD],
  [1.5, 0.9, HOARD],
  [3, 0.9, TREAD],
]
export interface RowInfo {
  tier: 0 | 1 | 2
  row: number
  d: number
  y: number
}
/** The plain wall strips between floors (facing the pitch), where each stand's name is written. */
export const STRIPS: { d: number; y0: number; y1: number }[] = []
export const ROWS: RowInfo[] = []
;(() => {
  let d = 3
  let y = 0.9
  const tier = (t: 0 | 1 | 2, rows: number, rise: number) => {
    for (let r = 0; r < rows; r++) {
      y += rise
      PROFILE.push([d, y, RISER], [d + DEPTH, y, TREAD])
      ROWS.push({ tier: t, row: r, d, y })
      d += DEPTH
    }
  }
  tier(0, 12, 0.42)
  for (const [t, rows, rise] of [[1, 12, 0.5], [2, 15, 0.62]] as const) {
    PROFILE.push([d + 2.5, y, DECK])
    d += 2.5
    y += 3.2
    PROFILE.push([d, y, WALL])
    STRIPS.push({ d, y0: y - 3.2, y1: y })
    tier(t, rows, rise)
  }
  PROFILE.push([d, y * 0.7, WALL], [d, y * 0.4, WALL], [d, 0, WALL]) // outer facade bands
})()
export const OUTER = PROFILE[PROFILE.length - 1][0]
export const TOP = Math.max(...PROFILE.map((p) => p[1]))

const ptOnStand = (d: number, t: number): [number, number] => [(A + d) * Math.cos(t), (B + d) * Math.sin(t)]

/** Sweep a closed 2D (d, y) profile along a stand's arc; edge i uses edgeColors[i]. */
function sweep(prof: [number, number][], edgeColors: Color[], t0: number, t1: number, N: number, skipEdge = -1, ribbed = -1) {
  const pos: number[] = []
  const col: number[] = []
  const push = (d: number, y: number, t: number, c: Color) => {
    const [x, z] = ptOnStand(d, t)
    pos.push(x, y, z)
    col.push(c.r, c.g, c.b)
  }
  for (let i = 0; i < prof.length; i++) {
    if (i === skipEdge) continue
    const [d0, y0] = prof[i]
    const [d1, y1] = prof[(i + 1) % prof.length]
    for (let j = 0; j < N; j++) {
      const ta = t0 + ((t1 - t0) * j) / N
      const tb = t0 + ((t1 - t0) * (j + 1)) / N
      const c = i === ribbed && j % 2 ? edgeColors[i].clone().multiplyScalar(0.9) : edgeColors[i]
      push(d0, y0, ta, c); push(d1, y1, ta, c); push(d1, y1, tb, c)
      push(d0, y0, ta, c); push(d1, y1, tb, c); push(d0, y0, tb, c)
    }
  }
  const tris = ShapeUtils.triangulateShape(prof.map((p) => new Vector2(p[0], p[1])), [])
  for (const t of [t0, t1]) for (const tri of tris) for (const k of tri) push(prof[k][0], prof[k][1], t, edgeColors[0])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/** Flat label surface over a floor-separating strip: u runs left to right as seen from the pitch, v bottom to top. */
export function buildStrip(s: Stand, k: number): BufferGeometry {
  const { d, y0, y1 } = STRIPS[k]
  const N = 40
  const t0 = rad(s.t0)
  const t1 = rad(s.t1)
  const pos: number[] = []
  const uv: number[] = []
  const push = (j: number, y: number, v: number) => {
    const t = t0 + ((t1 - t0) * j) / N
    const [x, z] = ptOnStand(d - 0.1, t)
    pos.push(x, y, z)
    uv.push(j / N, v)
  }
  for (let j = 0; j < N; j++) {
    push(j, y0 + 0.2, 0); push(j + 1, y0 + 0.2, 0); push(j, y1 - 0.2, 1)
    push(j + 1, y0 + 0.2, 0); push(j + 1, y1 - 0.2, 1); push(j, y1 - 0.2, 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return g
}

export function buildTerrace(s: Stand): BufferGeometry {
  const N = s.blocks * SEG + 1
  const t0 = rad(s.t0)
  const t1 = rad(s.t1)
  const pos: number[] = []
  const col: number[] = []
  const kinds = [
    new Color('#8a8f98'),
    new Color('#b9bcc2'),
    new Color(s.color).lerp(new Color('#9aa0aa'), 0.55),
    new Color('#8d9199'),
    new Color('#1d4fa3'),
  ]
  const ads = ['#2b3140', '#343b4b'].map((c) => new Color(c)) // plain dark boundary wall (no ad colours)
  const pavGlass = new Color('#86b9de')
  const pavDeck = new Color('#eceff4')
  const stair = new Color('#e6e1d3')
  // outer facade: pale concrete fins on top, glazed concourse band, darker base with openings
  const facade = ['#cfcabd', '#b3aea1', '#2c3e54', '#bdb8ab', '#23252a', '#9b958a'].map((c) => new Color(c))
  const push = (d: number, y: number, t: number, c: Color) => {
    const [x, z] = ptOnStand(d, t)
    pos.push(x, y, z)
    col.push(c.r, c.g, c.b)
  }
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [d0, y0] = PROFILE[i]
    const [d1, y1, k] = PROFILE[i + 1]
    // the players' pavilion occupies Level 1: same staircase, finished as glazed risers and pale decks, so every edge lines up
    const pav = !!s.pavilion && i + 1 >= 3 && i + 1 <= 2 + 2 * 12
    const band = i - (PROFILE.length - 4) // 0 top, 1 middle, 2 base of the outer facade (negative = not facade)
    for (let j = 0; j < N; j++) {
      const ta = t0 + ((t1 - t0) * j) / N
      const tb = t0 + ((t1 - t0) * (j + 1)) / N
      const c =
        j % SEG === 0 && (k === TREAD || k === RISER)
          ? stair
          : band === 0
            ? facade[j % 2]
            : band === 1
              ? facade[2 + (j % 2)]
              : band === 2
                ? facade[j % 3 === 0 ? 4 : 5]
                : k === HOARD
                  ? ads[Math.floor(j / 2) % ads.length]
                  : pav
                    ? k === TREAD
                      ? pavDeck
                      : pavGlass
                    : kinds[k]
      push(d0, y0, ta, c); push(d1, y1, ta, c); push(d1, y1, tb, c)
      push(d0, y0, ta, c); push(d1, y1, tb, c); push(d0, y0, tb, c)
    }
  }
  const tris = ShapeUtils.triangulateShape(PROFILE.map((p) => new Vector2(p[0], p[1])), [])
  for (const t of [t0, t1]) for (const tri of tris) for (const k of tri) push(PROFILE[k][0], PROFILE[k][1], t, kinds[0])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/**
 * Players' pavilion building that replaces Level 1 on the MCA Pavilion stand. Its roof steps up with the same
 * staircase as the rest of the bowl (so its ends match the neighbouring stands) instead of being a square block.
 */
export function buildPavilion(s: Stand): BufferGeometry {
  const rows = ROWS.filter((r) => r.tier === 0)
  const top0 = rows[0].y + 1.55 // flat parapet over the front rooms, then the roof climbs row by row
  const prof: [number, number][] = [[1.5, 0.9], [1.5, top0]]
  const cols: Color[] = [new Color('#7fb3dc')] // glazed front
  const tread = new Color('#e9ecf1')
  const riser = new Color('#c4cad6')
  const push = (d: number, y: number, c: Color) => {
    const last = prof[prof.length - 1]
    if (Math.abs(last[0] - d) < 1e-6 && Math.abs(last[1] - y) < 1e-6) return
    prof.push([d, y])
    cols.push(c)
  }
  for (const r of rows) {
    const y = Math.max(r.y + 0.35, top0)
    push(r.d, y, riser)
    push(r.d + DEPTH, y, tread)
  }
  const end = rows[rows.length - 1]
  push(end.d + DEPTH, 0.9, new Color('#aab2c0')) // back wall down to the floor
  cols.push(new Color('#aab2c0')) // bottom edge (skipped)
  return sweep(prof, cols, rad(s.t0), rad(s.t1), 24, prof.length - 1)
}

const OUT_STAND = 22
/** Suspended steel cantilever roof (Teflon-coated fabric): ~22 m cantilever over the upper levels. */
export function buildRoof(s: Stand): BufferGeometry {
  const df = OUTER - OUT_STAND
  const db = OUTER + 3
  const prof: [number, number][] = [[df, TOP + 0.5], [db, TOP + 7.5], [db, TOP + 8.1], [df, TOP + 1.1]]
  return sweep(prof, [new Color('#cdd2db'), new Color('#8a929e'), new Color('#f4f6f9'), new Color('#3f4650')], rad(s.t0), rad(s.t1), 24, -1, 2)
}

/** Thin lighting strip along the roof's leading edge (glows at night). */
export function buildRim(s: Stand): BufferGeometry {
  const df = OUTER - OUT_STAND
  const prof: [number, number][] = [[df - 0.5, TOP - 0.1], [df + 0.2, TOP - 0.1], [df + 0.2, TOP + 0.4], [df - 0.5, TOP + 0.4]]
  const c = new Color('#fff4d6')
  return sweep(prof, [c, c, c, c], rad(s.t0), rad(s.t1), 24)
}

function strut(a: Vector3, b: Vector3, r: number, c: Color) {
  const dir = b.clone().sub(a)
  const g = new CylinderGeometry(r, r, dir.length(), 5).toNonIndexed()
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  g.setAttribute('color', new Float32BufferAttribute(new Array(g.attributes.position.count).fill(0).flatMap(() => [c.r, c.g, c.b]), 3))
  return g
}

/** Masts behind the stand with stay cables to the roof's leading edge. */
export function buildMasts(s: Stand): BufferGeometry {
  const t0 = rad(s.t0)
  const dt = (rad(s.t1) - t0) / (s.blocks * SEG + 1)
  const parts: BufferGeometry[] = []
  const steel = new Color('#7d8591')
  for (let b = 0; b <= s.blocks; b++) {
    const t = t0 + dt * (SEG * b + 0.5)
    const [mx, mz] = ptOnStand(OUTER + 1.2, t)
    const [fx, fz] = ptOnStand(OUTER - OUT_STAND, t)
    const top = new Vector3(mx, TOP + 15, mz)
    parts.push(strut(new Vector3(mx, 0, mz), top, 0.45, steel))
    parts.push(strut(top, new Vector3(fx, TOP + 0.8, fz), 0.07, steel))
  }
  return mergeGeometries(parts)
}

export interface SeatSet {
  count: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  rot: Float32Array
  tier: Uint8Array
  row: Uint8Array
  block: Uint8Array
  num: Uint16Array
  /** 0 = available, 1 = booked */
  status: Uint8Array
  /** Seats are stored level by level; tierStart[t]..tierStart[t+1] is level t. */
  tierStart: [number, number, number, number]
  free: [number, number, number]
  total: [number, number, number]
  /** [level][block] seat counts */
  blockFree: number[][]
  blockTotal: number[][]
}

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function arcLen(d: number, t0: number, t1: number) {
  let len = 0
  let [px, pz] = ptOnStand(d, t0)
  for (let i = 1; i <= 8; i++) {
    const [x, z] = ptOnStand(d, t0 + ((t1 - t0) * i) / 8)
    len += Math.hypot(x - px, z - pz)
    ;[px, pz] = [x, z]
  }
  return len
}

/** Split `total` over `weights` in proportion, in whole numbers that add up exactly (largest remainder). */
function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (w * total) / sum)
  const out = exact.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  exact
    .map((e, i) => [e - Math.floor(e), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => left-- > 0 && out[i]++)
  return out
}

/** Seats that physically fit in each row of each block, before scaling to the real capacity. */
function rawPlan(s: Stand) {
  const t0 = rad(s.t0)
  const dt = (rad(s.t1) - t0) / (s.blocks * SEG + 1)
  const rows = ROWS.filter((r) => !(s.pavilion && r.tier === 0))
  const plan = rows.map((r) =>
    Array.from({ length: s.blocks }, (_, b) => Math.floor(arcLen(r.d + DEPTH * 0.55, t0 + (SEG * b + 1) * dt, t0 + (SEG * b + SEG) * dt) / SEAT_W)),
  )
  return { rows, plan }
}

/** Official capacity of the Wankhede Stadium (Mumbai Indians / Wikipedia, after the 2011 World Cup renovation). */
export const CAPACITY = 33108

// The seats drawn are exactly the official capacity, shared between stands (and rows, and blocks) in proportion to their size.
const RAW = STANDS.map(rawPlan)
const STAND_TOTALS = apportion(RAW.map((r) => r.plan.flat().reduce((a, b) => a + b, 0)), CAPACITY)
const PLANS = RAW.map((r, i) => {
  const flat = apportion(r.plan.flat(), STAND_TOTALS[i])
  const blocks = STANDS[i].blocks
  return { rows: r.rows, plan: r.rows.map((_, ri) => flat.slice(ri * blocks, (ri + 1) * blocks)) }
})

function buildSeats(s: Stand): SeatSet {
  const t0 = rad(s.t0)
  const N = s.blocks * SEG + 1
  const dt = (rad(s.t1) - t0) / N
  const { rows, plan } = PLANS[s.id]
  const count = plan.flat().reduce((a, b) => a + b, 0)
  const set: SeatSet = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    rot: new Float32Array(count),
    tier: new Uint8Array(count),
    row: new Uint8Array(count),
    block: new Uint8Array(count),
    num: new Uint16Array(count),
    status: new Uint8Array(count),
    tierStart: [0, 0, 0, count],
    free: [0, 0, 0],
    total: [0, 0, 0],
    blockFree: [0, 1, 2].map(() => new Array(s.blocks).fill(0)),
    blockTotal: [0, 1, 2].map(() => new Array(s.blocks).fill(0)),
  }
  const rnd = mulberry32(s.id * 9973 + 17)
  let k = 0
  rows.forEach((r, ri) => {
    let num = 1
    for (let b = 0; b < s.blocks; b++) {
      const n = plan[ri][b]
      const ta = t0 + (SEG * b + 1) * dt
      const tb = t0 + (SEG * b + SEG) * dt
      for (let q = 0; q < n; q++, k++, num++) {
        const t = ta + ((tb - ta) * (q + 0.5)) / n
        const [x, z] = ptOnStand(r.d + DEPTH * 0.55, t)
        set.x[k] = x
        set.y[k] = r.y
        set.z[k] = z
        set.rot[k] = Math.atan2(-x, -z)
        set.tier[k] = r.tier
        set.row[k] = r.row
        set.block[k] = b
        set.num[k] = num
        const booked = rnd() < s.booked * (r.tier === 0 ? 1.1 : r.tier === 1 ? 1 : 0.9)
        set.status[k] = booked ? 1 : 0
        set.total[r.tier]++
        set.blockTotal[r.tier][b]++
        if (!booked) {
          set.free[r.tier]++
          set.blockFree[r.tier][b]++
        }
      }
    }
  })
  set.tierStart = [0, set.total[0], set.total[0] + set.total[1], count]
  return set
}

export const SEATS: SeatSet[] = STANDS.map(buildSeats)

export const seatLabel = (stand: number, i: number) => {
  const s = SEATS[stand]
  return {
    tier: TIER_NAMES[s.tier[i]],
    block: blockName(s.block[i], stand),
    row: s.row[i] + 1,
    num: s.num[i],
    booked: s.status[i] === 1,
  }
}

export const seatEye = (stand: number, i: number): [number, number, number] => [SEATS[stand].x[i], SEATS[stand].y[i] + 1.2, SEATS[stand].z[i]]

/** Camera position + target framing a whole stand, or one level of it, from over the pitch. */
export function standView(i: number, tier: number | null = null) {
  const s = STANDS[i]
  const t = rad((s.t0 + s.t1) / 2)
  const rows = tier === null ? ROWS : ROWS.filter((r) => r.tier === tier)
  const mid = rows[Math.floor(rows.length / 2)]
  const [cx, cz] = ptOnStand(mid.d, t)
  const len = Math.hypot(cx, cz)
  const dist = tier === null ? 72 : 64
  const lift = tier === null ? 34 : 30
  return { pos: [cx - (cx / len) * dist, mid.y + lift, cz - (cz / len) * dist] as const, target: [cx, mid.y, cz] as const }
}

const RISE = [0.42, 0.5, 0.62]
/**
 * Translucent shell over one whole block (all its rows and aisle) on one floor, following the stairs and sitting just
 * above the seat tops. Used to pick and highlight a block as a unit.
 */
export function buildBlockPatch(s: Stand, tier: number, block: number): BufferGeometry {
  const N = s.blocks * SEG + 1
  const t0 = rad(s.t0)
  const dt = (rad(s.t1) - t0) / N
  const ta = t0 + (SEG * block + 0.5) * dt
  const tb = t0 + (SEG * block + SEG + 0.5) * dt
  const LIFT = 0.95
  const pos: number[] = []
  const P = (d: number, y: number, t: number) => {
    const [x, z] = ptOnStand(d, t)
    pos.push(x, y, z)
  }
  const quad = (d0: number, y0: number, d1: number, y1: number) => {
    for (let j = 0; j < 5; j++) {
      const a = ta + ((tb - ta) * j) / 5
      const b = ta + ((tb - ta) * (j + 1)) / 5
      P(d0, y0, a); P(d1, y1, a); P(d1, y1, b)
      P(d0, y0, a); P(d1, y1, b); P(d0, y0, b)
    }
  }
  for (const r of ROWS.filter((q) => q.tier === tier)) {
    quad(r.d, r.y - RISE[tier] + LIFT, r.d, r.y + LIFT)
    quad(r.d, r.y + LIFT, r.d + DEPTH, r.y + LIFT)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return g
}

/** Camera framing one block on one floor from over the pitch. */
export function blockView(i: number, tier: number, block: number) {
  const s = STANDS[i]
  const N = s.blocks * SEG + 1
  const t0 = rad(s.t0)
  const t = t0 + ((rad(s.t1) - t0) / N) * (SEG * block + (SEG + 1) / 2)
  const rows = ROWS.filter((r) => r.tier === tier)
  const mid = rows[Math.floor(rows.length / 2)]
  const [cx, cz] = ptOnStand(mid.d, t)
  const len = Math.hypot(cx, cz)
  return { pos: [cx - (cx / len) * 14.5, mid.y + 6, cz - (cz / len) * 14.5] as const, target: [cx, mid.y - 1.2, cz] as const }
}

/** Block letter for block index b of a stand (letters are per stand, as on the ticketing sites). */
/** Middle of a block on one floor as a flat patch lying on the raked seats: centre plus x (along the arc), s (up the slope) and n (out of the seats) unit vectors. */
export function blockSurface(i: number, tier: number, block: number) {
  const s = STANDS[i]
  const t0 = rad(s.t0)
  const t = t0 + ((rad(s.t1) - t0) / (s.blocks * SEG + 1)) * (SEG * block + (SEG + 1) / 2)
  const rows = ROWS.filter((r) => r.tier === tier)
  const first = rows[0]
  const last = rows[rows.length - 1]
  // centre of the whole block: halfway across the rows, just above the seat tops
  const [x, z] = ptOnStand((first.d + last.d + DEPTH) / 2, t)
  const p: [number, number, number] = [x, (first.y + last.y) / 2 - RISE[tier] / 2 + 0.95 + 0.04, z]
  const c = Math.cos(t)
  const sn = Math.sin(t)
  const len = Math.hypot(DEPTH, RISE[tier])
  const a = DEPTH / len
  const b = RISE[tier] / len
  const tx: [number, number, number] = [-sn, 0, c]
  const sl: [number, number, number] = [c * a, b, sn * a]
  const n: [number, number, number] = [-c * b, a, -sn * b]
  return { p, x: tx, s: sl, n }
}

/** Front row of a floor at the end of the stand that appears on the left from the stand-view camera. */
export function levelAnchor(i: number, tier: number): [number, number, number] {
  const s = STANDS[i]
  const ta = rad(s.t0)
  const tb = rad(s.t1)
  const tm = (ta + tb) / 2
  const [mx, mz] = ptOnStand(0, tm)
  const len = Math.hypot(mx, mz)
  const right = [-mz / len, mx / len] // camera looks outward from the pitch, so right = (-fz, fx)
  const side = (t: number) => {
    const [x, z] = ptOnStand(0, t)
    return (x - mx) * right[0] + (z - mz) * right[1]
  }
  const leftIsStart = side(ta) < side(tb)
  const rows = ROWS.filter((r) => r.tier === tier)
  const low = rows[0]
  const [x, z] = ptOnStand(low.d - 1.5, leftIsStart ? ta - 0.03 : tb + 0.03)
  return [x, low.y + 0.6, z]
}

export const blockName = (b: number, standId: number) => String.fromCharCode(65 + STANDS[standId].firstBlock + b)
