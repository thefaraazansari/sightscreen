import { useMemo } from 'react'
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry } from 'three'

/**
 * People in the middle: the fielding side (yellow kit), two batsmen (medium blue kit), two umpires (black).
 * Each figure is built from tapered limbs on joints, so it can stand, crouch, swing arms and hold a bat or ball.
 */
const SCALE = 1.3 // a little larger than life so they read from the overview camera
const SKIN = '#d9a06b'
const YELLOW = '#f2c200'
const BLUE = '#2f6fd6'
const BLACK = '#17171a'
const SHOE = '#1d1d22'

const mats: Record<string, MeshStandardMaterial> = {}
const mat = (c: string) => (mats[c] ??= new MeshStandardMaterial({ color: c, roughness: 0.85 }))

const THIGH = 0.46
const SHIN = 0.42
const thighG = new CylinderGeometry(0.095, 0.074, THIGH, 10).translate(0, -THIGH / 2, 0)
const shinG = new CylinderGeometry(0.07, 0.055, SHIN, 10).translate(0, -SHIN / 2, 0)
const shoeG = new BoxGeometry(0.1, 0.07, 0.27).translate(0, -0.03, 0.07)
const torsoG = new CylinderGeometry(0.205, 0.165, 0.6, 14).scale(1, 1, 0.68).translate(0, 0.3, 0)
const shoulderG = new SphereGeometry(0.095, 10, 8)
const upperArmG = new CylinderGeometry(0.062, 0.052, 0.3, 8).translate(0, -0.15, 0)
const foreArmG = new CylinderGeometry(0.047, 0.04, 0.28, 8).translate(0, -0.14, 0)
const handG = new SphereGeometry(0.052, 8, 6)
const neckG = new CylinderGeometry(0.048, 0.054, 0.09, 8)
const headG = new SphereGeometry(0.112, 14, 12).scale(1, 1.1, 1.02)
const domeG = new SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52)
const peakG = new BoxGeometry(0.17, 0.014, 0.1)
const brimG = new CylinderGeometry(0.19, 0.19, 0.012, 16)
const grilleG = new BoxGeometry(0.15, 0.012, 0.012)
const padG = new BoxGeometry(0.15, 0.5, 0.075)
const batBladeG = new BoxGeometry(0.11, 0.6, 0.04)
const batHandleG = new CylinderGeometry(0.02, 0.02, 0.3, 6)
const ballG = new SphereGeometry(0.075, 12, 10)

type Role = 'fielder' | 'keeper' | 'bowler' | 'striker' | 'nonstriker' | 'umpire'

interface PersonProps {
  /** ground position (x east, z south) */
  at: [number, number]
  /** point to face (x, z) */
  look: [number, number]
  kit: string
  /** hat colour; omitted = bare head */
  hat?: string
  trousers?: string
  role?: Role
}

function Person({ at, look, kit, hat = kit, trousers = kit, role = 'fielder' }: PersonProps) {
  const yaw = Math.atan2(look[0] - at[0], look[1] - at[1]) // local +z faces the look point
  // pose per role: lean forward, thigh raised forward, knee bent (shin swings back), arms swung forward, elbows bent
  const pose = {
    fielder: { lean: 0.2, thigh: 0.22, knee: 0.4, armL: 0.5, armR: 0.5, foreL: 0.7, foreR: 0.7 },
    keeper: { lean: 0.35, thigh: 1.0, knee: 1.5, armL: 0.9, armR: 0.9, foreL: 0.5, foreR: 0.5 },
    bowler: { lean: 0.1, thigh: 0.15, knee: 0.3, armL: 0.5, armR: 3.0, foreL: 0.5, foreR: 0.1 },
    // striker: hands together on the handle, bat grounded in front of the toes
    striker: { lean: 0.3, thigh: 0.2, knee: 0.36, armL: 0.62, armR: 0.62, foreL: 0.1, foreR: 0.1 },
    // non-striker: upright, bat held loosely in one hand with its toe on the ground, other arm bent
    nonstriker: { lean: 0.08, thigh: 0.05, knee: 0.1, armL: 0.12, armR: 0.35, foreL: 0.08, foreR: 0.6 },
    umpire: { lean: 0.03, thigh: 0.04, knee: 0.08, armL: 0.08, armR: 0.08, foreL: 0.1, foreR: 0.1 },
  }[role]
  // hip height so the feet stay on the ground whatever the leg bend
  const hip = THIGH * Math.cos(pose.thigh) + SHIN * Math.cos(pose.thigh - pose.knee)
  const isBat = role === 'striker' || role === 'nonstriker'
  return (
    <group position={[at[0], 0.04, at[1]]} rotation-y={yaw} scale={SCALE}>
      <group position={[0, hip, 0]}>
        {[-0.1, 0.1].map((x) => (
          <group key={x} position={[x, 0, 0]} rotation-x={-pose.thigh}>
            <mesh geometry={thighG} material={mat(trousers)} />
            <group position={[0, -THIGH, 0]} rotation-x={pose.knee}>
              <mesh geometry={shinG} material={mat(trousers)} />
              <group position={[0, -SHIN, 0]} rotation-x={pose.thigh - pose.knee}>
                <mesh geometry={shoeG} material={mat(SHOE)} />
                {isBat && <mesh geometry={padG} material={mat(kit)} position={[0, 0.3, 0.07]} />}
              </group>
            </group>
          </group>
        ))}
        {/* upper body leans forward from the hips */}
        <group rotation-x={pose.lean}>
          <mesh geometry={torsoG} material={mat(kit)} />
          <mesh geometry={neckG} material={mat(SKIN)} position={[0, 0.64, 0]} />
          <mesh geometry={headG} material={mat(SKIN)} position={[0, 0.78, 0.01]} />
          {isBat ? (
            <>
              {/* helmet with a grille */}
              <mesh geometry={domeG} material={mat(hat)} position={[0, 0.82, 0.005]} scale={1.06} />
              {[0, 0.035, 0.07].map((dy) => (
                <mesh key={dy} geometry={grilleG} material={mat('#c9ced6')} position={[0, 0.78 - dy, 0.125]} />
              ))}
            </>
          ) : role === 'umpire' ? (
            <>
              <mesh geometry={domeG} material={mat(hat)} position={[0, 0.82, 0]} />
              <mesh geometry={brimG} material={mat(hat)} position={[0, 0.835, 0]} />
            </>
          ) : role === 'bowler' ? (
            // bare head with short dark hair
            <mesh geometry={domeG} material={mat('#2a2118')} position={[0, 0.815, -0.005]} scale={[0.97, 0.95, 0.97]} />
          ) : (
            <>
              <mesh geometry={domeG} material={mat(hat)} position={[0, 0.82, 0]} />
              <mesh geometry={peakG} material={mat(hat)} position={[0, 0.83, 0.13]} rotation-x={0.12} />
            </>
          )}
          {/* arms: short sleeves in the shirt colour, bare forearms, hands (gloves for batsmen) */}
          {[-1, 1].map((side) => {
            const up = side === 1 ? pose.armR : pose.armL
            const fore = side === 1 ? pose.foreR : pose.foreL
            return (
              <group key={side} position={[side * 0.235, 0.52, 0]} rotation-x={-up} rotation-z={role === 'striker' ? (side === 1 ? -0.5 : 0.17) : side * 0.1}>
                <mesh geometry={shoulderG} material={mat(kit)} />
                <mesh geometry={upperArmG} material={mat(kit)} />
                <group position={[0, -0.3, 0]} rotation-x={-fore}>
                  <mesh geometry={foreArmG} material={mat(isBat ? kit : SKIN)} />
                  <mesh geometry={handG} material={mat(isBat ? kit : SKIN)} position={[0, -0.29, 0]} />
                  {role === 'bowler' && side === 1 && <mesh geometry={ballG} material={mat('#f4f4f2')} position={[0, -0.36, 0.02]} />}
                </group>
              </group>
            )
          })}
        </group>
      </group>
      {isBat && (
        // pivot at the grip: blade hangs below it and its toe rests on the ground
        <group position={role === 'striker' ? [-0.1, 0.8, 0.34] : [-0.27, 0.8, 0.07]} rotation-x={role === 'striker' ? 0.12 : 0.04}>
          <mesh geometry={batBladeG} material={mat('#e0bd7a')} position={[0, -0.45, 0]} />
          <mesh geometry={batHandleG} material={mat('#2a2a2a')} position={[0, 0, 0]} />
        </group>
      )}
    </group>
  )
}

export function Players() {
  const fielders = useMemo<[number, number][]>(
    () => [
      [3.2, 23], // first slip
      [5.4, 22], // second slip
      [26, 56], // third man
      [22, 9], // point
      [21, -12], // cover
      [9, -27], // mid-off
      [-10, -26], // mid-on
      [-24, -4], // mid-wicket
      [-18, 37], // fine leg
    ],
    [],
  )
  const striker: [number, number] = [0.05, 9.1]
  return (
    // the whole scene is turned half a circle so the bowling end is the opposite one
    <group rotation-y={Math.PI}>
      {fielders.map((p, i) => (
        <Person key={i} at={p} look={striker} kit={YELLOW} />
      ))}
      <Person at={[0.8, -9.5]} look={striker} kit={YELLOW} role="bowler" />
      <Person at={[0.3, 21.6]} look={striker} kit={YELLOW} role="keeper" />
      <Person at={striker} look={[0, -10]} kit={BLUE} role="striker" />
      <Person at={[-2.3, -9.4]} look={[0, 10]} kit={BLUE} role="nonstriker" />
      <Person at={[1.4, -12.6]} look={striker} kit={BLACK} hat={BLACK} trousers={BLACK} role="umpire" />
      <Person at={[-14, 9.5]} look={[0, 9.5]} kit={BLACK} hat={BLACK} trousers={BLACK} role="umpire" />
    </group>
  )
}
