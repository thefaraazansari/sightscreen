import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace } from 'three'
import { A, B } from '../data/layout'
import { live } from './Environment'
import { ROPE } from './Ground'

/** Boundary safety cage: posts, a top rail and wire mesh running around the edge of the ground, between it and the stands. */
const OFFSET = 1.0 // metres outside the boundary rope
const HEIGHT = 2.8
const SEGS = 360
const MESH = 0.5 // metres per mesh tile (small tiles = a dense wire mesh)

function meshTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.strokeStyle = '#ffffff'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(0, 0) // diamond (chain-link) pattern
  g.lineTo(64, 64)
  g.moveTo(64, 0)
  g.lineTo(0, 64)
  g.stroke()
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

const point = (t: number, off: number): [number, number] => [(A + off) * Math.cos(t), (B + off) * Math.sin(t)]

/** Triangular foam boundary cushions: a low sloping wedge facing the field, about 1.5 m long. */
function wedgeGeometry() {
  const L = 0.6
  const inner: [number, number] = [0.19, 0] // (z, y): low edge toward the field
  const outerLow: [number, number] = [-0.19, 0]
  const outerTop: [number, number] = [-0.19, 0.18]
  const v: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c)
  const P = (x: number, p: [number, number]) => [x, p[1], p[0]]
  tri(P(-L, inner), P(-L, outerTop), P(-L, outerLow)) // end caps
  tri(P(L, inner), P(L, outerLow), P(L, outerTop))
  // slope, back and underside
  tri(P(-L, inner), P(L, inner), P(L, outerTop))
  tri(P(-L, inner), P(L, outerTop), P(-L, outerTop))
  tri(P(-L, outerTop), P(L, outerTop), P(L, outerLow))
  tri(P(-L, outerTop), P(L, outerLow), P(-L, outerLow))
  tri(P(-L, inner), P(L, outerLow), P(L, inner))
  tri(P(-L, inner), P(-L, outerLow), P(L, outerLow))
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return g
}

function Cushions() {
  const ref = useRef<InstancedMesh>(null)
  const geo = useMemo(wedgeGeometry, [])
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#bcd8f2', roughness: 0.9, side: DoubleSide }), [])
  const N = 330
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new Object3D()
    for (let k = 0; k < N; k++) {
      const t = (k / N) * Math.PI * 2
      // just outside the rope, wedge sloping down toward the field
      o.position.set((A * ROPE + 0.19) * Math.cos(t), 0.04, (B * ROPE + 0.19) * Math.sin(t))
      o.lookAt(0, 0.04, 0)
      o.updateMatrix()
      m.setMatrixAt(k, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} raycast={() => {}} />
}

export function Fence() {
  const { net, rail, posts } = useMemo(() => {
    const pos: number[] = []
    const uv: number[] = []
    const railPos: number[] = []
    const postXZ: number[] = []
    let arc = 0
    let prev = point(0, OFFSET)
    for (let j = 0; j < SEGS; j++) {
      const a = point((j / SEGS) * Math.PI * 2, OFFSET)
      const b = point(((j + 1) / SEGS) * Math.PI * 2, OFFSET)
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const u0 = arc / MESH
      const u1 = (arc + len) / MESH
      const v1 = HEIGHT / MESH
      pos.push(a[0], 0.05, a[1], b[0], 0.05, b[1], b[0], HEIGHT, b[1], a[0], 0.05, a[1], b[0], HEIGHT, b[1], a[0], HEIGHT, a[1])
      uv.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1)
      // top rail: a thin band along the upper edge
      railPos.push(a[0], HEIGHT - 0.04, a[1], b[0], HEIGHT - 0.04, b[1], b[0], HEIGHT + 0.05, b[1], a[0], HEIGHT - 0.04, a[1], b[0], HEIGHT + 0.05, b[1], a[0], HEIGHT + 0.05, a[1])
      arc += len
      if (j % 4 === 0) postXZ.push(a[0], a[1])
      prev = b
    }
    void prev
    const net = new BufferGeometry()
    net.setAttribute('position', new Float32BufferAttribute(pos, 3))
    net.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    const rail = new BufferGeometry()
    rail.setAttribute('position', new Float32BufferAttribute(railPos, 3))
    return { net, rail, posts: postXZ }
  }, [])

  const mats = useMemo(
    () => ({
      net: new MeshBasicMaterial({ map: meshTexture(), transparent: true, alphaTest: 0.4, side: DoubleSide, depthWrite: false, color: '#dfe3ea' }),
      rail: new MeshBasicMaterial({ color: '#9aa1ad', side: DoubleSide }),
      post: new MeshStandardMaterial({ color: '#8d95a3', roughness: 0.6, metalness: 0.2 }),
    }),
    [],
  )
  const postGeo = useMemo(() => new CylinderGeometry(0.06, 0.06, HEIGHT + 0.1, 6).translate(0, (HEIGHT + 0.1) / 2, 0), [])
  const postMesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = postMesh.current
    if (!m) return
    const o = new Object3D()
    for (let k = 0; k < posts.length / 2; k++) {
      o.position.set(posts[k * 2], 0, posts[k * 2 + 1])
      o.updateMatrix()
      m.setMatrixAt(k, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  // basic materials ignore lights, so tint them down after dark by hand
  useFrame(() => {
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    mats.net.color.set('#dfe3ea').lerp(new Color('#6b7382'), night * 0.75)
    mats.rail.color.set('#9aa1ad').lerp(new Color('#4d5460'), night * 0.75)
  })

  return (
    <group>
      <Cushions />
      <mesh geometry={net} material={mats.net} renderOrder={4} raycast={() => {}} />
      <mesh geometry={rail} material={mats.rail} raycast={() => {}} />
      <instancedMesh ref={postMesh} args={[postGeo, mats.post, posts.length / 2]} frustumCulled={false} raycast={() => {}} />
    </group>
  )
}
