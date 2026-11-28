import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { glowTexture, live } from './Environment'

/** One stretch of road handed to the traffic: its centre line, width and one-way flag. */
export interface Piece {
  c: string
  p: number[]
  /** one-way carriageway (motorway ways are drawn one per direction) */
  ow: boolean
  w: number
  /** within reach of the sea front (busier traffic) */
  m: boolean
}

type Kind = 'car' | 'taxi' | 'bus' | 'auto'
const KINDS: Kind[] = ['car', 'taxi', 'bus', 'auto']
const LENGTH: Record<Kind, number> = { car: 4.2, taxi: 4.2, bus: 10.5, auto: 2.7 }
const SPEED: Record<Kind, [number, number]> = {
  car: [7, 12.5],
  taxi: [6, 11],
  bus: [4.5, 8],
  auto: [5, 8.5],
}
/** metres between vehicles per lane; sea-front roads (Marine Drive) are much busier */
const SPACING: Record<string, number> = {
  motorway: 27,
  trunk: 30,
  primary: 29,
  secondary: 35,
  tertiary: 46,
  residential: 76,
}
const CAR_COLORS = [
  '#d62828',
  '#1f6feb',
  '#f4f4f4',
  '#f2b705',
  '#2a9d5c',
  '#ff7b00',
  '#c0c4cc',
  '#8e44ad',
  '#00a8a8',
  '#e84393',
  '#f4f4f4',
  '#d62828',
  '#1f6feb',
  '#2b2f36',
].map((c) => new Color(c))
const MAX_VEHICLES = 5200
/** a lane end within this distance of another lane's start, heading the same way, continues onto it */
const JOIN = 16
/** half length / half width of each vehicle, for spacing and the overlap test */
const HL: Record<Kind, number> = { car: 2.1, taxi: 2.1, bus: 5.25, auto: 1.35 }
const HW: Record<Kind, number> = { car: 0.95, taxi: 0.95, bus: 1.35, auto: 0.75 }
const MINGAP = 1.5
const CELL = 16

/** do two oriented boxes (centre, unit heading, half length, half width) overlap? */
function overlap(
  ax: number,
  az: number,
  ahx: number,
  ahz: number,
  al: number,
  aw: number,
  bx: number,
  bz: number,
  bhx: number,
  bhz: number,
  bl: number,
  bw: number,
) {
  const dx = bx - ax
  const dz = bz - az
  for (const [ux, uz] of [
    [ahx, ahz],
    [-ahz, ahx],
    [bhx, bhz],
    [-bhz, bhx],
  ]) {
    const ra = al * Math.abs(ahx * ux + ahz * uz) + aw * Math.abs(-ahz * ux + ahx * uz)
    const rb = bl * Math.abs(bhx * ux + bhz * uz) + bw * Math.abs(-bhz * ux + bhx * uz)
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false
  }
  return true
}

function part(w: number, h: number, l: number, x: number, y: number, z: number, shade: number) {
  const g = new BoxGeometry(w, h, l).translate(x, y, z).toNonIndexed()
  g.setAttribute(
    'color',
    new Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(shade), 3),
  )
  return g
}
// Local +z is the direction of travel. Vertex colour 1 takes the per-vehicle tint; darker parts stay dark.
const GEO: Record<Kind, BufferGeometry> = {
  car: mergeGeometries([
    part(1.8, 0.75, 4.2, 0, 0.7, 0, 1),
    part(1.6, 0.6, 2.2, 0, 1.35, -0.2, 0.18),
    part(1.82, 0.25, 4.0, 0, 0.3, 0, 0.1),
  ]),
  taxi: mergeGeometries([
    part(1.8, 0.75, 4.2, 0, 0.7, 0, 0.03),
    part(1.6, 0.62, 2.2, 0, 1.36, -0.2, 1),
    part(1.82, 0.25, 4.0, 0, 0.3, 0, 0.03),
  ]),
  bus: mergeGeometries([
    part(2.6, 3.1, 10.5, 0, 1.9, 0, 1),
    part(2.62, 0.9, 9.6, 0, 2.5, 0, 0.16),
    part(2.4, 0.15, 10.2, 0, 3.5, 0, 0.9),
  ]),
  auto: mergeGeometries([
    part(1.3, 0.9, 2.7, 0, 0.7, 0, 0.1),
    part(1.4, 0.12, 2.2, 0, 1.75, -0.1, 1),
    part(1.25, 0.8, 0.9, 0, 1.2, 0.8, 0.2),
  ]),
}
const TINT: Record<Kind, Color | null> = {
  car: null,
  taxi: new Color('#ffc400'),
  bus: new Color('#c8202f'),
  auto: new Color('#f2c230'),
}

interface Lane {
  pts: number[]
  cum: number[]
  len: number
  /** lanes this one flows into at its end (junctions / road continuations) */
  succ: Lane[]
  /** opposite-direction lane of the same road, used to turn around at dead ends */
  pair?: Lane
  /** vehicles on this lane, sorted by s each frame (rebuilt every frame) */
  cars: Vehicle[]
  /** parallel lanes of the same road and direction, to change into */
  sib: Lane[]
}
interface Vehicle {
  lane: Lane
  s: number
  /** cruising speed */
  speed: number
  /** actual speed after braking for the car ahead */
  cur: number
  idx: number
  /** position in lane.cars */
  k: number
  /** lane this vehicle will continue onto at the end of its own */
  nl: Lane | null
  gap: number
  yield: boolean
  stuck: number
  hx: number
  hz: number
  /** position and heading wanted this frame, and the state to fall back on if that would hit someone */
  nx: number
  nz: number
  nhx: number
  nhz: number
  pl: Lane
  ps: number
  pseg: number
  pnl: Lane | null
  pbx: number
  pbz: number
  seg: number
  kind: Kind
  slot: number
  /** 1 running, shrinking to 0 when it has to leave the map, growing back after respawn */
  sc: number
  state: 'run' | 'out' | 'in'
  /** lateral blend that fades out after switching lanes, so there is no pop */
  bx: number
  bz: number
  lx: number
  lz: number
}

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One lane per direction; India drives on the left, so each lane sits on the left of its travel direction. */
function laneFor(p: number[], reverse: boolean, offset: number): Lane {
  const n = p.length / 2
  const idx = Array.from({ length: n }, (_, i) => (reverse ? n - 1 - i : i))
  const pts: number[] = []
  idx.forEach((k, i) => {
    const a = idx[Math.max(0, i - 1)]
    const b = idx[Math.min(n - 1, i + 1)]
    const dx = p[b * 2] - p[a * 2]
    const dz = p[b * 2 + 1] - p[a * 2 + 1]
    const l = Math.hypot(dx, dz) || 1
    // top-down with x east and z south, the left of heading (dx, dz) is (dz, -dx)
    pts.push(p[k * 2] + (dz / l) * offset, p[k * 2 + 1] + (-dx / l) * offset)
  })
  const cum = [0]
  for (let i = 1; i < n; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]))
  return { pts, cum, len: cum[n - 1], succ: [], cars: [], sib: [] }
}

/** Position and heading on a lane at distance s (segment index cached on the vehicle). */
function place(v: Vehicle) {
  const { pts, cum } = v.lane
  while (v.seg < cum.length - 2 && cum[v.seg + 1] < v.s) v.seg++
  const x0 = pts[v.seg * 2]
  const z0 = pts[v.seg * 2 + 1]
  const dx = pts[v.seg * 2 + 2] - x0
  const dz = pts[v.seg * 2 + 3] - z0
  const sl = cum[v.seg + 1] - cum[v.seg] || 1
  const f = Math.min(1, Math.max(0, (v.s - cum[v.seg]) / sl))
  return { x: x0 + dx * f, z: z0 + dz * f, hx: dx / sl, hz: dz / sl }
}

function connect(lanes: Lane[]) {
  const cell = (x: number) => Math.floor(x / JOIN)
  const starts = new Map<string, Lane[]>()
  for (const l of lanes) {
    const k = `${cell(l.pts[0])},${cell(l.pts[1])}`
    ;(starts.get(k) ?? starts.set(k, []).get(k)!).push(l)
  }
  for (const l of lanes) {
    const n = l.pts.length
    const ex = l.pts[n - 2]
    const ez = l.pts[n - 1]
    const dx = ex - l.pts[n - 4]
    const dz = ez - l.pts[n - 3]
    const dl = Math.hypot(dx, dz) || 1
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const c of starts.get(`${cell(ex) + i},${cell(ez) + j}`) ?? []) {
          if (c === l || c === l.pair || Math.hypot(c.pts[0] - ex, c.pts[1] - ez) > JOIN) continue
          const sx = c.pts[2] - c.pts[0]
          const sz = c.pts[3] - c.pts[1]
          if ((dx * sx + dz * sz) / (dl * (Math.hypot(sx, sz) || 1)) > 0.45 && l.succ.length < 4)
            l.succ.push(c)
        }
      }
    }
  }
}

/** where a vehicle goes at the end of its lane: a connected road, a turn-around at a dead end, or nowhere (leaves the map) */
const stuckLimit = (v: Vehicle) => 1.2 + (v.idx % 4) * 0.2
const carSelf = { value: 0 }
const byS = (a: Vehicle, b: Vehicle) => a.s - b.s
const cellKey = (x: number, z: number) =>
  ((Math.floor(x / CELL) + 2048) << 12) + Math.floor(z / CELL) + 2048

/** is another visible vehicle inside this box? */
function occupied(
  grid: Map<number, Vehicle[]>,
  x: number,
  z: number,
  hx: number,
  hz: number,
  hl: number,
  hw: number,
  skip: Vehicle,
) {
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const u of grid.get(cellKey(x + i * CELL, z + j * CELL)) ?? []) {
        if (
          u !== skip &&
          overlap(x, z, hx, hz, hl, hw, u.lx, u.lz, u.hx, u.hz, HL[u.kind], HW[u.kind])
        )
          return true
      }
    }
  }
  return false
}

function addToGrid(grid: Map<number, Vehicle[]>, used: Vehicle[][], v: Vehicle) {
  const key = cellKey(v.lx, v.lz)
  let a = grid.get(key)
  if (!a) grid.set(key, (a = []))
  if (!a.length) used.push(a)
  a.push(v)
}

function nextLane(l: Lane, rnd: () => number): Lane | null {
  return l.succ.length ? l.succ[Math.floor(rnd() * l.succ.length)] : (l.pair ?? null)
}

/** `autos: false` leaves out the Indian black-and-yellow taxis and auto-rickshaws, and any black or yellow car. */
/** `headlights: false` leaves out the glowing headlight points at night. */
export function Traffic({ pieces, autos = true, headlights = true }: { pieces: Piece[]; autos?: boolean; headlights?: boolean }) {
  const { vehicles, counts, lanes } = useMemo(() => {
    const r = rng(7)
    const vs: Vehicle[] = []
    const lanesAll: Lane[] = []
    const counts: Record<Kind, number> = { car: 0, taxi: 0, bus: 0, auto: 0 }
    for (const pc of pieces) {
      let sp = SPACING[pc.c]
      if (!sp || pc.p.length < 4) continue
      if (pc.m) sp *= 0.5 // Marine Drive and the sea-front roads carry far more traffic
      // lanes: one-way carriageways are filled across their width, two-way roads drive on the left of each direction
      const half = pc.ow ? pc.w : pc.w / 2
      const lanes = Math.max(1, Math.round(half / 3.4))
      const offsets = Array.from({ length: lanes }, (_, i) =>
        pc.ow ? (i - (lanes - 1) / 2) * (pc.w / lanes) : (i + 0.5) * (half / lanes),
      )
      const fwd: Lane[] = []
      const rev: Lane[] = []
      for (const reverse of pc.ow ? [false] : [false, true]) {
        for (const off of offsets) {
          const lane = laneFor(pc.p, reverse, off)
          if (lane.len < 20) continue
          ;(reverse ? rev : fwd).push(lane)
          lanesAll.push(lane)
        }
      }
      for (const g of [fwd, rev]) for (const l of g) l.sib = g.filter((x) => x !== l)
      fwd.forEach((l, i) => {
        if (rev[i]) {
          l.pair = rev[i]
          rev[i].pair = l
        }
      })
      for (const lane of [...fwd, ...rev]) {
        const n = Math.max(1, Math.floor(lane.len / sp))
        for (let i = 0; i < n && vs.length < MAX_VEHICLES; i++) {
          const q = r()
          const kind: Kind = q < 0.72 ? 'car' : q < 0.86 ? (autos ? 'taxi' : 'car') : q < 0.89 ? 'bus' : autos ? 'auto' : 'car' // mostly cars, only a few buses
          const [lo, hi] = SPEED[kind]
          const speed = lo + r() * (hi - lo)
          const v: Vehicle = {
            lane,
            s: ((i + r() * 0.3) / n) * lane.len,
            speed,
            cur: speed,
            idx: vs.length,
            k: 0,
            nl: null,
            gap: Infinity,
            yield: false,
            stuck: 0,
            hx: 0,
            hz: 1,
            nx: 0,
            nz: 0,
            nhx: 0,
            nhz: 1,
            pl: lane,
            ps: 0,
            pseg: 0,
            pnl: null,
            pbx: 0,
            pbz: 0,
            seg: 0,
            kind,
            slot: counts[kind]++,
            sc: 1,
            state: 'run',
            bx: 0,
            bz: 0,
            lx: 0,
            lz: 0,
          }
          const p = place(v)
          v.lx = p.x
          v.lz = p.z
          v.hx = p.hx
          v.hz = p.hz
          vs.push(v)
        }
      }
    }
    connect(lanesAll)
    for (const v of vs) v.nl = nextLane(v.lane, r)
    // junctions can drop two vehicles on top of each other: keep the first, send the other to respawn where there is room
    const g = new Map<number, Vehicle[]>()
    const u: Vehicle[][] = []
    for (const v of vs) {
      if (occupied(g, v.lx, v.lz, v.hx, v.hz, HL[v.kind] + MINGAP, HW[v.kind] + 0.2, v)) {
        v.state = 'out'
        v.sc = 0
      } else addToGrid(g, u, v)
    }
    return { vehicles: vs, counts, lanes: lanesAll }
  }, [pieces, autos])

  const meshes = useRef<Record<Kind, InstancedMesh | null>>({
    car: null,
    taxi: null,
    bus: null,
    auto: null,
  })
  const lights = useRef<Points>(null)
  const mats = useMemo(
    () => ({
      body: (() => {
        const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 })
        // at night the street lamps are not real lights, so lift each car's own colour a little instead of letting it go black
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uSelf = carSelf
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uSelf;')
            .replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelf;',
            )
        }
        return m
      })(),
      glow: new PointsMaterial({
        map: glowTexture,
        size: 2.4,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    }),
    [],
  )
  const lightGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(vehicles.length * 6), 3))
    const col: number[] = []
    for (let i = 0; i < vehicles.length; i++) col.push(1, 0.95, 0.75, 1, 0.12, 0.08)
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    return g
  }, [vehicles])

  // per-vehicle tint, applied once to each mesh object (a remount creates a fresh mesh)
  const tinted = useRef(new WeakSet<InstancedMesh>())
  const dummy = useMemo(() => new Object3D(), [])
  const pick = useMemo(() => rng(23), [])
  if (import.meta.env.DEV) (window as unknown as { __veh: unknown }).__veh = vehicles
  const grid = useMemo(() => new Map<number, Vehicle[]>(), [])
  const used = useMemo<Vehicle[][]>(() => [], [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    for (const k of KINDS) {
      const m = meshes.current[k]
      if (!m || tinted.current.has(m)) continue
      tinted.current.add(m)
      const r = rng(11)
      const pal = autos ? CAR_COLORS : CAR_COLORS.filter((c) => !['f2b705', '2b2f36'].includes(c.getHexString()))
      for (const v of vehicles) {
        const c = TINT[v.kind] ?? pal[Math.floor(r() * pal.length)]
        if (v.kind === k) m.setColorAt(v.slot, c)
      }
      m.instanceColor!.needsUpdate = true
    }
    const lp = lightGeo.attributes.position.array as Float32Array
    const decay = Math.exp(-dt * 2.2)
    // --- pass 1: who is on which lane, who is close to whom (all from the positions of the previous frame) ---
    for (const l of lanes) l.cars.length = 0
    for (const a of used) a.length = 0
    used.length = 0
    for (const v of vehicles) {
      if (v.state === 'out' && v.sc < 0.5) continue // already gone
      v.lane.cars.push(v)
      addToGrid(grid, used, v)
    }
    for (const l of lanes) {
      if (l.cars.length > 1) l.cars.sort(byS)
      l.cars.forEach((c, k) => (c.k = k))
    }
    for (const v of vehicles) {
      v.gap = Infinity
      v.yield = false
      if (v.state !== 'run') continue
      let block = false
      // room up to the car ahead, on this lane or the one it continues onto
      const lead = v.lane.cars[v.k + 1]
      if (lead) v.gap = lead.s - v.s - HL[v.kind] - HL[lead.kind] - MINGAP
      else if (v.nl) {
        const rear = v.nl.cars[0]
        if (rear) v.gap = v.lane.len - v.s + rear.s - HL[v.kind] - HL[rear.kind] - MINGAP
      }
      // cars on other lanes (junctions, merges, turn-arounds): stop if the box just ahead would overlap one
      const ahead = 0.6 + v.cur * dt
      const cx = v.lx + (v.hx * ahead) / 2
      const cz = v.lz + (v.hz * ahead) / 2
      const hl = HL[v.kind] + ahead / 2
      const cx0 = Math.floor(v.lx / CELL)
      const cz0 = Math.floor(v.lz / CELL)
      for (let i = -1; i <= 1 && !block; i++) {
        for (let j = -1; j <= 1 && !block; j++) {
          for (const u of grid.get(((cx0 + i + 2048) << 12) + cz0 + j + 2048) ?? []) {
            if (u === v || u.lane === v.lane || u.lane === v.nl) continue
            if (
              !overlap(
                cx,
                cz,
                v.hx,
                v.hz,
                hl,
                HW[v.kind] + 0.1,
                u.lx,
                u.lz,
                u.hx,
                u.hz,
                HL[u.kind],
                HW[u.kind] + 0.1,
              )
            )
              continue
            const vu = v.hx * (u.lx - v.lx) + v.hz * (u.lz - v.lz) > 0
            const uv = u.hx * (v.lx - u.lx) + u.hz * (v.lz - u.lz) > 0
            const facing = v.hx * u.hx + v.hz * u.hz < -0.3 // head-on: neither can go round, so both wait
            // priority goes to the lower index, but never drive into a car that is standing in the way
            const touching =
              u.cur < 0.5 &&
              overlap(
                v.lx,
                v.lz,
                v.hx,
                v.hz,
                HL[v.kind],
                HW[v.kind],
                u.lx,
                u.lz,
                u.hx,
                u.hz,
                HL[u.kind],
                HW[u.kind],
              )
            if (vu && (facing || !uv || v.idx > u.idx || touching)) {
              block = true
              break
            }
          }
        }
      }
      v.yield = block
    }
    // --- pass 2: move ---
    vehicles.forEach((v) => {
      v.pl = v.lane
      v.ps = v.s
      v.pseg = v.seg
      v.pnl = v.nl
      v.pbx = v.bx
      v.pbz = v.bz
      if (v.state === 'run') {
        const room = Math.max(0, v.gap)
        // slow down early enough to stop short of the car ahead, never move into it
        const target = v.yield ? 0 : Math.min(v.speed, room * 2.5)
        v.cur =
          target < v.cur ? Math.max(target, v.cur - 25 * dt) : Math.min(target, v.cur + 5 * dt)
        v.s += v.yield ? 0 : Math.min(v.cur * dt, room)
        v.stuck = v.cur < 0.5 ? v.stuck + dt : 0
        // never sit still: first try the next lane over, and if that fails fade out and reappear on a free road
        if (v.stuck > 0.3 && v.lane.sib.length) {
          const to = v.lane.sib[Math.floor(pick() * v.lane.sib.length)]
          v.s = Math.min(to.len - 0.01, (v.s / v.lane.len) * to.len)
          v.lane = to
          v.nl = nextLane(to, pick)
          v.seg = 0
          const np = place(v)
          v.bx = v.lx - np.x
          v.bz = v.lz - np.z
        }
        if (v.stuck > stuckLimit(v)) v.state = 'out'
        else if (v.s >= v.lane.len) {
          const over = v.s - v.lane.len
          if (v.nl) {
            v.lane = v.nl
            v.nl = nextLane(v.lane, pick)
            v.s = over
            v.seg = 0
            const np = place(v)
            v.bx = v.lx - np.x
            v.bz = v.lz - np.z
            if (Math.hypot(v.bx, v.bz) > 25) v.bx = v.bz = 0
          } else {
            v.state = 'out'
          }
        }
      } else if (v.state === 'out') {
        if (v.sc > 0) v.sc = Math.max(0, v.sc - dt * 2)
        // come back at the start of the lane, once nothing is standing there
        // (its own lane first, else a few random lanes, so the traffic never drains away)
        for (let attempt = 0; v.sc <= 0 && attempt < 4; attempt++) {
          if (attempt) v.lane = lanes[Math.floor(pick() * lanes.length)]
          if (v.lane.cars.some((c) => c.s < 10)) continue
          v.s = 0
          v.seg = 0
          const p = place(v)
          if (!occupied(grid, p.x, p.z, p.hx, p.hz, HL[v.kind] + 2.5, HW[v.kind] + 0.4, v)) {
            v.sc = 0.001
            v.state = 'in'
            v.cur = 0
            v.stuck = 0
            v.bx = v.bz = 0
            v.lx = p.x
            v.lz = p.z
            v.hx = p.hx
            v.hz = p.hz
            v.nl = nextLane(v.lane, pick)
            v.lane.cars.unshift(v)
            addToGrid(grid, used, v)
          }
        }
      } else {
        v.sc += dt * 2
        if (v.sc >= 1) {
          v.sc = 1
          v.state = 'run'
        }
      }
      v.bx *= decay
      v.bz *= decay
      const p = place(v)
      v.nx = p.x + v.bx
      v.nz = p.z + v.bz
      v.nhx = p.hx
      v.nhz = p.hz
    })
    // --- pass 3: commit positions in index order. A move that would put a vehicle into another one is undone ---
    // Lower indices are already committed, higher ones still sit where they were, so this keeps every pair apart.
    for (const v of vehicles) {
      if (v.state === 'run' && (v.nx !== v.lx || v.nz !== v.lz)) {
        let hit = false
        for (let i = -1; i <= 1 && !hit; i++) {
          for (let j = -1; j <= 1 && !hit; j++) {
            for (const u of grid.get(cellKey(v.nx + i * CELL, v.nz + j * CELL)) ?? []) {
              if (
                u !== v &&
                overlap(
                  v.nx,
                  v.nz,
                  v.nhx,
                  v.nhz,
                  HL[v.kind],
                  HW[v.kind] + 0.1,
                  u.lx,
                  u.lz,
                  u.hx,
                  u.hz,
                  HL[u.kind],
                  HW[u.kind] + 0.1,
                )
              ) {
                hit = true
                break
              }
            }
          }
        }
        if (hit) {
          v.lane = v.pl
          v.s = v.ps
          v.seg = v.pseg
          v.nl = v.pnl
          v.bx = v.pbx
          v.bz = v.pbz
          v.cur = 0
          v.stuck += dt
          if (v.stuck > stuckLimit(v)) v.state = 'out'
          v.nx = v.lx
          v.nz = v.lz
          v.nhx = v.hx
          v.nhz = v.hz
        }
      }
      v.lx = v.nx
      v.lz = v.nz
      v.hx = v.nhx
      v.hz = v.nhz
    }
    // --- pass 4: draw ---
    vehicles.forEach((v, i) => {
      const x = v.lx
      const z = v.lz
      dummy.position.set(x, 0.12, z)
      dummy.rotation.y = Math.atan2(v.hx, v.hz)
      dummy.scale.setScalar(Math.max(v.sc, 0.001))
      dummy.updateMatrix()
      meshes.current[v.kind]?.setMatrixAt(v.slot, dummy.matrix)
      const h = (LENGTH[v.kind] / 2) * v.sc
      lp.set([x + v.hx * h, 0.75, z + v.hz * h, x - v.hx * h, 0.75, z - v.hz * h], i * 6)
    })
    for (const k of KINDS)
      if (meshes.current[k]) meshes.current[k]!.instanceMatrix.needsUpdate = true
    lightGeo.attributes.position.needsUpdate = true
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    carSelf.value = night * 0.3
    mats.glow.opacity = night * 0.85
    if (lights.current) lights.current.visible = headlights && night > 0.02
  })

  if (!vehicles.length) return null
  return (
    <group>
      {KINDS.map((k) =>
        counts[k] ? (
          <instancedMesh
            key={k}
            ref={(m) => void (meshes.current[k] = m)}
            args={[GEO[k], mats.body, counts[k]]}
            frustumCulled={false}
            raycast={() => {}}
          />
        ) : null,
      )}
      <points
        visible={headlights}
        ref={lights}
        geometry={lightGeo}
        material={mats.glow}
        frustumCulled={false}
        raycast={() => {}}
      />
    </group>
  )
}
