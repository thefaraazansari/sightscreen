import { Canvas } from '@react-three/fiber'
import { STANDS } from './data/layout'
import { BlockPickers, StandLabels } from '../shared/Blocks'
import { City } from './surroundings/City'
import { CameraRig } from '../shared/CameraRig'
import { Environment } from '../shared/Environment'
import { Ground } from './surroundings/Ground'
import { Players } from '../shared/Players'
import { StandView } from '../shared/Stand'

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
