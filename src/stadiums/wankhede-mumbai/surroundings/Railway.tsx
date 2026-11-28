import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  AdditiveBlending,
  PlaneGeometry,
  Group,
  SphereGeometry,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { glowTexture, live } from '../../shared/Environment'

type Pt = [number, number]

// ---------- track geometry ----------
const BED_W = 4.6

function ribbonUV(line: Pt[], w: number, y: number, pos: number[], rs: number[], ru: number[]) {
  const n = line.length
  let acc = 0
  const cum = [0]
  for (let i = 1; i < n; i++)
    cum.push((acc += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])))
  const side = line.map((_, i) => {
    const a = line[Math.max(0, i - 1)]
    const b = line[Math.min(n - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    return [(-dz / l) * (w / 2), (dx / l) * (w / 2)] as Pt
  })
  const v = (i: number, sgn: 1 | -1) => {
    pos.push(line[i][0] + side[i][0] * sgn, y, line[i][1] + side[i][1] * sgn)
    rs.push(cum[i])
    ru.push(sgn === 1 ? 0 : 1)
  }
  for (let i = 0; i < n - 1; i++) {
    v(i, 1)
    v(i + 1, 1)
    v(i, -1)
    v(i, -1)
    v(i + 1, 1)
    v(i + 1, -1)
  }
}

interface Chain {
  pts: Pt[]
  cum: number[]
  len: number
}

function toChain(pts: Pt[]): Chain {
  const cum = [0]
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return { pts, cum, len: cum[cum.length - 1] }
}

/**
 * Builds a train route through the network: starts from the unused north-south track nearest the stadium, then
 * extends it both ways, always taking the way that continues most straight at each junction.
 * dirZ = +1 runs south, -1 north.
 */
function walk(rails: Pt[][], dirZ: 1 | -1, used: Set<number>, rank = 0): Chain | null {
  const T = 6
  const orient = (i: number, rev: boolean) => (rev ? rails[i].slice().reverse() : rails[i])
  // seed: the rank-th nearest-to-stadium way that mostly runs north-south
  const cand: { i: number; d: number }[] = []
  rails.forEach((r, i) => {
    if (used.has(i) || r.length < 2) return
    const dz = Math.abs(r[r.length - 1][1] - r[0][1])
    const dx = Math.abs(r[r.length - 1][0] - r[0][0])
    if (dz < 60 || dz < dx) return
    cand.push({ i, d: Math.min(...r.map((q) => Math.hypot(q[0], q[1]))) })
  })
  cand.sort((a, b) => a.d - b.d)
  const seed = cand[rank]?.i ?? -1
  if (seed < 0) return null
  used.add(seed)
  const first = rails[seed]
  let route: Pt[] =
    (first[first.length - 1][1] - first[0][1]) * dirZ > 0 ? first.slice() : first.slice().reverse()

  const extend = (r: Pt[]) => {
    for (let guard = 0; guard < 200; guard++) {
      const end = r[r.length - 1]
      const back = r[Math.max(0, r.length - 3)]
      let hx = end[0] - back[0]
      let hz = end[1] - back[1]
      const hl = Math.hypot(hx, hz) || 1
      hx /= hl
      hz /= hl
      let pick: { i: number; rev: boolean } | null = null
      let bestDot = 0.4
      rails.forEach((w, i) => {
        if (used.has(i) || w.length < 2) return
        for (const rev of [false, true]) {
          const p = orient(i, rev)
          if (Math.hypot(p[0][0] - end[0], p[0][1] - end[1]) > T) continue
          const dx = p[1][0] - p[0][0]
          const dz = p[1][1] - p[0][1]
          const dot = (dx * hx + dz * hz) / (Math.hypot(dx, dz) || 1)
          if (dot > bestDot) {
            bestDot = dot
            pick = { i, rev }
          }
        }
      })
      if (!pick) break
      const pk = pick as { i: number; rev: boolean }
      used.add(pk.i)
      r.push(...orient(pk.i, pk.rev).slice(1))
    }
  }
  extend(route)
  route = route.reverse()
  extend(route)
  route = route.reverse()

  // keep the stretch inside the map that contains the stadium side of the line
  const inside = (q: Pt) => Math.hypot(q[0], q[1]) < 1000
  let c = 0
  route.forEach((q, i) => {
    if (Math.hypot(q[0], q[1]) < Math.hypot(route[c][0], route[c][1])) c = i
  })
  if (!inside(route[c])) return null
  let i0 = c
  let i1 = c
  while (i0 > 0 && inside(route[i0 - 1])) i0--
  while (i1 < route.length - 1 && inside(route[i1 + 1])) i1++
  const chain = toChain(route.slice(i0, i1 + 1))
  return chain.len > 300 ? chain : null
}

/** Position/heading at distance s along the line; beyond either end it carries on straight, so trains drive off cleanly. */
function sample(c: Chain, s: number) {
  const n = c.pts.length
  if (s <= 0 || s >= c.len) {
    const [a, b] = s <= 0 ? [c.pts[0], c.pts[1]] : [c.pts[n - 2], c.pts[n - 1]]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const hx = (b[0] - a[0]) / l
    const hz = (b[1] - a[1]) / l
    const e = s <= 0 ? c.pts[0] : c.pts[n - 1]
    const d = s <= 0 ? s : s - c.len
    return { x: e[0] + hx * d, z: e[1] + hz * d, hx, hz }
  }
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (c.cum[mid] <= s) lo = mid
    else hi = mid
  }
  const a = c.pts[lo]
  const b = c.pts[lo + 1]
  const sl = c.cum[lo + 1] - c.cum[lo] || 1
  const f = (s - c.cum[lo]) / sl
  return {
    x: a[0] + (b[0] - a[0]) * f,
    z: a[1] + (b[1] - a[1]) * f,
    hx: (b[0] - a[0]) / sl,
    hz: (b[1] - a[1]) / sl,
  }
}

// ---------- the two tracks beside the stadium ----------
export interface Tracks {
  /** southbound track (left-hand running: east of the centre line) */
  south: Pt[]
  /** northbound track, listed in travel direction */
  north: Pt[]
  base: Pt[]
}
const GAUGE_GAP = 4 // each track sits this far from the centre line
const MIN_R = 127 // centre line never closer to the stadium than this

function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]
    const dx = pts[i][0] - ax
    const dz = pts[i][1] - az
    const len = Math.hypot(dx, dz)
    for (let d = step - carry; d <= len; d += step)
      out.push([ax + (dx * d) / len, az + (dz * d) / len])
    carry = (carry + len) % step
  }
  return out
}

/** One southbound and one northbound track, following the real line but kept clear of the stands and the road. */
export function makeTracks(rails: Pt[][]): Tracks | null {
  // try several seed ways and keep the longest continuous line
  let chain: Chain | null = null
  for (let rank = 0; rank < 8; rank++) {
    const c = walk(rails, 1, new Set(), rank)
    if (c && (!chain || c.len > chain.len)) chain = c
  }
  if (!chain) return null
  let base = resample(chain.pts, 4).map(([x, z]) => {
    const r = Math.hypot(x, z) || 1
    return (r < MIN_R ? [(x * MIN_R) / r, (z * MIN_R) / r] : [x, z]) as Pt
  })
  for (let pass = 0; pass < 40; pass++)
    base = base.map((p, i) =>
      i === 0 || i === base.length - 1
        ? p
        : ([
            (base[i - 1][0] + 2 * p[0] + base[i + 1][0]) / 4,
            (base[i - 1][1] + 2 * p[1] + base[i + 1][1]) / 4,
          ] as Pt),
    )
  const off = (sgn: number) =>
    base.map((p, i) => {
      const a = base[Math.max(0, i - 1)]
      const b = base[Math.min(base.length - 1, i + 1)]
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const l = Math.hypot(dx, dz) || 1
      // southbound heading (dx, dz): its left is (dz, -dx) when viewed from above
      return [p[0] + (dz / l) * GAUGE_GAP * sgn, p[1] - (dx / l) * GAUGE_GAP * sgn] as Pt
    })
  const south = chain.pts[chain.pts.length - 1][1] >= chain.pts[0][1] ? off(1) : off(1).reverse()
  const north = (
    chain.pts[chain.pts.length - 1][1] >= chain.pts[0][1] ? off(-1) : off(-1).reverse()
  )
    .slice()
    .reverse()
  return { south, north, base }
}

// ---------- rolling stock: a 12-car suburban EMU (local +z is forward) ----------
const CARS = 12
const CAR_L = 20.4
const COUPLE = 1.0
function box(w: number, h: number, l: number, y: number, z: number, c: string) {
  const g = new BoxGeometry(w, h, l).translate(0, y, z).toNonIndexed()
  const col = new Color(c)
  g.setAttribute(
    'color',
    new Float32BufferAttribute(
      new Array(g.attributes.position.count).fill(0).flatMap(() => [col.r, col.g, col.b]),
      3,
    ),
  )
  return g
}
// bold livery so the train reads clearly from the overview: white body, pink skirt, light-pink band, light roof
const BODY = mergeGeometries([
  box(3.3, 3.8, CAR_L, 2.65, 0, '#f5f6f8'),
  box(3.34, 1.6, CAR_L - 0.06, 1.55, 0, '#f55aae'),
  box(3.34, 0.32, CAR_L - 0.06, 3.55, 0, '#ffd3e8'),
  box(2.8, 0.3, CAR_L - 1.4, 4.7, 0, '#c9ced6'),
  box(2.9, 0.7, CAR_L - 4, 0.6, 0, '#1b1d21'),
  box(1.3, 0.4, 1.8, 5.0, 3, '#4a4f58'),
])
const WINDOWS = box(3.37, 1.0, CAR_L - 1.4, 3.05, 0, '#ffffff')
const TRAIN_LEN = CARS * (CAR_L + COUPLE)
const PER_TRACK = 1

interface Train {
  chain: Chain
  s: number
  speed: number
  wait: number
}

export function Railway({ tracks }: { tracks: Tracks | null }) {
  const { bed, wires, poles, routes } = useMemo(() => {
    const pos: number[] = []
    const rs: number[] = []
    const ru: number[] = []
    const wire: number[] = []
    const pol: number[] = []
    if (tracks) {
      for (const r of [tracks.south, tracks.north]) {
        ribbonUV(r, BED_W, 0.1, pos, rs, ru)
        for (let i = 0; i < r.length - 1; i++)
          wire.push(r[i][0], 5.7, r[i][1], r[i + 1][0], 5.7, r[i + 1][1])
      }
      // overhead-line masts between the two tracks, every ~48 m
      let acc = 20
      const b = tracks.base
      for (let i = 0; i < b.length - 1; i++) {
        const len = Math.hypot(b[i + 1][0] - b[i][0], b[i + 1][1] - b[i][1])
        for (; acc < len; acc += 48)
          pol.push(
            b[i][0] + ((b[i + 1][0] - b[i][0]) * acc) / len,
            b[i][1] + ((b[i + 1][1] - b[i][1]) * acc) / len,
          )
        acc -= len
      }
    }
    const bed = new BufferGeometry()
    bed.setAttribute('position', new Float32BufferAttribute(pos, 3))
    bed.setAttribute('rs', new Float32BufferAttribute(rs, 1))
    bed.setAttribute('ru', new Float32BufferAttribute(ru, 1))
    bed.setAttribute(
      'normal',
      new Float32BufferAttribute(
        pos.map((_, i) => (i % 3 === 1 ? 1 : 0)),
        3,
      ),
    )
    const wires = new BufferGeometry()
    wires.setAttribute('position', new Float32BufferAttribute(wire, 3))
    return {
      bed,
      wires,
      poles: pol,
      routes: tracks ? [toChain(tracks.south), toChain(tracks.north)] : [],
    }
  }, [tracks])

  const mats = useMemo(() => {
    const bedMat = new MeshStandardMaterial({
      color: '#a39e93',
      roughness: 1,
      side: DoubleSide,
      depthWrite: false,
    })
    bedMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float rs;\nattribute float ru;\nvarying float vS;\nvarying float vU;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS = rs; vU = ru;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vS;\nvarying float vU;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float lat = (vU - 0.5) * ${BED_W.toFixed(2)};
            float fade = 1.0 - smoothstep(0.15, 0.5, fwidth(vS) / 0.68);
            float sleeper = step(abs(lat), 1.3) * step(fract(vS / 0.68), 0.4) * fade;
            float rail = step(abs(abs(lat) - 0.84), 0.075);
            float shoulder = smoothstep(1.7, 2.3, abs(lat));
            vec3 ballast = diffuseColor.rgb * (0.85 + 0.25 * fract(sin(floor(vS * 4.0) * 12.9898 + floor(lat * 4.0) * 78.233) * 43758.5));
            diffuseColor.rgb = mix(ballast, vec3(0.34, 0.26, 0.2), sleeper * 0.9);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.76, 0.8), rail);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.8, shoulder);
          }`,
        )
    }
    return {
      bed: bedMat,
      wire: new LineBasicMaterial({ color: '#2b2c31' }),
      pole: new MeshStandardMaterial({ color: '#6f7680', roughness: 0.6 }),
      body: new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 }),
      win: new MeshBasicMaterial({ color: '#2e2832' }),
      lamp: new MeshBasicMaterial({ color: '#7d828c' }),
      beam: new MeshBasicMaterial({
        map: glowTexture,
        color: '#fff1c2',
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
      glow: new PointsMaterial({
        map: glowTexture,
        size: 4,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        color: '#fff3c8',
      }),
    }
  }, [])

  const poleGeo = useMemo(() => new CylinderGeometry(0.14, 0.2, 6.6, 6).translate(0, 3.3, 0), [])
  const lightGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(6 * 2 * PER_TRACK), 3))
    return g
  }, [])
  const poleMesh = useRef<InstancedMesh>(null)
  const poleBuilt = useRef<InstancedMesh | null>(null)
  const bodyMesh = useRef<InstancedMesh>(null)
  const winMesh = useRef<InstancedMesh>(null)
  const lightPts = useRef<Points>(null)
  const lampGroups = useRef<(Group | null)[]>([])
  const lampGeo = useMemo(() => new SphereGeometry(0.28, 8, 6), [])
  // soft pool of light on the track ahead of the train (flat, fading out); visible at night only
  const beamGeo = useMemo(
    () => new PlaneGeometry(9, 34).rotateX(-Math.PI / 2).translate(0, -1.7, 17),
    [],
  )
  const dummy = useMemo(() => new Object3D(), [])

  // two trains, one per track, each re-launched after a short random pause
  const trains = useRef<Train[]>([])
  if (routes.length && trains.current.length !== routes.length * PER_TRACK) {
    trains.current = routes.flatMap((chain, i) =>
      Array.from({ length: PER_TRACK }, (_, k) => ({
        chain,
        s: -1,
        speed: 0,
        wait: 1 + i * 4 + k * 5,
      })),
    )
  }
  if (import.meta.env.DEV) (window as unknown as { __trains: unknown }).__trains = trains.current

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    if (poleMesh.current && poleBuilt.current !== poleMesh.current) {
      poleBuilt.current = poleMesh.current
      for (let k = 0; k < poles.length / 2; k++) {
        dummy.position.set(poles[k * 2], 0, poles[k * 2 + 1])
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        poleMesh.current.setMatrixAt(k, dummy.matrix)
      }
      poleMesh.current.instanceMatrix.needsUpdate = true
    }
    // headlamps only shine at night; by day they are dull lenses and the beam is invisible
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    mats.win.color.set('#2e2832').lerp(new Color('#ffe2a0'), night)
    mats.lamp.color.set('#7d828c').lerp(new Color('#fff6d6'), night)
    mats.beam.opacity = night * 0.55
    mats.glow.opacity = night
    if (lightPts.current) lightPts.current.visible = night > 0.02

    if (!bodyMesh.current || !winMesh.current) return
    const lp = lightGeo.attributes.position.array as Float32Array
    trains.current.forEach((t, slot) => {
      if (t.s < 0) {
        t.wait -= dt
        // launch only when the tail of the previous train on this track is well clear of the start
        const clear = trains.current.every(
          (o) => o === t || o.chain !== t.chain || o.s < 0 || o.s > TRAIN_LEN + 120,
        )
        if (t.wait <= 0 && clear) {
          t.s = 0
          t.speed = 24 + Math.random() * 10
        }
      } else {
        t.s += t.speed * dt
        if (t.s > t.chain.len + TRAIN_LEN + CAR_L) {
          t.s = -1
          t.wait = 3 + Math.random() * 9
        }
      }
      for (let c = 0; c < CARS; c++) {
        const idx = slot * CARS + c
        const sc = t.s - c * (CAR_L + COUPLE) - CAR_L / 2
        if (t.s < 0 || sc < -CAR_L || sc > t.chain.len + CAR_L) {
          dummy.position.set(0, -50, 0)
          dummy.scale.setScalar(0.001)
        } else {
          // each car spans two bogies, so it follows curves smoothly instead of snapping to the local tangent
          const f = sample(t.chain, sc + CAR_L * 0.34)
          const r = sample(t.chain, sc - CAR_L * 0.34)
          dummy.position.set((f.x + r.x) / 2, 0.2, (f.z + r.z) / 2)
          dummy.rotation.set(0, Math.atan2(f.x - r.x, f.z - r.z), 0)
          dummy.scale.setScalar(1)
        }
        dummy.updateMatrix()
        bodyMesh.current!.setMatrixAt(idx, dummy.matrix)
        winMesh.current!.setMatrixAt(idx, dummy.matrix)
      }
      // headlamps on the front of the leading car
      const g = lampGroups.current[slot]
      if (t.s >= 0 && t.s <= t.chain.len + 40) {
        const h = sample(t.chain, t.s)
        const b = sample(t.chain, t.s - 8)
        const dx = h.x - b.x
        const dz = h.z - b.z
        const l = Math.hypot(dx, dz) || 1
        if (g) {
          g.visible = true
          g.position.set(h.x, 0.2, h.z)
          g.rotation.y = Math.atan2(dx, dz)
        }
        const hx = dx / l
        const hz = dz / l
        lp.set(
          [
            h.x - hz * 0.9 + hx * 0.4,
            2.1,
            h.z + hx * 0.9 + hz * 0.4,
            h.x + hz * 0.9 + hx * 0.4,
            2.1,
            h.z - hx * 0.9 + hz * 0.4,
          ],
          slot * 6,
        )
      } else {
        if (g) g.visible = false
        lp.set([0, -50, 0, 0, -50, 0], slot * 6)
      }
    })
    lightGeo.attributes.position.needsUpdate = true
    bodyMesh.current.instanceMatrix.needsUpdate = true
    winMesh.current.instanceMatrix.needsUpdate = true
  })

  if (!tracks) return null
  const total = Math.max(1, routes.length) * PER_TRACK * CARS
  return (
    <group>
      <mesh geometry={bed} material={mats.bed} renderOrder={5} />
      <lineSegments geometry={wires} material={mats.wire} frustumCulled={false} />
      <instancedMesh
        ref={poleMesh}
        args={[poleGeo, mats.pole, Math.max(1, poles.length / 2)]}
        frustumCulled={false}
        raycast={() => {}}
      />
      <instancedMesh
        ref={bodyMesh}
        args={[BODY, mats.body, total]}
        frustumCulled={false}
        raycast={() => {}}
      />
      <instancedMesh
        ref={winMesh}
        args={[WINDOWS, mats.win, total]}
        frustumCulled={false}
        raycast={() => {}}
      />
      <points
        ref={lightPts}
        geometry={lightGeo}
        material={mats.glow}
        frustumCulled={false}
        raycast={() => {}}
      />
      {Array.from({ length: routes.length * PER_TRACK }, (_, i) => (
        <group key={i} ref={(g) => void (lampGroups.current[i] = g)} visible={false}>
          <mesh geometry={lampGeo} material={mats.lamp} position={[-0.9, 1.9, 0.15]} />
          <mesh geometry={lampGeo} material={mats.lamp} position={[0.9, 1.9, 0.15]} />
          <mesh
            geometry={beamGeo}
            material={mats.beam}
            position={[0, 1.9, 0.4]}
            frustumCulled={false}
            raycast={() => {}}
          />
        </group>
      ))}
    </group>
  )
}
