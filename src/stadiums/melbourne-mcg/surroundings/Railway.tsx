import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointsMaterial,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { glowTexture, live } from '../../shared/Environment'

type Pt = [number, number]
interface Line {
  pts: Pt[]
  cum: number[]
  len: number
}
const CAR_L = 20
const GAP = 1
const CARS = 6
const TRAIN_L = CARS * (CAR_L + GAP)
/** empty track between one pass of a train and the next */
const GAP_LEN = 500

const toLine = (p: Pt[]): Line => {
  const cum = [0]
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]))
  return { pts: p, cum, len: cum[cum.length - 1] }
}

/** Position and heading at distance s along a line; past either end the line is extended straight on. */
function at(l: Line, s: number) {
  const n = l.pts.length
  let i = 0
  if (s > 0) {
    i = n - 2
    for (let k = 0; k < n - 1; k++)
      if (l.cum[k + 1] >= s) {
        i = k
        break
      }
  }
  const [x0, z0] = l.pts[i]
  const [x1, z1] = l.pts[i + 1]
  const sl = l.cum[i + 1] - l.cum[i] || 1
  const hx = (x1 - x0) / sl
  const hz = (z1 - z0) / sl
  const d = s - l.cum[i]
  return { x: x0 + hx * d, z: z0 + hz * d, hx, hz }
}

/** Metro trains running along the real railway lines near the ground, always the same way. */
export function Railway({ rails }: { rails: Pt[][] }) {
  const lines = useMemo(() => rails.map(toLine), [rails])
  // one train per line; neighbouring lines alternate the way the trains face, and they start at different points
  const trains = useMemo(
    () =>
      lines.flatMap((l, li) =>
        [0, 1].map((k) => ({
          l,
          flip: li % 2 === 1,
          speed: (28 + (li % 3) * 3) * 1.1,
          // two trains per line, half a cycle apart
          phase: (li * 0.37 + 0.2 + k * 0.5) * (l.len + TRAIN_L + GAP_LEN),
        })),
      ),
    [lines],
  )
  // a tunnel portal at both ends of every track: trains drive into it and come out of it, never fade in the open
  const portals = useMemo(
    () =>
      lines.flatMap((l) => {
        const n = l.pts.length
        const mk = (end: Pt, prev: Pt) => {
          const dx = end[0] - prev[0]
          const dz = end[1] - prev[1]
          const len = Math.hypot(dx, dz) || 1
          return { x: end[0], z: end[1], hx: dx / len, hz: dz / len }
        }
        return [mk(l.pts[0], l.pts[1]), mk(l.pts[n - 1], l.pts[n - 2])]
      }),
    [lines],
  )
  if (import.meta.env.DEV) (window as unknown as { __trainLines: number[] }).__trainLines = lines.map((l) => Math.round(l.len))
  const N = trains.length * CARS
  const body = useRef<InstancedMesh>(null)
  const win = useRef<InstancedMesh>(null)
  const geo = useMemo(() => {
    const b = new BoxGeometry(3.1, 3.4, CAR_L).translate(0, 2.4, 0)
    const stripe = new BoxGeometry(3.14, 0.7, CAR_L - 0.2).translate(0, 1.5, 0)
    return { b: mergeGeometries([b.toNonIndexed(), stripe.toNonIndexed()].map((g) => (g.deleteAttribute('uv'), g.deleteAttribute('normal'), g)))!, w: new BoxGeometry(3.2, 0.9, CAR_L - 1.4).translate(0, 3.2, 0) }
  }, [])
  const mats = useMemo(
    () => ({
      b: new MeshStandardMaterial({ color: '#e6ebf1', roughness: 0.5, metalness: 0.2 }),
      w: new MeshBasicMaterial({ color: '#2b3340' }),
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
    }),
    [],
  )
  // headlamps: two lenses, a soft pool of light ahead on the track and a glow point per lamp, at night only
  const lampGroups = useRef<(Group | null)[]>([])
  const lampGeo = useMemo(() => new SphereGeometry(0.28, 8, 6), [])
  const beamGeo = useMemo(() => new PlaneGeometry(9, 34).rotateX(-Math.PI / 2).translate(0, -1.7, 17), [])
  const lightGeo = useMemo(() => {
    const g = new BufferGeometry()
    // every slot starts far below the ground: unused slots left at (0,0,0) showed as a white glow in the middle of the pitch
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(6 * 16).fill(-50), 3))
    return g
  }, [])
  useLayoutEffect(() => {
    const c = new Color('#e6ebf1')
    for (let i = 0; i < N; i++) body.current?.setColorAt(i, c)
  }, [N])
  const o = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    mats.w.color.set('#2b3340').lerp(new Color('#ffd9a0'), night)
    mats.b.color.set('#e6ebf1').lerp(new Color('#5a6270'), night * 0.6)
    mats.lamp.color.set('#7d828c').lerp(new Color('#fff6d6'), night)
    mats.beam.opacity = night * 0.55
    mats.glow.opacity = night
    trains.forEach((tr, ti) => {
      // each train keeps going one way along its track, then comes round again after a long gap (so they are rare)
      const head = (tr.phase + tr.speed * t) % (tr.l.len + TRAIN_L + GAP_LEN)
      for (let k = 0; k < CARS; k++) {
        const along = head - k * (CAR_L + GAP) - CAR_L / 2
        const s = tr.flip ? tr.l.len - along : along
        const p = at(tr.l, s)
        o.position.set(p.x, 0.15, p.z)
        o.rotation.set(0, Math.atan2(p.hx, p.hz) + (tr.flip ? Math.PI : 0), 0)
        // a car is only hidden once it is wholly inside the tunnel portal at the end of the track
        o.scale.setScalar(along < -(CAR_L + 3) || along > tr.l.len + CAR_L + 3 ? 0 : 1)
        o.updateMatrix()
        body.current?.setMatrixAt(ti * CARS + k, o.matrix)
        win.current?.setMatrixAt(ti * CARS + k, o.matrix)
      }
      // headlamps on the front of the leading car, only while the train is on its track
      const g = lampGroups.current[ti]
      const lp = lightGeo.attributes.position.array as Float32Array
      if (g && head > 2 && head < tr.l.len - 2) {
        const sf = tr.flip ? tr.l.len - head : head
        const p = at(tr.l, sf)
        const hx = tr.flip ? -p.hx : p.hx
        const hz = tr.flip ? -p.hz : p.hz
        g.visible = true
        g.position.set(p.x, 0.2, p.z)
        g.rotation.y = Math.atan2(hx, hz)
        lp.set([p.x - hz * 0.9 + hx * 0.4, 2.1, p.z + hx * 0.9 + hz * 0.4, p.x + hz * 0.9 + hx * 0.4, 2.1, p.z - hx * 0.9 + hz * 0.4], ti * 6)
      } else {
        if (g) g.visible = false
        lp.set([0, -50, 0, 0, -50, 0], ti * 6)
      }
    })
    lightGeo.attributes.position.needsUpdate = true
    if (body.current) body.current.instanceMatrix.needsUpdate = true
    if (win.current) win.current.instanceMatrix.needsUpdate = true
  })
  if (!N) return null
  return (
    <group>
      <instancedMesh ref={body} args={[geo.b, mats.b, N]} frustumCulled={false} raycast={() => {}} />
      <instancedMesh ref={win} args={[geo.w, mats.w, N]} frustumCulled={false} raycast={() => {}} />
      <points geometry={lightGeo} material={mats.glow} frustumCulled={false} raycast={() => {}} />
      {portals.map((p, i) => (
        <group key={`p${i}`} position={[p.x, 0, p.z]} rotation-y={Math.atan2(p.hx, p.hz)}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 3.9, 3.9, 14]}>
              <boxGeometry args={[1.8, 7.8, 28]} />
              <meshStandardMaterial color="#8b8982" roughness={1} />
            </mesh>
          ))}
          <mesh position={[0, 7.1, 14]}>
            <boxGeometry args={[9.6, 1.6, 28]} />
            <meshStandardMaterial color="#a19f98" roughness={1} />
          </mesh>
          {/* the dark inside of the tunnel, 12 m in: trains disappear behind it */}
          <mesh position={[0, 3.2, 12]} rotation-y={Math.PI}>
            <planeGeometry args={[6.2, 6.4]} />
            <meshBasicMaterial color="#07080c" />
          </mesh>
        </group>
      ))}
      {trains.map((_, i) => (
        <group key={i} ref={(g) => void (lampGroups.current[i] = g)} visible={false}>
          <mesh geometry={lampGeo} material={mats.lamp} position={[-0.9, 1.9, 0.15]} />
          <mesh geometry={lampGeo} material={mats.lamp} position={[0.9, 1.9, 0.15]} />
          <mesh geometry={beamGeo} material={mats.beam} position={[0, 1.9, 0.4]} frustumCulled={false} raycast={() => {}} />
        </group>
      ))}
    </group>
  )
}
