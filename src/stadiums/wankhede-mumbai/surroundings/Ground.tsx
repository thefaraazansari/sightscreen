import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { A, B } from '../data/layout'

/** Boundary rope sits a few metres inside the edge of the grass (fraction of the field radius). */
export const ROPE = 0.955

export function Ground() {
  const grass = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 16
    const g = c.getContext('2d')!
    const n = 16
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#2d8a39' : '#3fa04a'
      g.fillRect((i * 1024) / n, 0, 1024 / n, 16)
    }
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} scale={[A, B, 1]}>
        <circleGeometry args={[1, 96]} />
        <meshStandardMaterial map={grass} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} scale={[A, B, 1]}>
        <ringGeometry args={[ROPE, ROPE + 0.0038, 192]} />
        <meshBasicMaterial color="#ffffff" />
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
          {/* stumps and bails, scaled up with the players (about 1.3x life size) so they read properly */}
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
