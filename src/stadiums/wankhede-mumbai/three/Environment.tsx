import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MeshStandardMaterial,
  PointsMaterial,
  ShaderMaterial,
  SpotLight,
  MeshBasicMaterial,
  Vector3,
  BackSide,
  MathUtils,
} from 'three'
import { A, B } from '../data/layout'
import { TIMES, type TimePreset } from '../../../data/times'
import { useStadium } from '../../../store/useStadium'

/** Smoothly animated scene values, shared by lights, sky, ground and UI-facing highlight colour. */
const mk = (p: TimePreset) => ({
  skyTop: new Color(p.skyTop),
  horizon: new Color(p.horizon),
  sunDir: new Vector3(...p.sunDir).normalize(),
  sunColor: new Color(p.sunColor),
  sunIntensity: p.sunIntensity,
  sunGlow: p.sunGlow,
  hemiSky: new Color(p.hemiSky),
  hemiGround: new Color(p.hemiGround),
  hemiIntensity: p.hemiIntensity,
  fog: new Color(p.fog),
  ground: new Color(p.ground),
  flood: p.flood,
  stars: p.stars,
  exposure: p.exposure,
  highlight: new Color(p.highlight),
})
export const live = mk(TIMES[useStadium.getState().time])

const skyMaterial = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uTop: { value: live.skyTop },
    uHorizon: { value: live.horizon },
    uSunDir: { value: live.sunDir },
    uSunColor: { value: live.sunColor },
    uGlow: { value: live.sunGlow },
  },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    varying vec3 vP; uniform vec3 uTop,uHorizon,uSunDir,uSunColor; uniform float uGlow;
    void main(){
      float h = clamp(vP.y,0.0,1.0);
      vec3 c = mix(uHorizon,uTop,pow(h,0.5));
      float s = max(dot(normalize(vP),normalize(uSunDir)),0.0);
      c += uSunColor*(pow(s,6.0)*0.35 + pow(s,48.0)*0.6 + pow(s,900.0)*2.0)*max(uGlow,0.25);
      if(vP.y<0.0) c = mix(uHorizon,uHorizon*0.6,clamp(-vP.y*4.0,0.0,1.0));
      gl_FragColor = vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
})

const starPositions = (() => {
  const a = new Float32Array(900 * 3)
  for (let i = 0; i < 900; i++) {
    const u = Math.random()
    const v = 0.05 + Math.random() * 0.95
    const th = u * Math.PI * 2
    const r = Math.sqrt(1 - v * v)
    a.set([Math.cos(th) * r * 800, v * 800, Math.sin(th) * r * 800], i * 3)
  }
  return a
})()

export const glowTexture = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,248,225,1)')
  grad.addColorStop(0.25, 'rgba(255,240,200,0.55)')
  grad.addColorStop(1, 'rgba(255,230,180,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
})()

const TOWERS = [30, 90, 150, 210, 270, 330].map((deg) => {
  const t = (deg * Math.PI) / 180
  return {
    x: (A + 42) * Math.cos(t),
    z: (B + 42) * Math.sin(t),
    rotY: Math.atan2(-Math.cos(t), -Math.sin(t)),
  }
})
const TOWER_H = 46

const lampPanelTex = (() => {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#222'
  g.fillRect(0, 0, 128, 64)
  g.fillStyle = '#fff'
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 4; y++) {
      g.beginPath()
      g.arc(10 + x * 15.5, 10 + y * 15.5, 5, 0, 7)
      g.fill()
    }
  return new CanvasTexture(c)
})()

export function Environment() {
  const time = useStadium((s) => s.time)
  const target = useMemo(() => mk(TIMES[time]), [time])
  const { scene, gl } = useThree()
  const hemi = useRef<HemisphereLight>(null)
  const sun = useRef<DirectionalLight>(null)
  const starMat = useRef<PointsMaterial>(null)
  const groundMat = useRef<MeshStandardMaterial>(null)
  const fog = useMemo(() => new Fog(live.fog, 650, 2400), [])
  scene.fog = fog

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 2.2)
    live.skyTop.lerp(target.skyTop, k)
    live.horizon.lerp(target.horizon, k)
    live.sunDir.lerp(target.sunDir, k).normalize()
    live.sunColor.lerp(target.sunColor, k)
    live.hemiSky.lerp(target.hemiSky, k)
    live.hemiGround.lerp(target.hemiGround, k)
    live.fog.lerp(target.fog, k)
    live.ground.lerp(target.ground, k)
    live.highlight.lerp(target.highlight, k)
    live.sunIntensity = MathUtils.lerp(live.sunIntensity, target.sunIntensity, k)
    live.sunGlow = MathUtils.lerp(live.sunGlow, target.sunGlow, k)
    live.hemiIntensity = MathUtils.lerp(live.hemiIntensity, target.hemiIntensity, k)
    live.flood = MathUtils.lerp(live.flood, target.flood, k)
    live.stars = MathUtils.lerp(live.stars, target.stars, k)
    live.exposure = MathUtils.lerp(live.exposure, target.exposure, k)

    skyMaterial.uniforms.uGlow.value = live.sunGlow
    fog.color.copy(live.fog)
    gl.toneMappingExposure = live.exposure
    if (hemi.current) {
      hemi.current.color.copy(live.hemiSky)
      hemi.current.groundColor.copy(live.hemiGround)
      hemi.current.intensity = live.hemiIntensity
    }
    if (sun.current) {
      sun.current.color.copy(live.sunColor)
      sun.current.intensity = live.sunIntensity
      sun.current.position.copy(live.sunDir).multiplyScalar(400)
    }
    if (starMat.current) starMat.current.opacity = live.stars
    if (groundMat.current) groundMat.current.color.copy(live.ground)
  })

  return (
    <>
      <mesh material={skyMaterial} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[3600, 32, 16]} />
      </mesh>
      <points frustumCulled={false} scale={4}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={starMat}
          size={2}
          sizeAttenuation={false}
          transparent
          opacity={live.stars}
          depthWrite={false}
          fog={false}
          color="#fff"
        />
      </points>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={sun} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.2}>
        <circleGeometry args={[4500, 48]} />
        <meshStandardMaterial ref={groundMat} roughness={1} />
      </mesh>
      <Floodlights />
    </>
  )
}

function Floodlights() {
  const hide = useStadium((st) => st.mode === 'stand') // towers are out of the way in the stand view; their light stays
  const lights = useRef<(SpotLight | null)[]>([])
  const glows = useRef<(MeshBasicMaterial | null)[]>([])
  // only the face looking at the stadium carries the lamps; the back and sides are plain metal
  const panel = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#cfd5e0',
        emissive: '#fff2cf',
        emissiveMap: lampPanelTex,
      }),
    [],
  )
  const casing = useMemo(() => new MeshStandardMaterial({ color: '#6f7683', roughness: 0.7 }), [])
  const faces = useMemo(() => [casing, casing, casing, casing, panel, casing], [casing, panel])
  useFrame(() => {
    lights.current.forEach((l) => l && (l.intensity = live.flood * 1.05))
    const glow = Math.min(1, live.flood * 1.1 + live.sunGlow * 0.08)
    glows.current.forEach((g) => g && (g.opacity = glow))
    panel.emissiveIntensity = 0.15 + live.flood * 4
  })
  return (
    <>
      {TOWERS.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} rotation-y={t.rotY}>
          <mesh position-y={TOWER_H / 2} visible={!hide}>
            <cylinderGeometry args={[0.6, 1.1, TOWER_H, 8]} />
            <meshStandardMaterial color="#8a93a3" roughness={0.7} />
          </mesh>
          <mesh position={[0, TOWER_H + 2, 0.4]} material={faces} visible={!hide}>
            <boxGeometry args={[11, 6, 1]} />
          </mesh>
          {/* glow is a one-sided plane facing the stadium, so nothing shines out of the back */}
          <mesh position={[0, TOWER_H + 2, 1.6]} visible={!hide}>
            <planeGeometry args={[38, 38]} />
            <meshBasicMaterial
              ref={(m) => void (glows.current[i] = m)}
              map={glowTexture}
              blending={AdditiveBlending}
              transparent
              depthWrite={false}
              opacity={0}
              fog={false}
            />
          </mesh>
          <spotLight
            ref={(l) => void (lights.current[i] = l)}
            position={[0, TOWER_H + 2, 1]}
            color="#fff3d6"
            angle={0.5}
            distance={300}
            penumbra={0.8}
            decay={0}
            intensity={0}
          />
        </group>
      ))}
    </>
  )
}
