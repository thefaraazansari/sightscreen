import { Canvas } from '@react-three/fiber'
import { STANDS } from '../data/layout'
import { BlockPickers, StandLabels } from './Blocks'
import { City } from './City'
import { CameraRig } from './CameraRig'
import { Environment } from './Environment'
import { Fence } from './Fence'
import { Ground } from './Ground'
import { Players } from './Players'
import { StandView } from './Stand'

export default function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 6000, position: [0, 320, 380] }}
      gl={{ antialias: true }}
    >
      <Environment />
      <Ground />
      <Players />
      <Fence />
      <City />
      {STANDS.map((s) => (
        <StandView key={s.id} i={s.id} />
      ))}
      <BlockPickers />
      <StandLabels />
      <CameraRig />
    </Canvas>
  )
}
