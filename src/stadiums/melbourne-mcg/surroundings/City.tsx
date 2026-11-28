import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  LineBasicMaterial,
  LineLoop,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PointsMaterial,
  Shape,
  ShapeGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { useStadium } from '../../../store/useStadium'
import { outerRadiusAt } from '../data/layout'
import { glowTexture, live } from '../../shared/Environment'
import { Traffic, type Piece } from '../../shared/Traffic'
import { Railway } from './Railway'

// OpenStreetMap-derived scene (see scripts/build_osm.py): buildings, roads, parks, river, trees around the MCG.
interface Osm {
  b: { p: number[]; h: number; v?: number }[]
  r: { c: string; p: number[]; o?: number }[]
  g: { p: number[]; w: number }[]
  p: { p: number[]; c: [number, number]; a: number; s: string }[]
  w: { p: number[] }[]
  l: { p: number[]; w: number }[]
  t: [number, number][]
}

const ROAD_W: Record<string, number> = {
  motorway: 12,
  trunk: 14,
  primary: 13,
  secondary: 10,
  tertiary: 8,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 3.5,
  pedestrian: 4,
  cycleway: 3,
  footway: 3,
  path: 3,
  track: 4,
  rail: 5,
  tram: 3,
}
/** width of a single one-way carriageway (OSM draws dual carriageways as two one-way ways) */
const OW_W: Record<string, number> = {
  motorway: 12,
  trunk: 11,
  primary: 11,
  secondary: 8.5,
  tertiary: 7,
  residential: 5,
  unclassified: 5,
  service: 3.5,
}
const ROAD_LIT: Record<string, number> = {
  motorway: 1,
  trunk: 1,
  primary: 1,
  secondary: 0.9,
  tertiary: 0.75,
  residential: 0.5,
  unclassified: 0.4,
  living_street: 0.3,
  service: 0.22,
  pedestrian: 0.25,
  cycleway: 0.1,
  footway: 0.12,
  path: 0.1,
  track: 0.05,
  rail: 0.07,
  tram: 0.04,
}
const ROAD_C: Record<string, string> = {
  rail: '#5a544d',
  tram: '#6b6a70',
  footway: '#cdc3ac',
  path: '#cdc3ac',
  track: '#bfb59c',
  cycleway: '#a8a89a',
  service: '#8a8a90',
  pedestrian: '#b0a794',
}
const ORDER = [
  'rail',
  'tram',
  'track',
  'path',
  'footway',
  'cycleway',
  'pedestrian',
  'service',
  'living_street',
  'residential',
  'unclassified',
  'tertiary',
  'secondary',
  'primary',
  'trunk',
  'motorway',
]

/** Distance from the field centre to the built-up edge of the stadium in the direction of (x, z). */
const edgeAt = (x: number, z: number) => outerRadiusAt(Math.atan2(z, x))
/** Is this point within `m` metres of the stadium (so nothing can be built or drawn there)? */
const nearStadium = (x: number, z: number, m: number) => Math.hypot(x, z) < edgeAt(x, z) + m
const hash1 = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const toShape = (p: number[]) => {
  const sh = new Shape()
  for (let i = 0; i < p.length; i += 2) (i ? sh.lineTo : sh.moveTo).call(sh, p[i], -p[i + 1])
  return sh
}
const flatGeo = (p: number[]) => {
  const g = new ShapeGeometry(toShape(p)).rotateX(-Math.PI / 2)
  g.deleteAttribute('uv')
  return g.toNonIndexed()
}
/** Points every `step` metres along a polyline, so cuts near the stadium follow its edge closely. */
const toLen = (l: [number, number][]) => l.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - l[i - 1][0], q[1] - l[i - 1][1]) : 0), 0)
function resample(p: number[], step: number) {
  const out: number[] = [p[0], p[1]]
  for (let i = 0; i < p.length - 2; i += 2) {
    const dx = p[i + 2] - p[i]
    const dz = p[i + 3] - p[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / step))
    for (let k = 1; k <= n; k++) out.push(p[i] + (dx * k) / n, p[i + 1] + (dz * k) / n)
  }
  return out
}

function ribbon(
  p: number[],
  w: number,
  y: number,
  c: Color,
  lit: number,
  ow: boolean,
  pos: number[],
  col: number[],
  litA: number[],
  sA: number[],
  uA: number[],
  wA: number[],
  ys?: number[],
) {
  const pts: [number, number][] = []
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]])
  const left: [number, number][] = []
  const right: [number, number][] = []
  pts.forEach((q, i) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    const nx = (-dz / l) * (w / 2)
    const nz = (dx / l) * (w / 2)
    left.push([q[0] + nx, q[1] + nz])
    right.push([q[0] - nx, q[1] - nz])
  })
  const cum = [0]
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const v = (q: [number, number], i: number, u: number) => {
    pos.push(q[0], ys ? ys[i] : y, q[1])
    col.push(c.r, c.g, c.b)
    litA.push(lit)
    sA.push(cum[i])
    uA.push(u)
    wA.push(ow ? -w : w)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    v(left[i], i, 0)
    v(right[i], i, 1)
    v(left[i + 1], i + 1, 0)
    v(right[i], i, 1)
    v(right[i + 1], i + 1, 1)
    v(left[i + 1], i + 1, 0)
  }
}



/** A big venue (arena, stadium, sports centre): dark glazed base, pale body, dark band, stepped domed roof. */
function venueParts(p: number[], h: number, seed: number): BufferGeometry[] {
  let cx = 0
  let cz = 0
  for (let k = 0; k < p.length; k += 2) {
    cx += p[k]
    cz += p[k + 1]
  }
  cx /= p.length / 2
  cz /= p.length / 2
  const scaled = (s: number) => p.map((v, i) => (i % 2 ? cz + (v - cz) * s : cx + (v - cx) * s))
  const layer = (s: number, y0: number, y1: number, color: string) => {
    const g = new ExtrudeGeometry(toShape(scaled(s)), { depth: y1 - y0, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, y0, 0)
    const col = new Color(color)
    const n = g.attributes.position.count
    g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n }, () => [col.r, col.g, col.b]).flat(), 3))
    g.setAttribute('seed', new Float32BufferAttribute(new Array(n).fill(0.25 + 0.4 * hash1(seed)), 1))
    return g.toNonIndexed()
  }
  return [
    layer(1.0, 0, 5, '#46505f'),
    layer(0.994, 5, h - 3, '#d6dae0'),
    layer(1.012, h - 3, h, '#7d8696'),
    layer(0.9, h, h + 2.4, '#c9cfd8'),
    layer(0.7, h + 2.4, h + 4.4, '#dde1e7'),
    layer(0.45, h + 4.4, h + 5.8, '#eef0f3'),
  ]
}


/** Rounded rectangle outline, half-length hl along x and half-width hw along z, corner radius r. */
function rrect(hl: number, hw: number, r: number, n = 10): [number, number][] {
  const pts: [number, number][] = []
  const corners: [number, number, number][] = [
    [hl - r, hw - r, 0],
    [-(hl - r), hw - r, Math.PI / 2],
    [-(hl - r), -(hw - r), Math.PI],
    [hl - r, -(hw - r), 1.5 * Math.PI],
  ]
  for (const [cx, cz, a0] of corners)
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / n) * (Math.PI / 2)
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
  return pts
}

/**
 * AAMI Park: a compact rectangular football stadium (about 30,000 seats): a tiered blue and white bowl with rounded
 * corners closely round the pitch, a pale facade and a flat white roof ring held by a steel truss and columns.
 * Built in local pitch coordinates (x along the pitch), then turned and placed on the mapped pitch.
 */
function aamiPark(f: { c: [number, number]; a: number; p: number[] }) {
  let hl = 0
  let hw = 0
  const dx = Math.cos(f.a)
  const dz = Math.sin(f.a)
  for (let k = 0; k < f.p.length; k += 2) {
    hl = Math.max(hl, Math.abs((f.p[k] - f.c[0]) * dx + (f.p[k + 1] - f.c[1]) * dz))
    hw = Math.max(hw, Math.abs(-(f.p[k] - f.c[0]) * dz + (f.p[k + 1] - f.c[1]) * dx))
  }
  hl = Math.max(hl * 0.86, 56)
  hw = Math.max(hw * 0.86, 38)
  const place = (p: [number, number][]) =>
    p.flatMap(([x, z]) => [f.c[0] + x * dx - z * dz, f.c[1] + x * dz + z * dx])
  const ring = (o0: number, o1: number, y0: number, y1: number, color: string, seed = 0.3) => {
    const outer = place(rrect(hl + o1, hw + o1, 10 + o1 * 0.6))
    const sh = toShape(outer)
    const h2 = new Shape()
    const pts = place(rrect(hl + o0, hw + o0, 10 + o0 * 0.6))
    for (let i = 0; i < pts.length; i += 2) (i ? h2.lineTo : h2.moveTo).call(h2, pts[i], -pts[i + 1])
    sh.holes.push(h2)
    const g = new ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, y0, 0)
    const col = new Color(color)
    const n = g.attributes.position.count
    g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n }, () => [col.r, col.g, col.b]).flat(), 3))
    g.setAttribute('seed', new Float32BufferAttribute(new Array(n).fill(seed), 1))
    return g.toNonIndexed()
  }
  const parts = [
    ring(3, 17, 0, 5, '#2c63ad'), // lower tier
    ring(17, 20, 0, 5.6, '#e9edf2'), // concourse rail
    ring(20, 33, 0, 11, '#244f8f'), // middle tier
    ring(33, 36, 0, 11.6, '#e9edf2'),
    ring(36, 48, 0, 19, '#2c63ad'), // upper tier
    ring(48, 50, 0, 25, '#aab3c0', 0.5), // outer facade
    ring(26, 53, 25, 26.2, '#f4f6f8'), // flat roof ring over the upper seats
    ring(51, 53, 26.2, 29.5, '#d3d8df'), // steel edge truss
  ]
  // columns holding the roof, round the outside
  const cols: BufferGeometry[] = []
  const n = 40
  const outer = rrect(hl + 51.5, hw + 51.5, 10 + 51.5 * 0.6, 8)
  for (let k = 0; k < outer.length; k += Math.max(1, Math.round(outer.length / n))) {
    const [px, pz] = place([outer[k]])
    const g = new CylinderGeometry(0.7, 0.9, 26, 6).translate(px, 13, pz)
    const col = new Color('#c4cad3')
    const m = g.toNonIndexed()
    const nn = m.attributes.position.count
    m.setAttribute('color', new Float32BufferAttribute(Array.from({ length: nn }, () => [col.r, col.g, col.b]).flat(), 3))
    m.setAttribute('seed', new Float32BufferAttribute(new Array(nn).fill(0.2), 1))
    cols.push(m)
  }
  // the pitch: mown stripes along its length, white lines
  const pos: number[] = []
  const colr: number[] = []
  const S = 14
  for (let i = 0; i < S; i++) {
    const c = new Color(i % 2 ? '#2f8a3a' : '#3fa04a')
    const x0 = -hl + 3 + ((2 * hl - 6) * i) / S
    const x1 = -hl + 3 + ((2 * hl - 6) * (i + 1)) / S
    const q = place([
      [x0, -hw + 3],
      [x1, -hw + 3],
      [x1, hw - 3],
      [x0, hw - 3],
    ])
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(q[k * 2], 0.1, q[k * 2 + 1])
      colr.push(c.r, c.g, c.b)
    }
  }
  const turf = new BufferGeometry()
  turf.setAttribute('position', new Float32BufferAttribute(pos, 3))
  turf.setAttribute('color', new Float32BufferAttribute(colr, 3))
  turf.computeVertexNormals()
  const pitchLines = [
    place([
      [-(hl - 6), -(hw - 6)],
      [hl - 6, -(hw - 6)],
      [hl - 6, hw - 6],
      [-(hl - 6), hw - 6],
    ]),
    place([
      [0, -(hw - 6)],
      [0, hw - 6],
    ]),
    place(Array.from({ length: 36 }, (_, k): [number, number] => [Math.cos((k / 36) * 6.2832) * 9.15, Math.sin((k / 36) * 6.2832) * 9.15])),
  ]
  return { parts: [...parts, ...cols], turf, lines: pitchLines }
}

/** Wide, flat band round the stadium: the concourse and forecourt between the stands and the park. */
function forecourt() {
  const pos: number[] = []
  const N = 360
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const b = ((i + 1) / N) * Math.PI * 2
    const q = (t: number, r: number): [number, number] => [r * Math.cos(t), r * Math.sin(t)]
    const [x0, z0] = q(a, edgeAt(Math.cos(a), Math.sin(a)) - 14)
    const [x1, z1] = q(a, edgeAt(Math.cos(a), Math.sin(a)) + 6)
    const [x2, z2] = q(b, edgeAt(Math.cos(b), Math.sin(b)) - 14)
    const [x3, z3] = q(b, edgeAt(Math.cos(b), Math.sin(b)) + 6)
    pos.push(x0, 0, z0, x1, 0, z1, x2, 0, z2, x1, 0, z1, x3, 0, z3, x2, 0, z2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return g
}

function Trees({ trees }: { trees: [number, number][] }) {
  const crown = useRef<InstancedMesh>(null)
  const trunk = useRef<InstancedMesh>(null)
  const geo = useMemo(
    () => ({
      crown: new IcosahedronGeometry(1, 1).translate(0, 1, 0),
      trunk: new CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0),
    }),
    [],
  )
  const mats = useMemo(
    () => ({
      crown: new MeshStandardMaterial({ color: '#3f7a3c', roughness: 1, flatShading: true }),
      trunk: new MeshStandardMaterial({ color: '#5b4632', roughness: 1 }),
    }),
    [],
  )
  useLayoutEffect(() => {
    const c = crown.current
    const t = trunk.current
    if (!c || !t) return
    const o = new Object3D()
    trees.forEach(([x, z], i) => {
      const s = 3.2 + 3.4 * hash1(i + 5)
      o.position.set(x, 0, z)
      o.rotation.set(0, hash1(i + 9) * 6.28, 0)
      o.scale.set(s, s * 0.9, s)
      o.position.y = s * 0.9
      o.updateMatrix()
      c.setMatrixAt(i, o.matrix)
      o.position.set(x, 0, z)
      o.scale.set(1, s * 0.95, 1)
      o.updateMatrix()
      t.setMatrixAt(i, o.matrix)
      c.setColorAt(i, new Color().setHSL(0.25 + 0.05 * hash1(i + 2), 0.4, 0.26 + 0.1 * hash1(i + 7)))
    })
    c.instanceMatrix.needsUpdate = true
    t.instanceMatrix.needsUpdate = true
    if (c.instanceColor) c.instanceColor.needsUpdate = true
  }, [trees])
  return (
    <group>
      <instancedMesh ref={trunk} args={[geo.trunk, mats.trunk, trees.length]} frustumCulled={false} raycast={() => {}} />
      <instancedMesh ref={crown} args={[geo.crown, mats.crown, trees.length]} frustumCulled={false} raycast={() => {}} />
    </group>
  )
}

const lineMat = new LineBasicMaterial({ color: '#ffffff' })
const ovalLine = (p: number[]) => {
  const g = new BufferGeometry()
  const pos: number[] = []
  for (let k = 0; k < p.length; k += 2) pos.push(p[k], 0.12, p[k + 1])
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return new LineLoop(g, lineMat)
}

export function City() {
  const [osm, setOsm] = useState<Osm | null>(null)
  useEffect(() => {
    void import('../data/osm.json').then((m) => setOsm(m.default as unknown as Osm))
  }, [])
  // give the city a few frames to build and compile before the cover lifts, so everything shows up together
  useEffect(() => {
    if (!osm) return
    let n = 0
    let id = 0
    const tick = () =>
      ++n < 4 ? (id = requestAnimationFrame(tick)) : useStadium.getState().setReady()
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [osm])

  const geo = useMemo(() => {
    if (!osm) return null
    const palette = ['#c9c4bb', '#d8d2c6', '#b9b4ab', '#e2dccf', '#c4bcae', '#a9a69f', '#d6cfc2', '#b4ada2'].map(
      (c) => new Color(c),
    )
    const bs: BufferGeometry[] = []
    osm.b.forEach((b, i) => {
      for (let k = 0; k < b.p.length; k += 2) if (nearStadium(b.p[k], b.p[k + 1], 6)) return
      if (b.v) {
        try {
          bs.push(...venueParts(b.p, b.h, i))
        } catch {
          /* skip malformed footprint */
        }
        return
      }
      try {
        const g = new ExtrudeGeometry(toShape(b.p), { depth: b.h, bevelEnabled: false })
        g.rotateX(-Math.PI / 2)
        const c = palette[i % palette.length]
        const n = g.attributes.position.count
        g.setAttribute(
          'color',
          new Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3),
        )
        // per-building 'occupancy': some blocks mostly lit at night, many mostly dark
        g.setAttribute('seed', new Float32BufferAttribute(new Array(n).fill(0.04 + 0.8 * hash1(i + 1) ** 1.5), 1))
        bs.push(g.toNonIndexed())
      } catch {
        /* skip malformed footprint */
      }
    })
    // AAMI Park stands on the mapped rugby / soccer pitch south of the ground
    const aami = osm.p.find((f) => f.s === 'rugby;soccer')
    const aamiGeo = aami ? aamiPark(aami) : null
    if (aamiGeo) bs.push(...aamiGeo.parts)
    const buildings = mergeGeometries(
      bs.map((g) => {
        g.deleteAttribute('normal')
        return g
      }),
      false,
    )
    buildings.computeVertexNormals()

    // roads are sampled every 4 m and cut only where they would run under the stadium itself
    const pieces: Piece[] = []
    const pos: number[] = []
    const col: number[] = []
    const litA: number[] = []
    const sA: number[] = []
    const uA: number[] = []
    const wA: number[] = []
    const cut: { c: string; p: number[]; o?: number }[] = []
    // grid of railway points, to find roads that run along a track (a road crossing a track stays, as a bridge)
    const railCell = new Map<string, number[]>()
    const rk = (x: number, z: number) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`
    for (const r of osm.r)
      if (r.c === 'rail') {
        const p = resample(r.p, 3)
        for (let i = 0; i < p.length - 2; i += 2) {
          const k = rk(p[i], p[i + 1])
          const dx = p[i + 2] - p[i]
          const dz = p[i + 3] - p[i + 1]
          const l = Math.hypot(dx, dz) || 1
          ;(railCell.get(k) ?? railCell.set(k, []).get(k)!).push(p[i], p[i + 1], dx / l, dz / l)
        }
      }
    const railPoint = (x: number, z: number, d: number): [number, number, number, number] | null => {
      let best: [number, number, number, number] | null = null
      let bd = d
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const q = railCell.get(rk(x + i * 8, z + j * 8))
          if (q)
            for (let k = 0; k < q.length; k += 4) {
              const e = Math.hypot(q[k] - x, q[k + 1] - z)
              if (e < bd) {
                bd = e
                best = [q[k], q[k + 1], q[k + 2], q[k + 3]]
              }
            }
        }
      return best
    }
    const nearRail = (x: number, z: number, d: number) => railPoint(x, z, d) !== null
    for (const r0 of osm.r) {
      const r = r0
      let p = resample(r.p, 4)
      if (r.c !== 'rail' && r.c !== 'tram') {
        // a road that runs along a track (a run of points within 9 m) is eased out to 9.5 m from the nearest rail,
        // blending in and out over a few points, so it stays connected and does not sit on the track
        const near = Array.from({ length: p.length / 2 }, (_, i) => nearRail(p[i * 2], p[i * 2 + 1], 9))
        // gaps between neighbouring tracks (up to ~20 m) belong to the same run, so a road crossing a whole yard is one run
        for (let i = 0; i < near.length; i++)
          if (!near[i]) {
            let j = i
            while (j < near.length && !near[j]) j++
            if (i > 0 && j < near.length && j - i <= 5) for (let k = i; k < j; k++) near[k] = true
            i = j
          }
        const keep: number[] = []
        for (let i = 0; i < near.length; ) {
          let j = i
          while (j < near.length && near[j] === near[i]) j++
          // only a road running ALONG the track is eased aside; one that crosses the track stays straight
          let along = false
          if (near[i] && j - i >= 6) {
            const mid = (i + j) >> 1
            const q = railPoint(p[mid * 2], p[mid * 2 + 1], 14)
            const rx = p[(j - 1) * 2] - p[i * 2]
            const rz = p[(j - 1) * 2 + 1] - p[i * 2 + 1]
            const rl = Math.hypot(rx, rz) || 1
            along = !!q && Math.abs((rx * q[2] + rz * q[3]) / rl) > 0.8
          }
          for (let k = i; k < j; k++) {
            const x = p[k * 2]
            const z = p[k * 2 + 1]
            const q = along ? railPoint(x, z, 9) : null
            if (!q) keep.push(x, z)
            else {
              const d = Math.hypot(x - q[0], z - q[1]) || 0.01
              const w = Math.min(1, (k - i + 1) / 4, (j - k) / 4)
              const push = (9.5 - d) * w
              keep.push(x + ((x - q[0]) / d) * push, z + ((z - q[1]) / d) * push)
            }
          }
          i = j
        }
        p = keep
      }
      let cur: number[] = []
      for (let i = 0; i < p.length; i += 2) {
        if (!Number.isNaN(p[i]) && !nearStadium(p[i], p[i + 1], 2)) cur.push(p[i], p[i + 1])
        else {
          if (cur.length >= 4) cut.push({ c: r.c, p: cur, o: r.o })
          cur = []
        }
      }
      if (cur.length >= 4) cut.push({ c: r.c, p: cur, o: r.o })
    }
    for (const r of cut) {
      const ow = !!r.o && r.c in OW_W
      pieces.push({ c: r.c, p: r.p, ow, w: ow ? OW_W[r.c] : (ROAD_W[r.c] ?? 5), m: false })
    }
    // footbridges: a footpath, cycle path or pedestrian way that crosses the railway is lifted on a deck with
    // ramps either side, handrails along it and piers underneath
    const PED = new Set(['footway', 'cycleway', 'pedestrian', 'path'])
    const H = 7.2
    const RAMP = 32
    const bridgeYs = new Map<Piece, number[]>()
    const noBridge = new Set<Piece>() // short paths that only clip a track: dropped, not bridged
    const rails2: { p: number[]; ys: number[] }[] = []
    const piers: BufferGeometry[] = []
    for (const r of pieces) {
      if (!PED.has(r.c)) continue
      const n = r.p.length / 2
      const over = Array.from({ length: n }, (_, i) => {
        const q = railPoint(r.p[i * 2], r.p[i * 2 + 1], 7.5)
        return q !== null
      })
      if (!over.some(Boolean)) continue
      // a real footbridge crosses the whole rail corridor: at least 4 points (16 m) over the tracks
      let any = false
      for (let i = 0; i < over.length; ) {
        let j = i
        while (j < over.length && over[j] === over[i]) j++
        if (over[i] && j - i < 4) for (let k = i; k < j; k++) over[k] = false
        else if (over[i]) any = true
        i = j
      }
      if (!any) {
        noBridge.add(r)
        continue
      }
      const cum = [0]
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(r.p[i * 2] - r.p[i * 2 - 2], r.p[i * 2 + 1] - r.p[i * 2 - 1]))
      // arc distance from each point to the nearest point over the tracks
      const gap = cum.map((s) => {
        let g = Infinity
        for (let i = 0; i < n; i++) if (over[i]) g = Math.min(g, Math.abs(cum[i] - s))
        return g
      })
      const ys = gap.map((g) => {
        const u = Math.max(0, 1 - Math.max(0, g - 4) / RAMP)
        return H * u * u * (3 - 2 * u)
      })
      // switchback ramps are straightened: one straight run from where the path leaves the ground to where it
      // lands again, climbing evenly to the deck over the tracks and back down, so it always reaches the ground
      let a = ys.findIndex((v) => v > 0.05)
      let b = ys.length - 1 - [...ys].reverse().findIndex((v) => v > 0.05)
      if (a > 0) a--
      if (b < n - 1) b++
      if (b - a >= 2) {
        const [ax, az] = [r.p[a * 2], r.p[a * 2 + 1]]
        const [bx, bz] = [r.p[b * 2], r.p[b * 2 + 1]]
        const L = Math.hypot(bx - ax, bz - az)
        const m = Math.max(2, Math.ceil(L / 4))
        const straight: number[] = []
        for (let k = 0; k <= m; k++) straight.push(ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m)
        const ov = Array.from({ length: m + 1 }, (_, k) => railPoint(straight[k * 2], straight[k * 2 + 1], 7.5) !== null)
        let k1 = ov.indexOf(true)
        let k2 = ov.lastIndexOf(true)
        if (k1 < 0) k1 = k2 = Math.floor(m / 2)
        const ys2 = Array.from({ length: m + 1 }, (_, k) => {
          const u = k < k1 ? k / Math.max(1, k1) : k > k2 ? (m - k) / Math.max(1, m - k2) : 1
          return H * u * u * (3 - 2 * u)
        })
        r.p = [...r.p.slice(0, a * 2), ...straight, ...r.p.slice((b + 1) * 2)]
        ys.splice(a, b - a + 1, ...ys2)
        for (let k = 0; k < a; k++) ys[k] = 0
        for (let k = a + ys2.length; k < ys.length; k++) ys[k] = 0
      }
      bridgeYs.set(r, ys)
      // handrails along the raised part
      let i = 0
      while (i < ys.length) {
        if (ys[i] < 0.4) {
          i++
          continue
        }
        let j = i
        while (j < ys.length && ys[j] >= 0.4) j++
        const seg: number[] = r.p.slice(i * 2, j * 2)
        const sy = ys.slice(i, j)
        if (sy.length >= 2) {
          for (const side of [-1, 1]) {
            const line: number[] = []
            for (let k = 0; k < sy.length; k++) {
              const a = Math.max(0, k - 1)
              const b = Math.min(sy.length - 1, k + 1)
              const dx = seg[b * 2] - seg[a * 2]
              const dz = seg[b * 2 + 1] - seg[a * 2 + 1]
              const l = Math.hypot(dx, dz) || 1
              const off = (r.w / 2 + 0.6) * side
              line.push(seg[k * 2] + (-dz / l) * off, seg[k * 2 + 1] + (dx / l) * off)
            }
            rails2.push({ p: line, ys: sy.map((v) => v + 1.1) }, { p: line, ys: sy.map((v) => v + 0.55) })
          }
          // piers under the deck where it is well above the ground
          for (let k = 0; k < sy.length; k += 3)
            if (sy[k] > 2.2) {
              const g = new CylinderGeometry(0.4, 0.5, sy[k] - 0.3, 6).translate(seg[k * 2], (sy[k] - 0.3) / 2, seg[k * 2 + 1])
              piers.push(g.toNonIndexed())
            }
        }
        i = j
      }
    }
    for (const r of [...pieces].sort((a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c))) {
      if (noBridge.has(r)) continue
      const ys = bridgeYs.get(r)
      ribbon(r.p, r.w, 0.14, new Color(ROAD_C[r.c] ?? '#74747c'), ROAD_LIT[r.c] ?? 0.3, r.ow, pos, col, litA, sA, uA, wA, ys ? ys.map((v) => v + 0.14) : undefined)
    }
    const railCol = new Color('#9aa0aa')
    for (const q of rails2) ribbon(q.p, 0.18, 0, railCol, 0, false, pos, col, litA, sA, uA, wA, q.ys)
    const pierGeo = piers.length ? mergeGeometries(piers, false) : null
    const roads = new BufferGeometry()
    roads.setAttribute('position', new Float32BufferAttribute(pos, 3))
    roads.setAttribute('color', new Float32BufferAttribute(col, 3))
    roads.setAttribute('rlit', new Float32BufferAttribute(litA, 1))
    roads.setAttribute('rs', new Float32BufferAttribute(sA, 1))
    roads.setAttribute('ru', new Float32BufferAttribute(uA, 1))
    roads.setAttribute('rw', new Float32BufferAttribute(wA, 1))
    roads.computeVertexNormals()

    const merge = (gs: BufferGeometry[]) => (gs.length ? mergeGeometries(gs, false) : null)
    const parks = merge(osm.g.filter((q) => !q.w).map((q) => flatGeo(q.p)))
    const woods = merge(osm.g.filter((q) => q.w).map((q) => flatGeo(q.p)))
    const courts = merge(osm.p.filter((f) => f.s === 'tennis' || f.s === 'basketball').map((f) => flatGeo(f.p)))
    const fields = merge(osm.p.filter((f) => f.s !== 'tennis' && f.s !== 'basketball' && f.s !== 'rugby;soccer').map((f) => flatGeo(f.p)))
    // football ovals: white boundary and centre circle, and goal posts at each end of the long axis
    const lines: number[][] = []
    const posts: BufferGeometry[] = []
    for (const f of osm.p) {
      if (!f.s.includes('football')) continue
      const dx = Math.cos(f.a)
      const dz = Math.sin(f.a)
      let half = 0
      for (let k = 0; k < f.p.length; k += 2) half = Math.max(half, Math.abs((f.p[k] - f.c[0]) * dx + (f.p[k + 1] - f.c[1]) * dz))
      lines.push(f.p.slice(), Array.from({ length: 48 }, (_, k) => [f.c[0] + Math.cos((k / 48) * 6.2832) * 25, f.c[1] + Math.sin((k / 48) * 6.2832) * 25]).flat())
      for (const end of [-1, 1])
        for (const [off, ph] of [[-9.6, 3.2], [-3.2, 6.4], [3.2, 6.4], [9.6, 3.2]] as const) {
          const x = f.c[0] + dx * (half - 1) * end - dz * off
          const z = f.c[1] + dz * (half - 1) * end + dx * off
          const g = new CylinderGeometry(0.12, 0.12, ph, 5).translate(x, ph / 2, z)
          g.deleteAttribute('uv')
          posts.push(g.toNonIndexed())
        }
    }
    const goalPosts = merge(posts)
    if (aamiGeo) lines.push(...aamiGeo.lines)
    const ponds = merge(osm.w.map((q) => flatGeo(q.p)))
    // the Yarra river: a wide ribbon along its centre line
    const rp: number[] = []
    const rc: number[] = []
    const dummy: number[][] = [[], [], [], []]
    for (const l of osm.l) ribbon(resample(l.p, 6), l.w * 1.8, 0.01, new Color('#fff'), 0, false, rp, rc, dummy[0], dummy[1], dummy[2], dummy[3])
    const river = new BufferGeometry()
    river.setAttribute('position', new Float32BufferAttribute(rp, 3))
    river.computeVertexNormals()

    // street lamps along the larger roads, alternating sides
    const lamps: number[] = []
    const lampSpacing: Record<string, number> = { motorway: 36, trunk: 36, primary: 32, secondary: 34, tertiary: 40, residential: 52 }
    for (const r of pieces) {
      const sp = lampSpacing[r.c]
      if (!sp) continue
      let acc = sp / 2
      let side = 1
      for (let i = 0; i < r.p.length - 2 && lamps.length < 9000; i += 2) {
        const dx = r.p[i + 2] - r.p[i]
        const dz = r.p[i + 3] - r.p[i + 1]
        const len = Math.hypot(dx, dz)
        if (!len) continue
        for (; acc < len; acc += sp, side = -side) {
          const f = acc / len
          const off = (r.w / 2 + 1.2) * side
          lamps.push(r.p[i] + dx * f + (-dz / len) * off, 6.5, r.p[i + 1] + dz * f + (dx / len) * off)
        }
        acc -= len
      }
    }
    const lampGeo = new BufferGeometry()
    lampGeo.setAttribute('position', new Float32BufferAttribute(lamps, 3))
    // the longest railway pieces nearest the ground carry the trains
    // OSM splits the railway into many short ways; join them end to end (where they meet and carry straight on) so
    // a train runs along a whole line instead of stopping where one way ends and the next begins
    type Pt2 = [number, number]
    const pool: Pt2[][] = cut
      .filter((r) => r.c === 'rail')
      .map((r) => r.p.reduce<Pt2[]>((acc, _, i) => (i % 2 ? acc : (acc.push([r.p[i], r.p[i + 1]]), acc)), []))
      .filter((l) => l.length >= 2)
    const tan = (l: Pt2[], atEnd: boolean): Pt2 => {
      const a = atEnd ? l[l.length - 2] : l[1]
      const b = atEnd ? l[l.length - 1] : l[0]
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      return atEnd ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [(a[0] - b[0]) / d, (a[1] - b[1]) / d]
    }
    const chains: Pt2[][] = []
    while (pool.length) {
      let ch = pool.pop()!
      for (let grow = true; grow; ) {
        grow = false
        for (const atEnd of [true, false]) {
          const end = atEnd ? ch[ch.length - 1] : ch[0]
          const t = tan(ch, atEnd)
          let best = -1
          let bestRev = false
          let bestDot = 0.96
          pool.forEach((o, k) => {
            for (const rev of [false, true]) {
              const oo = rev ? [...o].reverse() : o
              // outward direction of the chain end must match the direction the other way leaves from the joint
              const s = atEnd ? oo[0] : oo[oo.length - 1]
              if (Math.hypot(s[0] - end[0], s[1] - end[1]) > 1) continue
              const ot = atEnd ? tan(oo, false) : tan(oo, true)
              const dot = atEnd ? t[0] * ot[0] + t[1] * ot[1] : t[0] * ot[0] + t[1] * ot[1]
              if (dot > bestDot) {
                bestDot = dot
                best = k
                bestRev = rev
              }
            }
          })
          if (best >= 0) {
            const o = pool.splice(best, 1)[0]
            const oo = bestRev ? [...o].reverse() : o
            ch = atEnd ? [...ch, ...oo.slice(1)] : [...oo.slice(0, -1), ...ch]
            grow = true
          }
        }
      }
      chains.push(ch)
    }
    // a train must never swing onto another track: cut every chain wherever it bends sharply (a switch or crossover)
    const smooth: Pt2[][] = []
    for (const ch of chains) {
      let cur: Pt2[] = [ch[0]]
      for (let i = 1; i < ch.length; i++) {
        cur.push(ch[i])
        if (i < ch.length - 1) {
          const ax = ch[i][0] - ch[i - 1][0]
          const az = ch[i][1] - ch[i - 1][1]
          const bx = ch[i + 1][0] - ch[i][0]
          const bz = ch[i + 1][1] - ch[i][1]
          const la = Math.hypot(ax, az)
          const lb = Math.hypot(bx, bz)
          if (la > 0.01 && lb > 0.01 && (ax * bx + az * bz) / (la * lb) < 0.94) {
            smooth.push(cur)
            cur = [ch[i]]
          }
        }
      }
      smooth.push(cur)
    }
    const candidates = smooth
      .filter((l) => toLen(l) > 300)
      .sort((a, b) => toLen(b) - toLen(a))
    // one train per line, and only on lines that stay at least 4.5 m clear of the ones already chosen
    // (duplicated or crossing OSM ways would make trains run through each other)
    const rails: [number, number][][] = []
    for (const l of candidates) {
      if (rails.length >= 4) break
      const clash = rails.some((o) => l.some(([x, z]) => o.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < 4.5)))
      if (!clash) rails.push(l)
    }
    // no traffic on short stubs
    const trafficPieces = pieces.filter((r) => {
      let len = 0
      for (let i = 2; i < r.p.length; i += 2) len += Math.hypot(r.p[i] - r.p[i - 2], r.p[i + 1] - r.p[i - 1])
      return len > 90
    })
    const trees = osm.t.filter(([x, z]) => !nearStadium(x, z, 4))
    return { buildings, roads, parks, woods, courts, fields, ponds, river, lampGeo, pieces, trafficPieces, pierGeo, trees, rails, goalPosts, lines, turf: aamiGeo?.turf ?? null, plaza: forecourt() }
  }, [osm])

  const mats = useMemo(() => {
    const b = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    // Windows glow only on walls (never roofs/terraces); each building has its own share of lit windows.
    b.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = { value: 0 }
      b.userData.sh = sh
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float seed;\nvarying float vSeed;\nvarying vec3 vWP;\nvarying vec3 vWN;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvSeed = seed; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);',
        )
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uNight; varying float vSeed; varying vec3 vWP; varying vec3 vWN;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          if (abs(vWN.y) < 0.3 && uNight > 0.0) {
            float along = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;
            vec2 g = vec2(along / 3.4, vWP.y / 3.3);
            vec2 id = floor(g); vec2 f = fract(g);
            float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
            float lit = step(h21(id + vSeed * 91.0), vSeed * 0.5);
            vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.8, 0.9, 1.0), step(0.82, h21(id * 1.7 + vSeed * 13.0)));
            totalEmissiveRadiance += warm * win * lit * uNight * (0.6 + 0.8 * h21(id + 3.0));
          }`,
        )
    }
    // Roads glow warm under streetlights: whole carriageway lit, brighter in pools around each lamp.
    const roadMat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      side: DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    roadMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = { value: 0 }
      roadMat.userData.sh = sh
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float rlit;\nattribute float rs;\nattribute float ru;\nattribute float rw;\nvarying float vLit;\nvarying float vS;\nvarying float vU;\nvarying float vW;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvLit = rlit; vS = rs; vU = ru; vW = rw;',
        )
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uNight; varying float vLit; varying float vS; varying float vU; varying float vW;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // lane markings on the wider roads: edge lines, centre line (two-way) and dashed lane dividers
            float w = abs(vW);
            if (w >= 7.0) {
              bool oneway = vW < 0.0;
              float lat = (vU - 0.5) * w;
              float fade = 1.0 - smoothstep(0.35, 1.2, fwidth(vU * w));
              float edge = step(abs(abs(lat) - (w * 0.5 - 0.45)), 0.1);
              float centre = oneway ? 0.0 : step(abs(lat), 0.1);
              float lanes = max(1.0, floor((oneway ? w : w * 0.5) / 3.5 + 0.5));
              float lw = (oneway ? w : w * 0.5) / lanes;
              float off = oneway ? lat + w * 0.5 : abs(lat);
              float kk = floor(off / lw + 0.5);
              float dk = abs(off - kk * lw);
              float dash = step(1.0, kk) * step(kk, lanes - 1.0) * step(dk, 0.08) * step(fract(vS / 9.0), 0.5);
              float mark = clamp(edge + centre + dash, 0.0, 1.0) * fade;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), mark * 0.85);
            }
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float aa = 1.0 - smoothstep(1.5, 6.0, fwidth(vS));
          float pool = 0.8 + 0.2 * aa * cos(vS * 6.2832 / 34.0);
          totalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * vLit * uNight * pool * 0.42;`,
        )
    }
    const flat = (color: string, o: number) =>
      new MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: o, polygonOffsetUnits: o })
    return {
      b,
      r: roadMat,
      plaza: flat('#a39e92', -5),
      p: flat('#5f8f4f', -1),
      wood: flat('#4a7f42', -1.2),
      f: flat('#4f9d45', -1.5),
      turf: new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 }),
      pier: new MeshStandardMaterial({ color: '#9a968a', roughness: 1 }),
      post: new MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.6 }),
      court: flat('#4f7fa6', -2),
      water: new MeshStandardMaterial({ side: DoubleSide, color: '#3b78a0', emissive: '#15405f', emissiveIntensity: 0.4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    }
  }, [])

  useFrame(() => {
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    const sh = mats.b.userData.sh
    if (sh) sh.uniforms.uNight.value = night
    const rsh = mats.r.userData.sh
    if (rsh) rsh.uniforms.uNight.value = night
    mats.water.emissiveIntensity = 0.45 * (1 - night * 0.8)
    mats.water.color.copy(live.horizon).lerp(new Color('#2b6b94'), 0.8)
  })

  const lampMats = useMemo(
    () => ({
      head: new PointsMaterial({
        map: glowTexture,
        color: '#ffb560',
        size: 5,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    }),
    [],
  )
  const lampRef = useRef<Group>(null)
  useFrame(() => {
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    lampMats.head.opacity = night * 0.7
    if (lampRef.current) lampRef.current.visible = night > 0.02
  })
  const mode = useStadium((s) => s.mode)
  if (!geo) return null
  return (
    <group visible={mode !== 'stand'}>
      {geo.parks && <mesh geometry={geo.parks} material={mats.p} position-y={0.02} renderOrder={2} />}
      {geo.woods && <mesh geometry={geo.woods} material={mats.wood} position-y={0.022} renderOrder={2} />}
      {geo.fields && <mesh geometry={geo.fields} material={mats.f} position-y={0.03} renderOrder={3} />}
      {geo.courts && <mesh geometry={geo.courts} material={mats.court} position-y={0.04} renderOrder={3} />}
      {geo.ponds && <mesh geometry={geo.ponds} material={mats.water} position-y={0.03} renderOrder={3} />}
      <mesh geometry={geo.river} material={mats.water} position-y={0.02} renderOrder={3} />
      <mesh geometry={geo.plaza} material={mats.plaza} position-y={0.07} renderOrder={4} />
      <mesh geometry={geo.roads} material={mats.r} renderOrder={5} />
      <Traffic pieces={geo.trafficPieces} autos={false} headlights={false} />
      <Railway rails={geo.rails} />
      {geo.pierGeo && <mesh geometry={geo.pierGeo} material={mats.pier} />}
      {geo.turf && <mesh geometry={geo.turf} material={mats.turf} renderOrder={6} />}
      {geo.goalPosts && <mesh geometry={geo.goalPosts} material={mats.post} />}
      {geo.lines.map((l, i) => (
        <primitive key={i} object={ovalLine(l)} />
      ))}
      <Trees trees={geo.trees} />
      <mesh geometry={geo.buildings} material={mats.b} renderOrder={7} />
      <group ref={lampRef}>
        <points geometry={geo.lampGeo} material={lampMats.head} frustumCulled={false} />
      </group>
    </group>
  )
}
