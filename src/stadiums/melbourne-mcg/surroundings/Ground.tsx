import { useMemo } from 'react'
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, SRGBColorSpace } from 'three'
import { ptOnStand } from '../data/layout'

/** Boundary rope: metres inside the edge of the grass (negative = towards the pitch). */
export const ROPE_D = -3

/** Closed band between two offsets from the boundary, as a flat strip following the real outline. */
function band(d0: number, d1: number, y: number) {
  const pos: number[] = []
  const N = 360
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const b = ((i + 1) / N) * Math.PI * 2
    const [x0, z0] = ptOnStand(d0, a)
    const [x1, z1] = ptOnStand(d1, a)
    const [x2, z2] = ptOnStand(d0, b)
    const [x3, z3] = ptOnStand(d1, b)
    pos.push(x0, y, z0, x1, y, z1, x2, y, z2, x1, y, z1, x3, y, z3, x2, y, z2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return g
}

export function Ground() {
  const grass = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 16
    const g = c.getContext('2d')!
    const n = 20 // mowing stripes
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#2d8a39' : '#3fa04a'
      g.fillRect((i * 1024) / n, 0, 1024 / n, 16)
    }
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  const { turf, rope } = useMemo(() => {
    const pos: number[] = []
    const uv: number[] = []
    const N = 180
    const P = (t: number): [number, number] => ptOnStand(0, t)
    for (let i = 0; i < N; i++) {
      const [x0, z0] = P((i / N) * Math.PI * 2)
      const [x1, z1] = P(((i + 1) / N) * Math.PI * 2)
      pos.push(0, 0, 0, x0, 0, z0, x1, 0, z1)
      for (const [x] of [[0], [x0], [x1]]) uv.push(x / 190 + 0.5, 0.5)
    }
    const turf = new BufferGeometry()
    turf.setAttribute('position', new Float32BufferAttribute(pos, 3))
    turf.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    turf.computeVertexNormals()
    return { turf, rope: band(ROPE_D - 0.15, ROPE_D + 0.15, 0.03) }
  }, [])
  return (
    <group>
      <mesh geometry={turf}>
        <meshStandardMaterial map={grass} roughness={0.95} side={2} />
      </mesh>
      <mesh geometry={rope}>
        <meshBasicMaterial color="#ffffff" side={2} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[27.2, 27.5, 96]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
      </mesh>
      {/* the 22-yard pitch, running north-south, with creases and stumps */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
        <planeGeometry args={[3.05, 20.12]} />
        <meshStandardMaterial color="#c9b27c" roughness={1} />
      </mesh>
      {[-1, 1].map((e) => (
        <group key={e}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, e * 8.84]}>
            <planeGeometry args={[3.66, 0.06]} />
            <meshBasicMaterial color="#fff" />
          </mesh>
          {[-0.13, 0, 0.13].map((x) => (
            <mesh key={x} position={[x, 0.48, e * 10.06]}>
              <cylinderGeometry args={[0.036, 0.036, 0.96, 8]} />
              <meshStandardMaterial color="#f3ead2" />
            </mesh>
          ))}
          {[-0.065, 0.065].map((x) => (
            <mesh key={x} position={[x, 0.975, e * 10.06]}>
              <boxGeometry args={[0.13, 0.026, 0.04]} />
              <meshStandardMaterial color="#d9c48a" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
