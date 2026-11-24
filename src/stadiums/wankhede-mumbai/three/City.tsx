import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  PointsMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { useStadium } from '../../../store/useStadium'
import { A, OUTER } from '../data/layout'
import { glowTexture, live } from './Environment'
import { distToChain, coastChain, pushedOut, seawardNormals } from './coast'
import { Marine, PUSH } from './Marine'
import { makeTracks, Railway } from './Railway'
import { fillerBuildings, isInfillPark } from './fill'
import { Traffic } from './Traffic'

// OpenStreetMap-derived scene (see scripts/build_osm.py): buildings, roads, parks, sea.
interface Osm {
  b: { p: number[]; h: number }[]
  r: { c: string; p: number[]; o?: number }[]
  g: { p: number[] }[]
  s: number[]
  p: { p: number[]; c: [number, number]; a: number }[]
}

const ROAD_W: Record<string, number> = { motorway: 12, trunk: 14, primary: 13, secondary: 10, tertiary: 8, residential: 6, unclassified: 6, service: 3.5, pedestrian: 4, footway: 1.6, rail: 5 }
/** width of a single one-way carriageway (OSM draws dual carriageways as two one-way ways) */
const OW_W: Record<string, number> = { motorway: 12, trunk: 11, primary: 11, secondary: 8.5, tertiary: 7, residential: 5, unclassified: 5, service: 3.5 }
const ROAD_LIT: Record<string, number> = { motorway: 1, trunk: 1, primary: 1, secondary: 0.9, tertiary: 0.75, residential: 0.5, unclassified: 0.4, service: 0.22, pedestrian: 0.2, footway: 0.1, rail: 0 }
const ROAD_C: Record<string, string> = { rail: '#5a544d', footway: '#a79c88', service: '#8a8a90', pedestrian: '#8d8577' }

export interface Piece {
  c: string
  p: number[]
  /** one-way carriageway (motorway ways are drawn one per direction) */
  ow: boolean
  w: number
  /** within reach of the sea front (Marine Drive) */
  m: boolean
}

/** Map features are kept out of a thin forecourt around the bowl so nothing merges into the stands. */
const FOOT = A + OUTER + 2
const CLEAR = A + OUTER + 10
const inside = (p: number[], r: number) => {
  for (let i = 0; i < p.length; i += 2) if (Math.hypot(p[i], p[i + 1]) < r) return true
  return false
}
function nearLine(p: number[], lines: [number, number][][], d: number) {
  for (let i = 0; i < p.length; i += 2) {
    for (const l of lines) {
      for (let k = 0; k < l.length - 1; k++) {
        const [ax, az] = l[k]
        const dx = l[k + 1][0] - ax
        const dz = l[k + 1][1] - az
        const q = dx * dx + dz * dz || 1
        const t = Math.max(0, Math.min(1, ((p[i] - ax) * dx + (p[i + 1] - az) * dz) / q))
        if (Math.hypot(p[i] - ax - t * dx, p[i + 1] - az - t * dz) < d) return true
      }
    }
  }
  return false
}
const hash1 = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** Pulls any part of a footprint that reaches into the forecourt back to its edge (so it never touches the stands). */
function trimToForecourt(p: number[], r0: number): number[] | null {
  const q = p.slice()
  for (let k = 0; k < q.length; k += 2) {
    const r = Math.hypot(q[k], q[k + 1])
    if (r < r0) {
      q[k] = (q[k] * r0) / r
      q[k + 1] = (q[k + 1] * r0) / r
    }
  }
  let area = 0
  for (let k = 0; k < q.length; k += 2) {
    const j = (k + 2) % q.length
    area += q[k] * q[j + 1] - q[j] * q[k + 1]
  }
  return Math.abs(area) / 2 < 60 ? null : q
}

const toShape = (p: number[]) => {
  const sh = new Shape()
  for (let i = 0; i < p.length; i += 2) (i ? sh.lineTo : sh.moveTo).call(sh, p[i], -p[i + 1])
  return sh
}

function ribbon(p: number[], w: number, y: number, c: Color, lit: number, ow: boolean, pos: number[], col: number[], litA: number[], sA: number[], uA: number[], wA: number[]) {
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
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const v = (q: [number, number], i: number, u: number) => {
    pos.push(q[0], y, q[1])
    col.push(c.r, c.g, c.b)
    litA.push(lit)
    sA.push(cum[i])
    uA.push(u)
    wA.push(ow ? -w : w)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    v(left[i], i, 0); v(right[i], i, 1); v(left[i + 1], i + 1, 0)
    v(right[i], i, 1); v(right[i + 1], i + 1, 1); v(left[i + 1], i + 1, 0)
  }
}

export function City() {
  const [osm, setOsm] = useState<Osm | null>(null)
  useEffect(() => {
    void import('../data/osm.json').then((m) => setOsm(m.default as Osm))
  }, [])
  // give the city a few frames to build and compile before the cover lifts, so everything shows up together
  useEffect(() => {
    if (!osm) return
    let n = 0
    let id = 0
    const tick = () => (++n < 4 ? (id = requestAnimationFrame(tick)) : useStadium.getState().setReady())
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [osm])

  const geo = useMemo(() => {
    if (!osm) return null
    const palette = ['#c9c4bb', '#d8d2c6', '#b9b4ab', '#e2dccf', '#c4bcae', '#a9a69f', '#d6cfc2', '#b4ada2'].map((c) => new Color(c))
    const bs: BufferGeometry[] = []
    // two tracks between the stadium and the road: east of the stands, clear of both
    const railWays = osm.r.filter((r) => r.c === 'rail').map((r) => r.p.reduce<[number, number][]>((a, _, i) => (i % 2 ? a : (a.push([r.p[i], r.p[i + 1]]), a)), []))
    const tracks = makeTracks(railWays)
    const trackLines = tracks ? [tracks.south, tracks.north] : []
    const footprints = osm.b.concat(fillerBuildings(osm, (c) => ROAD_W[c] ?? 6, CLEAR))
    footprints.forEach((b, i) => {
      let foot = b.p
      if (inside(b.p, CLEAR)) {
        // a building that reaches into the forecourt is kept but trimmed back to the forecourt edge (so it becomes
        // thin where needed) instead of being dropped; the stadium's own structures at the centre are still dropped
        let cx = 0
        let cz = 0
        for (let k = 0; k < b.p.length; k += 2) {
          cx += b.p[k]
          cz += b.p[k + 1]
        }
        if (Math.hypot(cx, cz) / (b.p.length / 2) < 120) return
        foot = b.p.slice()
        const R = CLEAR + 4
        for (let k = 0; k < foot.length; k += 2) {
          const r = Math.hypot(foot[k], foot[k + 1])
          if (r < R) {
            foot[k] = (foot[k] * R) / r
            foot[k + 1] = (foot[k + 1] * R) / r
          }
        }
        let area = 0
        for (let k = 0; k < foot.length; k += 2) {
          const j = (k + 2) % foot.length
          area += foot[k] * foot[j + 1] - foot[j] * foot[k + 1]
        }
        if (Math.abs(area) / 2 < 40) return
      }
      if (nearLine(foot, trackLines, 9)) return
      try {
        const g = new ExtrudeGeometry(toShape(foot), { depth: b.h, bevelEnabled: false })
        g.rotateX(-Math.PI / 2)
        const c = palette[i % palette.length]
        g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3))
        const n = g.attributes.position.count
        // per-building 'occupancy': some blocks mostly lit at night, many mostly dark
        g.setAttribute('seed', new Float32BufferAttribute(new Array(n).fill(0.04 + 0.8 * hash1(i + 1) ** 1.5), 1))
        bs.push(g.toNonIndexed())
      } catch {
        /* skip malformed footprint */
      }
    })
    const buildings = mergeGeometries(bs.map((g) => { g.deleteAttribute('normal'); return g }), false)
    buildings.computeVertexNormals()

    const pos: number[] = []
    const col: number[] = []
    const litA: number[] = []
    const sA: number[] = []
    const uA: number[] = []
    const wA: number[] = []
    const order = ['footway', 'service', 'pedestrian', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway', 'rail']
    // roads are cut where they would run under the stadium / forecourt
    const coast = coastChain(osm.s)
    const pieces: Piece[] = []
    const mk = (c: string, p: number[], o?: number): Piece => {
      let near = Infinity
      if (c !== 'footway' && c !== 'service' && c !== 'residential') for (let i = 0; i < p.length; i += 2) near = Math.min(near, distToChain(p[i], p[i + 1], coast))
      const ow = !!o && c in OW_W
      return { c, p, ow, w: ow ? OW_W[c] : ROAD_W[c] ?? 5, m: near < 90 }
    }
    for (const r of osm.r) {
      if (r.c === 'rail') continue // rails get their own renderer
      let cur: number[] = []
      for (let i = 0; i < r.p.length; i += 2) {
        if (Math.hypot(r.p[i], r.p[i + 1]) >= FOOT) cur.push(r.p[i], r.p[i + 1])
        else {
          if (cur.length >= 4) pieces.push(mk(r.c, cur, r.o))
          cur = []
        }
      }
      if (cur.length >= 4) pieces.push(mk(r.c, cur, r.o))
    }
    for (const r of pieces.sort((a, b) => order.indexOf(a.c) - order.indexOf(b.c))) {
      ribbon(r.p, r.w, 0.06, new Color(ROAD_C[r.c] ?? '#74747c'), ROAD_LIT[r.c] ?? 0.3, r.ow, pos, col, litA, sA, uA, wA)
    }
    const roads = new BufferGeometry()
    roads.setAttribute('position', new Float32BufferAttribute(pos, 3))
    roads.setAttribute('color', new Float32BufferAttribute(col, 3))
    roads.setAttribute('rlit', new Float32BufferAttribute(litA, 1))
    roads.setAttribute('rs', new Float32BufferAttribute(sA, 1))
    roads.setAttribute('ru', new Float32BufferAttribute(uA, 1))
    roads.setAttribute('rw', new Float32BufferAttribute(wA, 1))
    roads.computeVertexNormals()

    const parks = mergeGeometries(osm.g.filter((p) => !isInfillPark(p.p)).map((p) => (inside(p.p, FOOT) ? trimToForecourt(p.p, CLEAR + 4) : p.p)).filter((p): p is number[] => !!p).map((p) => new ShapeGeometry(toShape(p)).rotateX(-Math.PI / 2)).map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed() }), false)
    const fields = mergeGeometries(osm.p.filter((f) => !inside(f.p, FOOT)).map((f) => new ShapeGeometry(toShape(f.p)).rotateX(-Math.PI / 2)).map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed() }), false)
    const strips = mergeGeometries(
      osm.p.filter((f) => !inside(f.p, FOOT)).map((f) => new PlaneGeometry(3.05, 20.12).rotateX(-Math.PI / 2).rotateY(Math.PI / 2 - f.a).translate(f.c[0], 0.06, f.c[1])).map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed() }),
      false,
    )
    // street lamps along the larger roads, alternating sides
    const lamps: number[] = []
    const lampSpacing: Record<string, number> = { motorway: 36, trunk: 36, primary: 32, secondary: 34, tertiary: 40, residential: 52 }
    for (const r of pieces) {
      const sp = r.m ? 18 : lampSpacing[r.c]
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
    const out = pushedOut(coast, seawardNormals(coast), PUSH)
    const seaPoly = out.flatMap((q) => q).concat(osm.s.slice(-4))
    const sea = new ShapeGeometry(toShape(seaPoly)).rotateX(-Math.PI / 2)
    return { buildings, roads, parks, sea, fields, strips, lampGeo, pieces, coast, tracks }
  }, [osm])

  const mats = useMemo(() => {
    const b = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    // Windows glow only on walls (never roofs/terraces); each building has its own share of lit windows.
    b.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = { value: 0 }
      b.userData.sh = sh
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float seed;\nvarying float vSeed;\nvarying vec3 vWP;\nvarying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeed = seed; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight; varying float vSeed; varying vec3 vWP; varying vec3 vWN;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
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
    const roadMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide, depthWrite: false })
    roadMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = { value: 0 }
      roadMat.userData.sh = sh
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float rlit;\nattribute float rs;\nattribute float ru;\nattribute float rw;\nvarying float vLit;\nvarying float vS;\nvarying float vU;\nvarying float vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = rlit; vS = rs; vU = ru; vW = rw;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight; varying float vLit; varying float vS; varying float vU; varying float vW;')
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
    const sea = new MeshStandardMaterial({ color: '#2d6f9f', emissive: '#15405f', emissiveIntensity: 0.5, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    sea.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 }
      sea.userData.sh = sh
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWP;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float w1 = sin(vWP.x * 0.045 + uTime * 0.8) * sin(vWP.z * 0.06 - uTime * 0.6);
          float w2 = sin(vWP.x * 0.21 + vWP.z * 0.13 + uTime * 1.7);
          diffuseColor.rgb *= 0.9 + 0.07 * w1 + 0.03 * w2;
          // rolling swells across the whole sea, heading in towards the shore (east)
          vec2 wd = normalize(vec2(1.0, 0.25));
          vec2 wp = vec2(-wd.y, wd.x);
          float along = dot(vWP.xz, wd);
          float across = dot(vWP.xz, wp);
          float swell = 0.0;
          for (int k = 0; k < 2; k++) {
            float L = 55.0 + float(k) * 40.0;
            float c = along / L - uTime * (0.07 - float(k) * 0.015) + 0.12 * sin(across * 0.02 + float(k) * 2.0) + 0.04 * sin(across * 0.08 + float(k));
            float ph = fract(c);
            float line = smoothstep(0.0, 0.02, ph) * (1.0 - smoothstep(0.02, 0.09, ph));
            float broken = smoothstep(0.35, 0.75, 0.5 + 0.5 * sin(across * 0.035 + floor(c) * 4.1 + float(k)) * sin(across * 0.067 - floor(c) * 2.3 + 1.0));
            float aa = 1.0 - smoothstep(0.35, 0.9, fwidth(c));
            swell += line * broken * aa * (0.6 - float(k) * 0.15);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.94, 1.0), clamp(swell, 0.0, 0.4));`,
        )
    }
    return {
      b,
      plaza: new MeshStandardMaterial({ color: '#9a968a', roughness: 1, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }),
      r: roadMat,
      p: new MeshStandardMaterial({ color: '#5f8f4f', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      f: new MeshStandardMaterial({ color: '#4f9d45', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5 }),
      t: new MeshStandardMaterial({ color: '#cdb887', roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      s: sea,
    }
  }, [])

  useFrame(({ clock }) => {
    const ssh = mats.s.userData.sh
    mats.s.emissiveIntensity = 0.55 * (1 - Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5)) * 0.8)
    if (ssh) ssh.uniforms.uTime.value = clock.elapsedTime
    const sh = mats.b.userData.sh
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    if (sh) sh.uniforms.uNight.value = night
    const rsh = mats.r.userData.sh
    if (rsh) rsh.uniforms.uNight.value = night
    mats.s.color.copy(live.horizon).lerp(new Color('#1d5d8f'), 0.82)
  })

  const lampMats = useMemo(
    () => ({
      head: new PointsMaterial({ map: glowTexture, color: '#ffb560', size: 5, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
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
      <mesh geometry={geo.sea} material={mats.s} position-y={-0.05} renderOrder={1} />
      <mesh geometry={geo.parks} material={mats.p} position-y={0.02} renderOrder={2} />
      <mesh geometry={geo.fields} material={mats.f} position-y={0.03} renderOrder={3} />
      <mesh geometry={geo.roads} material={mats.r} renderOrder={5} />
      <Traffic pieces={geo.pieces} />
      <Marine coast={geo.coast} />
      <Railway tracks={geo.tracks} />
      <mesh geometry={geo.strips} material={mats.t} renderOrder={6} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.07} material={mats.plaza} renderOrder={4}>
        <ringGeometry args={[A + OUTER - 6, A + OUTER + 6, 96]} />
      </mesh>
      <mesh geometry={geo.buildings} material={mats.b} renderOrder={7} />
      <group ref={lampRef}>
        <points geometry={geo.lampGeo} material={lampMats.head} frustumCulled={false} />
      </group>
    </group>
  )
}
