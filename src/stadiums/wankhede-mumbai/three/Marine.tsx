import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  ShaderMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { at, pushK, seawardNormals, type P } from './coast'
import { live } from './Environment'

function ribbon(line: P[], widthOf: number | ((i: number) => number), y: number) {
  const pos: number[] = []
  const n = line.length
  const side = line.map((_, i) => {
    const a = line[Math.max(0, i - 1)]
    const b = line[Math.min(n - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    const width = typeof widthOf === 'number' ? widthOf : widthOf(i)
    return [(-dz / l) * (width / 2), (dx / l) * (width / 2)] as P
  })
  for (let i = 0; i < n - 1; i++) {
    const [l0, r0, l1, r1] = [
      [line[i][0] + side[i][0], line[i][1] + side[i][1]],
      [line[i][0] - side[i][0], line[i][1] - side[i][1]],
      [line[i + 1][0] + side[i + 1][0], line[i + 1][1] + side[i + 1][1]],
      [line[i + 1][0] - side[i + 1][0], line[i + 1][1] - side[i + 1][1]],
    ]
    for (const q of [l0, r0, l1, r0, r1, l1]) pos.push(q[0], y, q[1])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  return g
}

/** Strip between two offset lines of the coast: u = 0 on the inner (rock) edge to 1 offshore, s = distance along the coast. */
function waveStrip(inner: P[], outer: P[]) {
  const pos: number[] = []
  const u: number[] = []
  const sv: number[] = []
  let arc = 0
  const arcs = inner.map((p, i) => (i ? (arc += Math.hypot(p[0] - inner[i - 1][0], p[1] - inner[i - 1][1])) : 0))
  for (let i = 0; i < inner.length - 1; i++) {
    for (const [pt, k, f] of [
      [outer[i], i, 1],
      [inner[i], i, 0],
      [outer[i + 1], i + 1, 1],
      [inner[i], i, 0],
      [inner[i + 1], i + 1, 0],
      [outer[i + 1], i + 1, 1],
    ] as [P, number, number][]) {
      pos.push(pt[0], 0.1, pt[1])
      u.push(f)
      sv.push(arcs[k])
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('wu', new Float32BufferAttribute(u, 1))
  g.setAttribute('ws', new Float32BufferAttribute(sv, 1))
  return g
}

/** A real tetrapod: four tapered legs pointing to the corners of a tetrahedron, one leg up, three on the ground. */
function tetrapodGeometry() {
  const k = Math.sqrt(8 / 9)
  const dirs = [new Vector3(0, 1, 0), ...[0, 1, 2].map((i) => new Vector3(k * Math.cos((i * 2 * Math.PI) / 3), -1 / 3, k * Math.sin((i * 2 * Math.PI) / 3)))]
  const legs = dirs.map((d) => {
    const g = new CylinderGeometry(0.3, 0.52, 1.5, 7).translate(0, 0.75, 0) // thick at the hub, tapering outwards
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d))
    return g
  })
  return mergeGeometries(legs)
}

const waveNight = new Color('#6f7da0')
const rnd = (n: number) => {
  const x = Math.sin(n * 91.345) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Marine Drive: seawall promenade, tetrapod breakwater, palms and surf along the coast.
 * `coast` is the original (un-pushed) coastline; the sea itself is drawn pushed out by PUSH metres.
 */
export const PUSH = 14

export function Marine({ coast }: { coast: P[] }) {
  const data = useMemo(() => {
    // only the stretch around the stadium, as far as the sea is pushed out (see coast.pushedOut)
    const idx = coast.map((p, i) => (pushK(p) > 0 ? i : -1)).filter((i) => i >= 0)
    const chain = idx.map((i) => coast[i])
    const n = seawardNormals(coast)
    const nn = idx.map((i) => n[i])
    // densify the coast polyline to ~4 m
    const dense: { p: P; n: P; k: number }[] = []
    for (let i = 0; i < chain.length - 1; i++) {
      const len = Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1])
      const k = Math.max(1, Math.round(len / 4))
      for (let j = 0; j < k; j++) {
        const f = j / k
        dense.push({
          p: [chain[i][0] + (chain[i + 1][0] - chain[i][0]) * f, chain[i][1] + (chain[i + 1][1] - chain[i][1]) * f],
          n: [nn[i][0] + (nn[i + 1][0] - nn[i][0]) * f, nn[i][1] + (nn[i + 1][1] - nn[i][1]) * f],
          // how far the sea is pushed out here, interpolated along the coast exactly like the sea shape
          k: pushK(chain[i]) + (pushK(chain[i + 1]) - pushK(chain[i])) * f,
        })
      }
    }
    const pts = dense.map((d) => d.p)
    const nrm = dense.map((d) => d.n)
    // where the sea is pushed less (the far ends of the promenade) everything shrinks with it, so nothing ends up in the water or on the road
    const ks = dense.map((d) => d.k)
    const amount = (i: number) => PUSH * ks[i]
    const line = (off: (a: number, k: number) => number) => pts.map((_, i) => at(pts, nrm, i, off(amount(i), ks[i])))
    return {
      prom: ribbon(line((a, k) => a * 0.5 - k), (i) => Math.max(0.5, (PUSH - 4) * ks[i]), 0.09),
      wall: ribbon(line((a, k) => a - 1.2 * k), (i) => 1.6 * Math.max(0.3, ks[i]), 0.7),
      waves: waveStrip(line((a) => a + 5), line((a) => a + 38)),
      pts,
      nrm,
      ks,
    }
  }, [coast])

  const { tetraPos, palmPos } = useMemo(() => {
    const tetra: number[] = []
    const palm: number[] = []
    data.pts.forEach((_, i) => {
      const a = PUSH * data.ks[i]
      if (data.ks[i] < 0.15) return // the breakwater and palms fade out with the promenade
      // breakwater: rows of concrete tetrapods from the foot of the seawall out into the shallows
      for (const [row, base, big] of [[0, a + 0.9, 0.8], [1, a + 3.6, 1], [2, a + 6.8, 1.15], [3, a + 10, 1.25]] as const) {
        const [x, z] = at(data.pts, data.nrm, i, base + rnd(i * 3 + row) * 1.4)
        const sc = (1.25 + rnd(i * 13 + row) * 0.8) * big
        tetra.push(x + (rnd(i * 5 + row) - 0.5) * 1.5, 0.5 * sc + (rnd(i * 7 + row) > 0.78 ? sc * 0.8 : 0), z, rnd(i * 11 + row) * 6.28, rnd(i * 17 + row), sc)
      }
      // scattered ones tumbled further out in the water
      if (i % 2 === 0) {
        const [x, z] = at(data.pts, data.nrm, i, a + 13 + rnd(i * 19) * 11)
        const sc = 1.1 + rnd(i * 23) * 0.9
        tetra.push(x, 0.5 * sc - 0.2, z, rnd(i * 29) * 6.28, rnd(i * 31), sc)
      }
      if (i % 3 === 0) {
        const [x, z] = at(data.pts, data.nrm, i, a * 0.18)
        palm.push(x, z, rnd(i) * 6.28)
      }
    })
    return { tetraPos: tetra, palmPos: palm }
  }, [data])

  const geos = useMemo(
    () => ({
      tetra: tetrapodGeometry(),
      trunk: new CylinderGeometry(0.22, 0.34, 7.2, 5),
      crown: new SphereGeometry(2.6, 6, 4).scale(1, 0.42, 1),
    }),
    [],
  )

  const mats = useMemo(
    () => ({
      prom: new MeshStandardMaterial({ color: '#bdb6a6', roughness: 1, side: DoubleSide, depthWrite: false, emissive: '#ffb066', emissiveIntensity: 0 }),
      wall: new MeshStandardMaterial({ color: '#e6e0d2', roughness: 1, side: DoubleSide, depthWrite: false }),
      // swells that roll in from the open water and break on the tetrapods
      waves: new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uTone: { value: new Color('#ffffff') } },
        vertexShader: 'attribute float wu; attribute float ws; varying float vU; varying float vS; void main(){ vU = wu; vS = ws; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uTime; uniform vec3 uTone; varying float vU; varying float vS;
          void main() {
            float x = vU;
            float wob = sin(vS * 0.09 + uTime * 0.6) * 0.05 + sin(vS * 0.31 - uTime * 0.45) * 0.025;
            float ph = fract(x * 1.7 + wob + uTime * 0.15);
            float crest = exp(-ph * 5.0) * smoothstep(0.0, 0.04, ph);
            float body = smoothstep(1.0, 0.55, x) * smoothstep(0.0, 0.12, x + 0.04);
            float broken = 0.55 + 0.45 * sin(vS * 0.7 + floor(x * 1.7 + uTime * 0.15) * 3.1);
            float splash = (1.0 - smoothstep(0.0, 0.2, x)) * (0.45 + 0.35 * sin(uTime * 1.3 + vS * 0.23));
            float a = clamp(crest * body * broken * 1.35 + splash * 0.55, 0.0, 0.85);
            gl_FragColor = vec4(uTone, a);
          }`,
      }),
      tetra: new MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#b98a5e', emissiveIntensity: 0 }),
      trunk: new MeshStandardMaterial({ color: '#6b5640', roughness: 1 }),
      crown: new MeshStandardMaterial({ color: '#2f6a2f', roughness: 1, flatShading: true }),
    }),
    [],
  )

  const tetra = useRef<InstancedMesh>(null)
  const trunks = useRef<InstancedMesh>(null)
  const crowns = useRef<InstancedMesh>(null)
  // remember which mesh object we filled, so a remount (React StrictMode) refills the new one
  const built = useRef<InstancedMesh | null>(null)
  const dummy = useMemo(() => new Object3D(), [])

  useFrame(({ clock }) => {
    if (built.current !== tetra.current && tetra.current && trunks.current && crowns.current) {
      built.current = tetra.current
      const tint = new Color()
      for (let k = 0; k < tetraPos.length / 6; k++) {
        const o = k * 6
        dummy.position.set(tetraPos[o], tetraPos[o + 1], tetraPos[o + 2])
        dummy.rotation.set((tetraPos[o + 4] - 0.5) * 0.5, tetraPos[o + 3], (tetraPos[o + 4] * 7 - 3.5) * 0.14)
        dummy.scale.setScalar(tetraPos[o + 5])
        dummy.updateMatrix()
        tetra.current.setMatrixAt(k, dummy.matrix)
        const g = 0.3 + rnd(k * 3.1) * 0.12 // weathered concrete
        tetra.current.setColorAt(k, tint.setRGB(g, g * 0.97, g * 0.92))
      }
      tetra.current.instanceColor!.needsUpdate = true
      tetra.current.instanceMatrix.needsUpdate = true
      for (let k = 0; k < palmPos.length / 3; k++) {
        const o = k * 3
        dummy.rotation.set(0, palmPos[o + 2], 0)
        dummy.scale.setScalar(0.85 + rnd(k) * 0.4)
        dummy.position.set(palmPos[o], 3.6 * dummy.scale.x, palmPos[o + 1])
        dummy.updateMatrix()
        trunks.current.setMatrixAt(k, dummy.matrix)
        dummy.position.set(palmPos[o], 7.6 * dummy.scale.x, palmPos[o + 1])
        dummy.updateMatrix()
        crowns.current.setMatrixAt(k, dummy.matrix)
      }
      trunks.current.instanceMatrix.needsUpdate = true
      crowns.current.instanceMatrix.needsUpdate = true
    }
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    mats.prom.emissiveIntensity = night * 0.13
    // lit by the sea-front lamps, so the shoreline stays readable at night
    mats.tetra.emissiveIntensity = night * 0.16
    mats.waves.uniforms.uTime.value = clock.elapsedTime
    mats.waves.uniforms.uTone.value.set('#ffffff').lerp(waveNight, night)
  })

  return (
    <group>
      <mesh geometry={data.prom} material={mats.prom} renderOrder={5} />
      <mesh geometry={data.wall} material={mats.wall} renderOrder={5} />
      <mesh geometry={data.waves} material={mats.waves} renderOrder={6} frustumCulled={false} />
      <instancedMesh ref={tetra} args={[geos.tetra, mats.tetra, tetraPos.length / 6]} frustumCulled={false} raycast={() => {}} />
      <instancedMesh ref={trunks} args={[geos.trunk, mats.trunk, palmPos.length / 3]} frustumCulled={false} raycast={() => {}} />
      <instancedMesh ref={crowns} args={[geos.crown, mats.crown, palmPos.length / 3]} frustumCulled={false} raycast={() => {}} />
    </group>
  )
}
