import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Quaternion,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
export interface StadiumData {
  slug: string
  name: string
  /** Shorter name used on the cards (defaults to `name`). */
  shortName?: string
  /** Locale for grouping digits in seat counts (e.g. 'en-IN' gives 33,108 as 33,108 and 100,024 as 1,00,024). */
  numberLocale?: string
  /** Folder under src/stadiums holding this stadium's data/ and scene code. */
  folder: string
  city: string
  country: string
  /** Flag shown on the opening veil ('in' or 'au'). */
  flag: 'in' | 'au'
  blurb: string
  /** Order of the stands in the card list, by name; any stand left out goes last. */
  listOrder: string[]
  tickets: { name: string; url: string; icon: string; zoom: number }[]
  /** How much closer than the base view the camera rests on the overview. */
  cameraZoom: number
  capacity: number
  field: {
    a: number
    b: number
    /** Non-oval grounds: distance from the field centre to the boundary every 5° (t = 0° east, turning towards south). */
    radii?: number[]
    /** Compass bearing (0 = north, clockwise) of the pitch's long axis. */
    pitchBearing?: number
    /** Distance from the field centre to the nearest real road every 5°: stands are kept a clear gap short of it. */
    roadDist?: number[]
  }
  /** Floodlight masts as x, z (metres from the field centre) and height; omit to use the default ring of six towers. */
  towers?: { x: number; z: number; h: number; style?: 'white' }[]
  standGapDeg: number
  levels: { name: string; rows: number; rise: number; seatColor: string }[]
  stands: {
    name: string
    fromDeg: number
    toDeg: number
    color: string
    firstBlock: number
    blocks: number
    booked: number
    roof?: boolean
    pavilion?: boolean
    /** Seats in this stand; when every stand has it, the total is taken from here instead of from the geometry. */
    seats?: number
    /** This stand's own tiers (rows and rise per row), when it differs from the stadium's `levels`. */
    levels?: { rows: number; rise: number }[]
    /** How far the roof reaches over the seats from the back wall, in metres (default 22); the roof only exists when `roof` is true. */
    roofReach?: number
    /** Metres the roof sits lower than the usual roof line (negative = higher; default 0). */
    roofDrop?: number
    /** 'pavilion': red-brick building with a pitched roof; 'tent': white fabric roof. */
    style?: 'pavilion' | 'tent' | 'boards'
    /** false: no tall masts and cables behind the roof (default true). 'props': lattice A-frames leaning from the roof rim to the ground; 'lattice': a lattice ring truss along the inner roof edge with columns behind. */
    masts?: boolean | 'props' | 'lattice'
    /** Smallest fraction of its depth the stand keeps at its two ends (a curved back, like a bowl); default 1 = straight. */
    taper?: number
  }[]
}

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
  levels?: { rows: number; rise: number }[]
  roofReach?: number
  roofDrop?: number
  style?: 'pavilion' | 'tent' | 'boards'
  masts?: boolean | 'props' | 'lattice'
  taper?: number
}
export interface RowInfo {
  tier: 0 | 1 | 2
  row: number
  d: number
  y: number
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

/** Builds all the seating geometry and seat data of a stadium from its stadium.json. Shared by every stadium. */
export function createLayout(data: StadiumData) {
  const SLUG = data.slug
  const STADIUM_NAME = data.name
  /** Playing field semi-axes (m), fitted to the stadium's mapped outline. */
  const A = data.field.a
  const B = data.field.b
  const DEPTH = 0.8
  const SEAT_W = 0.48
  /** Terrace is cut into blocks; each block = 1 aisle segment + 5 seat segments. */
  const SEG = 6
  const rad = (d: number) => (d * Math.PI) / 180

  // Stand names, block letters, angles and levels come from stadium.json. Their placement around the bowl is approximate.
  const STANDS: Stand[] = data.stands.map((d, id) => ({
    ...d,
    id,
    t0: d.fromDeg + data.standGapDeg,
    t1: d.toDeg - data.standGapDeg,
  }))

  const TIER_NAMES = data.levels.map((l) => l.name)
  /** Neutral moulded-plastic seat colours used in first-person view (no availability colours). */
  const SEAT_COLORS = data.levels.map((l) => l.seatColor)
  const levelsOf = (s: Stand): number[] =>
    s.pavilion ? [1, 2] : Array.from({ length: VARIANTS[s.id].levels.length }, (_, i) => i)

  const WALL = 0
  const TREAD = 1
  const RISER = 2
  const DECK = 3
  const HOARD = 4
  type Kind = 0 | 1 | 2 | 3 | 4
  type Level = { rows: number; rise: number }
  /** Cross-section of a stand (distance from boundary, height, surface kind) and its rows and banner strips, from its tiers. */
  function makeProfile(levels: Level[], wallUp = 0) {
    const PROFILE: [number, number, Kind][] = [
      [1.5, 0, HOARD],
      [1.5, 0.9, HOARD],
      [3, 0.9, TREAD],
    ]
    /** The plain wall strips between floors (facing the pitch), where each stand's name is written. */
    const STRIPS: { d: number; y0: number; y1: number }[] = []
    const ROWS: RowInfo[] = []
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
    const [l0, ...upper] = levels
    tier(0, l0.rows, l0.rise)
    for (const [i, { rows, rise }] of upper.entries()) {
      const t = (i + 1) as 1 | 2
      PROFILE.push([d + 2.5, y, DECK])
      d += 2.5
      y += 3.2
      PROFILE.push([d, y, WALL])
      STRIPS.push({ d, y0: y - 3.2, y1: y })
      tier(t, rows, rise)
    }
    if (wallUp) {
      // a tall building behind the seats (the pavilion): the wall keeps rising above the top row
      y += wallUp
      PROFILE.push([d, y, WALL])
    }
    PROFILE.push([d, y * 0.7, WALL], [d, y * 0.4, WALL], [d, 0, WALL]) // outer facade bands
    const OUTER = PROFILE[PROFILE.length - 1][0]
    const TOP = Math.max(...PROFILE.map((p) => p[1]))
    return { PROFILE, STRIPS, ROWS, OUTER, TOP, levels }
  }
  const BASE = makeProfile(data.levels)
  /** One profile per stand: stands without their own tiers share the stadium's. */
  const VARIANTS = data.stands.map((st) =>
    st.levels ? makeProfile(st.levels, st.style === 'pavilion' ? 9 : 0) : BASE,
  )
  const { PROFILE, STRIPS, ROWS, OUTER, TOP } = BASE

  // Non-oval grounds give the boundary as a radius every 5°: smoothed and joined into a closed curve, and every stand
  // is then laid out at a distance d outwards along that curve's normal. Ovals keep the plain ellipse formula.
  const radii = data.field.radii
  const fieldR = (() => {
    if (!radii) return null
    const n = radii.length
    const sm = radii.map((_, i) => {
      let s = 0
      let w = 0
      for (let k = -2; k <= 2; k++) {
        const wk = 3 - Math.abs(k)
        s += radii[(i + k + n) % n] * wk
        w += wk
      }
      return s / w
    })
    return (t: number) => {
      const f = (((t / (2 * Math.PI)) % 1) + 1) % 1
      const x = f * n
      const i = Math.floor(x) % n
      const u = x - Math.floor(x)
      const p0 = sm[(i - 1 + n) % n]
      const p1 = sm[i]
      const p2 = sm[(i + 1) % n]
      const p3 = sm[(i + 2) % n]
      // Catmull-Rom between the samples
      return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
    }
  })()
  /** Boundary point and outward unit normal at angle t (non-oval grounds). */
  const edge = (t: number): { x: number; z: number; nx: number; nz: number } => {
    const R = fieldR!
    const e = 0.004
    const r0 = R(t - e)
    const r1 = R(t + e)
    const x0 = r0 * Math.cos(t - e)
    const z0 = r0 * Math.sin(t - e)
    const x1 = r1 * Math.cos(t + e)
    const z1 = r1 * Math.sin(t + e)
    let nx = z1 - z0
    let nz = -(x1 - x0)
    const l = Math.hypot(nx, nz) || 1
    nx /= l
    nz /= l
    const r = R(t)
    if (nx * Math.cos(t) + nz * Math.sin(t) < 0) {
      nx = -nx
      nz = -nz
    }
    return { x: r * Math.cos(t), z: r * Math.sin(t), nx, nz }
  }
  // Depth of each non-oval stand along its arc, per degree: the stand shrinks where a real road comes close (keeping a
  // clear gap between road and stand) and, with `taper`, curves in towards both ends like the back of a bowl.
  const depthFactor: (Float32Array | null)[] = data.stands.map(() => null)
  const standAtDeg = (deg: number): number => {
    for (let i = 0; i < STANDS.length; i++) {
      const st = STANDS[i]
      for (const o of [0, -360, 360]) if (deg + o >= st.t0 && deg + o <= st.t1) return i
    }
    return -1
  }
  if (fieldR) {
    const rd = data.field.roadDist
    const lim = (t: number) => {
      if (!rd) return 1e9
      const x = ((((t / (2 * Math.PI)) % 1) + 1) % 1) * rd.length
      const i = Math.floor(x) % rd.length
      const u = x - Math.floor(x)
      return rd[i] * (1 - u) + rd[(i + 1) % rd.length] * u - 13
    }
    STANDS.forEach((_, i) => {
      const V = VARIANTS[i]
      const raw = new Float32Array(360)
      for (let g = 0; g < 360; g++) {
        const t = (g * Math.PI) / 180
        raw[g] = Math.min(1, Math.max(0.3, (lim(t) - fieldR(t) - 3) / (V.OUTER + 3)))
      }
      const sm = new Float32Array(360)
      for (let g = 0; g < 360; g++) {
        let sum = 0
        for (let k = -6; k <= 6; k++) sum += raw[(g + k + 360) % 360]
        sm[g] = sum / 13
      }
      depthFactor[i] = sm
    })
  }
  const factorAt = (t: number): number => {
    if (!fieldR) return 1
    const deg = (((t * 180) / Math.PI) % 360 + 360) % 360
    const i = standAtDeg(deg)
    if (i < 0) return 1
    const st = STANDS[i]
    const f = depthFactor[i]!
    const g = deg * 1
    const a = Math.floor(g) % 360
    const u = g - Math.floor(g)
    let k = f[a] * (1 - u) + f[(a + 1) % 360] * u
    if (st.taper !== undefined && st.taper < 1) {
      let d0 = deg - st.t0
      if (d0 < -180) d0 += 360
      if (d0 > 540) d0 -= 360
      const uu = Math.min(1, Math.max(0, d0 / (st.t1 - st.t0)))
      k = Math.min(k, st.taper + (1 - st.taper) * Math.sin(Math.PI * uu) ** 0.6)
    }
    return k
  }
  const ptOnStand = (d: number, t: number): [number, number] => {
    if (!fieldR) return [(A + d) * Math.cos(t), (B + d) * Math.sin(t)]
    const e = edge(t)
    const dd = d > 0 ? d * factorAt(t) : d
    return [e.x + e.nx * dd, e.z + e.nz * dd]
  }
  /** Outward unit direction at a stand point (ovals: away from the centre, as before). */
  const outDir = (t: number, x: number, z: number): [number, number] => {
    if (fieldR) {
      const e = edge(t)
      return [e.nx, e.nz]
    }
    const l = Math.hypot(x, z) || 1
    return [x / l, z / l]
  }
  /** Radial and tangent basis used to lay flat patches on the seats (ovals: the angle's own cos/sin). */
  const basisAt = (t: number): [number, number] => {
    if (fieldR) {
      const e = edge(t)
      return [e.nx, e.nz]
    }
    return [Math.cos(t), Math.sin(t)]
  }

  /** Sweep a closed 2D (d, y) profile along a stand's arc; edge i uses edgeColors[i]. */
  function sweep(
    prof: [number, number][],
    edgeColors: Color[],
    t0: number,
    t1: number,
    N: number,
    skipEdge = -1,
    ribbed = -1,
  ) {
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
        push(d0, y0, ta, c)
        push(d1, y1, ta, c)
        push(d1, y1, tb, c)
        push(d0, y0, ta, c)
        push(d1, y1, tb, c)
        push(d0, y0, tb, c)
      }
    }
    const tris = ShapeUtils.triangulateShape(
      prof.map((p) => new Vector2(p[0], p[1])),
      [],
    )
    for (const t of [t0, t1])
      for (const tri of tris) for (const k of tri) push(prof[k][0], prof[k][1], t, edgeColors[0])
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }

  /** Flat label surface over a floor-separating strip: u runs left to right as seen from the pitch, v bottom to top. */
  function buildStrip(s: Stand, k: number): BufferGeometry {
    const { d, y0, y1 } = VARIANTS[s.id].STRIPS[k]
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
      push(j, y0 + 0.2, 0)
      push(j + 1, y0 + 0.2, 0)
      push(j, y1 - 0.2, 1)
      push(j + 1, y0 + 0.2, 0)
      push(j + 1, y1 - 0.2, 1)
      push(j, y1 - 0.2, 1)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    return g
  }

  function buildTerrace(s: Stand): BufferGeometry {
    const V = VARIANTS[s.id]
    const N = s.blocks * SEG + 1
    const t0 = rad(s.t0)
    const t1 = rad(s.t1)
    const pos: number[] = []
    const col: number[] = []
    const brick = s.style === 'pavilion'
    const boards = s.style === 'boards'
    const kinds = [
      new Color(brick ? '#b5503f' : '#8a8f98'),
      new Color('#b9bcc2'),
      new Color(s.color).lerp(new Color('#9aa0aa'), 0.55),
      new Color('#8d9199'),
      new Color('#1d4fa3'),
    ]
    const ads = (boards ? ['#e0402f', '#f08a2b'] : ['#2b3140', '#343b4b']).map((c) => new Color(c)) // dark boundary wall, or the red and orange hoardings
    const boardCols = ['#e0402f', '#f08a2b', '#f6f1e6', '#f08a2b'].map((c) => new Color(c))
    const pavGlass = new Color('#86b9de')
    const pavDeck = new Color('#eceff4')
    const stair = new Color('#e6e1d3')
    const windowCream = new Color('#efe6cf')
    // outer facade: pale concrete fins on top, glazed concourse band, darker base with openings
    const facade = (brick
      ? ['#b5503f', '#a24536', '#e9e2d2', '#d6cdb9', '#7d3a2f', '#8e4234']
      : ['#cfcabd', '#b3aea1', '#2c3e54', '#bdb8ab', '#23252a', '#9b958a']
    ).map((c) => new Color(c))
    const push = (d: number, y: number, t: number, c: Color) => {
      const [x, z] = ptOnStand(d, t)
      pos.push(x, y, z)
      col.push(c.r, c.g, c.b)
    }
    for (let i = 0; i < V.PROFILE.length - 1; i++) {
      const [d0, y0] = V.PROFILE[i]
      const [d1, y1, k] = V.PROFILE[i + 1]
      // the players' pavilion occupies Level 1: same staircase, finished as glazed risers and pale decks, so every edge lines up
      const pav = !!s.pavilion && i + 1 >= 3 && i + 1 <= 2 + 2 * V.levels[0].rows
      const band = i - (V.PROFILE.length - 4) // 0 top, 1 middle, 2 base of the outer facade (negative = not facade)
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
                    : boards && k === WALL
                      ? boardCols[Math.floor(j / 3) % boardCols.length]
                    : brick && k === WALL
                      ? j % 3 === 1
                        ? windowCream
                        : kinds[0]
                    : pav
                      ? k === TREAD
                        ? pavDeck
                        : pavGlass
                      : kinds[k]
        push(d0, y0, ta, c)
        push(d1, y1, ta, c)
        push(d1, y1, tb, c)
        push(d0, y0, ta, c)
        push(d1, y1, tb, c)
        push(d0, y0, tb, c)
      }
    }
    const tris = ShapeUtils.triangulateShape(
      V.PROFILE.map((p) => new Vector2(p[0], p[1])),
      [],
    )
    for (const t of [t0, t1])
      for (const tri of tris) for (const k of tri) push(V.PROFILE[k][0], V.PROFILE[k][1], t, kinds[0])
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
  function buildPavilion(s: Stand): BufferGeometry {
    const rows = VARIANTS[s.id].ROWS.filter((r) => r.tier === 0)
    const top0 = rows[0].y + 1.55 // flat parapet over the front rooms, then the roof climbs row by row
    const prof: [number, number][] = [
      [1.5, 0.9],
      [1.5, top0],
    ]
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
  /** Cantilever roof over the back of a stand (22 m by default). */
  function buildRoof(s: Stand): BufferGeometry {
    const { OUTER } = VARIANTS[s.id]
    const TOP = VARIANTS[s.id].TOP - (s.roofDrop ?? 0) // roof height, lowered where the stand says so
    const reach = s.roofReach ?? OUT_STAND
    const df = OUTER - reach
    const db = OUTER + 3
    if (s.style === 'pavilion') {
      // pitched slate roof with a ridge and red hips, like the Victorian pavilion
      const mid = (df + db) / 2
      const prof: [number, number][] = [
        [df, TOP + 0.3],
        [mid, TOP + 6.5],
        [db, TOP + 0.3],
        [db, TOP - 0.4],
        [df, TOP - 0.4],
      ]
      return sweep(
        prof,
        [
          new Color('#4a505c'),
          new Color('#434955'),
          new Color('#8a3b2f'),
          new Color('#5b6270'),
          new Color('#2f333b'),
        ],
        rad(s.t0),
        rad(s.t1),
        24,
        -1,
      )
    }
    const tent = s.style === 'tent'
    const prof: [number, number][] = [
      [df, TOP + 0.5],
      [db, TOP + 7.5],
      [db, TOP + 8.1],
      [df, TOP + 1.1],
    ]
    return sweep(
      prof,
      tent
        ? [new Color('#f1efe7'), new Color('#dedbd1'), new Color('#ffffff'), new Color('#9aa0a8')]
        : [new Color('#cdd2db'), new Color('#8a929e'), new Color('#f4f6f9'), new Color('#3f4650')],
      rad(s.t0),
      rad(s.t1),
      24,
      -1,
      2,
    )
  }

  /** Thin lighting strip along the roof's leading edge (glows at night). */
  function buildRim(s: Stand): BufferGeometry {
    const { OUTER } = VARIANTS[s.id]
    const TOP = VARIANTS[s.id].TOP - (s.roofDrop ?? 0) // roof height, lowered where the stand says so
    const df = OUTER - (s.roofReach ?? OUT_STAND)
    const prof: [number, number][] = [
      [df - 0.5, TOP - 0.1],
      [df + 0.2, TOP - 0.1],
      [df + 0.2, TOP + 0.4],
      [df - 0.5, TOP + 0.4],
    ]
    const c = new Color('#fff4d6')
    return sweep(prof, [c, c, c, c], rad(s.t0), rad(s.t1), 24)
  }

  function strut(a: Vector3, b: Vector3, r: number, c: Color) {
    const dir = b.clone().sub(a)
    const g = new CylinderGeometry(r, r, dir.length(), 5).toNonIndexed()
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()))
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    g.setAttribute(
      'color',
      new Float32BufferAttribute(
        new Array(g.attributes.position.count).fill(0).flatMap(() => [c.r, c.g, c.b]),
        3,
      ),
    )
    return g
  }

  /** Masts behind the stand with stay cables to the roof's leading edge. */
  function buildMasts(s: Stand): BufferGeometry {
    const { OUTER } = VARIANTS[s.id]
    const TOP = VARIANTS[s.id].TOP - (s.roofDrop ?? 0) // roof height, lowered where the stand says so
    const reach = s.roofReach ?? OUT_STAND
    const t0 = rad(s.t0)
    const dt = (rad(s.t1) - t0) / (s.blocks * SEG + 1)
    const parts: BufferGeometry[] = []
    const steel = new Color('#7d8591')
    if (s.masts === 'props' || s.masts === 'lattice') {
      const truss = new Color('#cfd4db')
      const df = OUTER - reach
      const db = OUTER + 3
      const t1 = rad(s.t1)
      const P = (d: number, y: number, t: number) => {
        const [x, z] = ptOnStand(d, t)
        return new Vector3(x, y, z)
      }
      if (s.masts === 'props') {
        // lattice A-frames: two legs lean out from the roof rim to the ground, and a braced pair rises over the roof
        const bays = s.blocks * 2
        const lattice = (a: Vector3[], b: Vector3[], K: number, r: number, rr: number) => {
          parts.push(strut(a[0], b[0], r, truss), strut(a[1], b[1], r, truss))
          for (let i = 0; i < K; i++) {
            const f0 = i / K
            const f1 = (i + 1) / K
            parts.push(
              strut(
                a[i % 2].clone().lerp(b[i % 2], i % 2 ? f1 : f0),
                a[1 - (i % 2)].clone().lerp(b[1 - (i % 2)], i % 2 ? f0 : f1),
                rr,
                truss,
              ),
            )
          }
        }
        for (let k = 0; k <= bays; k++) {
          const t = t0 + ((t1 - t0) * k) / bays
          const w = 2 / Math.max(60, Math.hypot(...ptOnStand(db, t)))
          const rim = [P(db + 0.7, TOP + 8.4, t - w), P(db + 0.7, TOP + 8.4, t + w)]
          const ground = [P(db + 11, 0, t - w * 1.5), P(db + 11, 0, t + w * 1.5)]
          const apex = [P(df + 8, TOP + 21, t - w * 0.3), P(df + 8, TOP + 21, t + w * 0.3)]
          lattice(ground, rim, 8, 0.4, 0.14)
          lattice(rim, apex, 5, 0.3, 0.12)
          parts.push(strut(apex[0].clone().lerp(apex[1], 0.5), P(df - 1, TOP + 2.4, t), 0.1, truss))
        }
      } else {
        // lattice ring truss lying along the inner roof edge, with columns down the back of the stand
        const bays = s.blocks * 4
        for (let k = 0; k < bays; k++) {
          const ta = t0 + ((t1 - t0) * k) / bays
          const tb = t0 + ((t1 - t0) * (k + 1)) / bays
          const lo = (t: number) => P(df + 1, TOP + 3.2, t)
          const hi = (t: number) => P(df + 1, TOP + 8.2, t)
          parts.push(strut(lo(ta), lo(tb), 0.2, truss), strut(hi(ta), hi(tb), 0.2, truss))
          parts.push(k % 2 ? strut(lo(ta), hi(tb), 0.09, truss) : strut(hi(ta), lo(tb), 0.09, truss))
          parts.push(strut(lo(ta), hi(ta), 0.09, truss))
          parts.push(strut(lo(ta), P(df + 1, TOP + 1.4, ta), 0.09, truss)) // post down to the roof
          if (k % 2 === 0) parts.push(strut(P(db + 0.7, TOP + 8.4, ta), P(db + 6, 0, ta), 0.35, steel)) // column from outside
        }
      }
      return mergeGeometries(parts)
    }
    for (let b = 0; b <= s.blocks; b++) {
      const t = t0 + dt * (SEG * b + 0.5)
      const [mx, mz] = ptOnStand(OUTER + 1.2, t)
      const [fx, fz] = ptOnStand(OUTER - reach, t)
      const top = new Vector3(mx, TOP + 15, mz)
      parts.push(strut(new Vector3(mx, 0, mz), top, 0.45, steel))
      parts.push(strut(top, new Vector3(fx, TOP + 0.8, fz), 0.07, steel))
    }
    return mergeGeometries(parts)
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
    const rows = VARIANTS[s.id].ROWS.filter((r) => !(s.pavilion && r.tier === 0))
    const plan = rows.map((r) =>
      Array.from({ length: s.blocks }, (_, b) =>
        Math.floor(
          arcLen(r.d + DEPTH * 0.55, t0 + (SEG * b + 1) * dt, t0 + (SEG * b + SEG) * dt) / SEAT_W,
        ),
      ),
    )
    return { rows, plan }
  }

  /** Official capacity of the stadium. */
  const CAPACITY = data.capacity

  // The seats drawn are exactly the official capacity, shared between stands (and rows, and blocks) in proportion to their size.
  const RAW = STANDS.map(rawPlan)
  const STAND_TOTALS = data.stands.every((st) => st.seats)
    ? data.stands.map((st) => st.seats as number)
    : apportion(
        RAW.map((r) => r.plan.flat().reduce((a, b) => a + b, 0)),
        CAPACITY,
      )
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
          const od = outDir(t, x, z)
          set.rot[k] = Math.atan2(-od[0], -od[1])
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

  const SEATS: SeatSet[] = STANDS.map(buildSeats)

  const seatLabel = (stand: number, i: number) => {
    const s = SEATS[stand]
    return {
      tier: TIER_NAMES[s.tier[i]],
      block: blockName(s.block[i], stand),
      row: s.row[i] + 1,
      num: s.num[i],
      booked: s.status[i] === 1,
    }
  }

  const seatEye = (stand: number, i: number): [number, number, number] => [
    SEATS[stand].x[i],
    SEATS[stand].y[i] + 1.2,
    SEATS[stand].z[i],
  ]

  /** Camera position + target framing a whole stand, or one level of it, from over the pitch. */
  function standView(i: number, tier: number | null = null) {
    const s = STANDS[i]
    const t = rad((s.t0 + s.t1) / 2)
    const R = VARIANTS[i].ROWS
    const rows = tier === null ? R : R.filter((r) => r.tier === tier)
    const mid = rows[Math.floor(rows.length / 2)]
    const [cx, cz] = ptOnStand(mid.d, t)
    const [ox, oz] = outDir(t, cx, cz)
    // deeper stands (the MCG's three tall levels) are viewed from further back than Wankhede's
    const k = tier === null ? Math.max(1, VARIANTS[i].OUTER / 34) : 1
    const dist = (tier === null ? 72 : 64) * k
    const lift = (tier === null ? 34 : 30) * k
    return {
      pos: [cx - ox * dist, mid.y + lift, cz - oz * dist] as const,
      target: [cx, mid.y, cz] as const,
    }
  }

  const riseOf = (i: number, tier: number) => VARIANTS[i].levels[tier].rise
  /**
   * Translucent shell over one whole block (all its rows and aisle) on one floor, following the stairs and sitting just
   * above the seat tops. Used to pick and highlight a block as a unit.
   */
  function buildBlockPatch(s: Stand, tier: number, block: number): BufferGeometry {
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
        P(d0, y0, a)
        P(d1, y1, a)
        P(d1, y1, b)
        P(d0, y0, a)
        P(d1, y1, b)
        P(d0, y0, b)
      }
    }
    for (const r of VARIANTS[s.id].ROWS.filter((q) => q.tier === tier)) {
      quad(r.d, r.y - riseOf(s.id, tier) + LIFT, r.d, r.y + LIFT)
      quad(r.d, r.y + LIFT, r.d + DEPTH, r.y + LIFT)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    return g
  }

  /** Camera framing one block on one floor from over the pitch. */
  function blockView(i: number, tier: number, block: number) {
    const s = STANDS[i]
    const N = s.blocks * SEG + 1
    const t0 = rad(s.t0)
    const t = t0 + ((rad(s.t1) - t0) / N) * (SEG * block + (SEG + 1) / 2)
    const rows = VARIANTS[i].ROWS.filter((r) => r.tier === tier)
    const mid = rows[Math.floor(rows.length / 2)]
    const [cx, cz] = ptOnStand(mid.d, t)
    const [ox, oz] = outDir(t, cx, cz)
    // taller blocks (more rows) are viewed from further back; up to 16 rows keeps the original framing
    const k = Math.max(1, rows.length / 16)
    return {
      pos: [cx - ox * 14.5 * k, mid.y + 6 * k, cz - oz * 14.5 * k] as const,
      target: [cx, mid.y - 1.2, cz] as const,
    }
  }

  /** Block letter for block index b of a stand (letters are per stand, as on the ticketing sites). */
  /** Middle of a block on one floor as a flat patch lying on the raked seats: centre plus x (along the arc), s (up the slope) and n (out of the seats) unit vectors. */
  function blockSurface(i: number, tier: number, block: number) {
    const s = STANDS[i]
    const t0 = rad(s.t0)
    const t = t0 + ((rad(s.t1) - t0) / (s.blocks * SEG + 1)) * (SEG * block + (SEG + 1) / 2)
    const rows = VARIANTS[i].ROWS.filter((r) => r.tier === tier)
    const first = rows[0]
    const last = rows[rows.length - 1]
    // centre of the whole block: halfway across the rows, just above the seat tops
    const [x, z] = ptOnStand((first.d + last.d + DEPTH) / 2, t)
    const p: [number, number, number] = [
      x,
      (first.y + last.y) / 2 - riseOf(i, tier) / 2 + 0.95 + 0.04,
      z,
    ]
    const [c, sn] = basisAt(t)
    const len = Math.hypot(DEPTH, riseOf(i, tier))
    const a = DEPTH / len
    const b = riseOf(i, tier) / len
    const tx: [number, number, number] = [-sn, 0, c]
    const sl: [number, number, number] = [c * a, b, sn * a]
    const n: [number, number, number] = [-c * b, a, -sn * b]
    return { p, x: tx, s: sl, n }
  }

  /** Front row of a floor at the end of the stand that appears on the left from the stand-view camera. */
  function levelAnchor(i: number, tier: number): [number, number, number] {
    const s = STANDS[i]
    const ta = rad(s.t0)
    const tb = rad(s.t1)
    const tm = (ta + tb) / 2
    const [mx, mz] = ptOnStand(0, tm)
    const [fx, fz] = outDir(tm, mx, mz)
    const right = [-fz, fx] // camera looks outward from the pitch, so right = (-fz, fx)
    const side = (t: number) => {
      const [x, z] = ptOnStand(0, t)
      return (x - mx) * right[0] + (z - mz) * right[1]
    }
    const leftIsStart = side(ta) < side(tb)
    const rows = VARIANTS[i].ROWS.filter((r) => r.tier === tier)
    const low = rows[0]
    const [x, z] = ptOnStand(low.d - 1.5, leftIsStart ? ta - 0.03 : tb + 0.03)
    return [x, low.y + 0.6, z]
  }

  const blockName = (b: number, standId: number) =>
    String.fromCharCode(65 + STANDS[standId].firstBlock + b)

  const api = {
    SLUG,
    STADIUM_NAME,
    A,
    B,
    DEPTH,
    STANDS,
    TIER_NAMES,
    SEAT_COLORS,
    levelsOf,
    PROFILE,
    STRIPS,
    ROWS,
    OUTER,
    TOP,
    buildStrip,
    buildTerrace,
    buildPavilion,
    buildRoof,
    buildRim,
    buildMasts,
    CAPACITY,
    SEATS,
    seatLabel,
    seatEye,
    standView,
    buildBlockPatch,
    blockView,
    blockSurface,
    levelAnchor,
    blockName,
    PITCH_BEARING: data.field.pitchBearing ?? 0,
    FIELD_RADII: data.field.radii,
    ptOnStand,
    /** Per-stand profile access: rows, banner strips and outer depth differ between stands of a non-uniform ground. */
    STRIPS_OF: (i: number) => VARIANTS[i].STRIPS,
    OUTER_OF: (i: number) => VARIANTS[i].OUTER,
    TOP_OF: (i: number) => VARIANTS[i].TOP,
    /**
     * How far from the field centre the built-up edge reaches at angle t: the boundary plus the depth of whichever
     * stand covers that angle, or a short margin where there is a gap between stands.
     */
    outerRadiusAt: (t: number) => {
      if (!fieldR) return Math.max(A, B) + OUTER
      const deg = (((t * 180) / Math.PI) % 360 + 360) % 360
      let reach = 14
      data.stands.forEach((st, i) => {
        const inside = [0, -360, 360].some((o) => deg + o >= st.fromDeg - 2 && deg + o <= st.toDeg + 2)
        if (inside) reach = Math.max(reach, (VARIANTS[i].OUTER + 3) * factorAt(t) + 1)
      })
      return fieldR(t) + reach
    },
    TOWERS: data.towers,
  }
  // floodlight towers stand clear of the stands: pushed out to at least 12 m beyond the built-up edge
  if (api.TOWERS)
    api.TOWERS = api.TOWERS.map((t) => {
      const a = Math.atan2(t.z, t.x)
      const need = api.outerRadiusAt(a) + 12
      const r = Math.hypot(t.x, t.z)
      return r >= need ? t : { ...t, x: Math.cos(a) * need, z: Math.sin(a) * need }
    })
  return api
}
