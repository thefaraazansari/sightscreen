import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  SEATS,
  STANDS,
  buildMasts,
  buildRim,
  buildRoof,
  buildStrip,
  buildTerrace,
  levelsOf,
  STRIPS,
} from '../data/layout'
import { useStadium } from '../../../store/useStadium'
import { live } from './Environment'

// every seat in a stand takes that stand's colour (the dot next to its name); the selected seat is bright yellow
// (bright white for the yellow stand, so it still stands out)
const STAND_COLORS = STANDS.map((st) => new Color(st.color))
const STAND_HOVER = STAND_COLORS.map((c) =>
  c.clone().lerp(new Color('#ffffff'), 0.55).multiplyScalar(1.15),
)
const SELECTED_YELLOW = new Color('#ffd21a').multiplyScalar(1.9)
const SELECTED_WHITE = new Color('#ffffff').multiplyScalar(2.2)
const noRaycast = () => {}

/**
 * One-piece moulded plastic stadium seat: a reclined back panel that runs down to the step, with the seat pan folded
 * forward out of it. No legs or armrests. Profile is drawn in (forward z, height y) and extruded across the width.
 */
function seatShape() {
  const sh = new Shape()
  sh.moveTo(-0.22, 0) //   back panel, rear face, bottom
  sh.lineTo(-0.31, 0.82) // back panel top (reclined)
  sh.lineTo(-0.25, 0.82)
  sh.lineTo(-0.19, 0.34) // where back meets seat
  sh.lineTo(0.22, 0.32) //  seat pan, top, front edge
  sh.lineTo(0.24, 0.25)
  sh.lineTo(-0.16, 0.22) // underside of the pan, open beneath
  sh.lineTo(-0.17, 0)
  sh.closePath()
  return sh
}
function seatGeometry(rounded: boolean) {
  const g = new ExtrudeGeometry(
    seatShape(),
    rounded
      ? {
          depth: 0.38,
          bevelEnabled: true,
          bevelSize: 0.025,
          bevelThickness: 0.025,
          bevelSegments: 1,
        }
      : { depth: 0.44, bevelEnabled: false },
  )
  g.rotateY(-Math.PI / 2) // extrusion becomes the seat's width
  g.computeBoundingBox()
  const w = (g.boundingBox!.max.x + g.boundingBox!.min.x) / 2
  g.translate(-w, 0, 0)
  g.setAttribute(
    'color',
    new Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3),
  )
  if (!rounded) return g
  // thin dark crease across the seat at the bend between the sitting pan and the back support
  const crease = new BoxGeometry(0.4, 0.02, 0.02).translate(0, 0.356, -0.158).toNonIndexed()
  crease.setAttribute(
    'color',
    new Float32BufferAttribute(new Array(crease.attributes.position.count * 3).fill(0.12), 3),
  )
  return mergeGeometries([g, crease])
}
const seatHi = seatGeometry(true)
const seatLo = seatGeometry(false)

// Spectators sitting on booked seats (first-person view only).
const bodyGeo = new CylinderGeometry(0.17, 0.21, 0.5, 6).translate(0, 0.62, -0.06)
const headGeo = new SphereGeometry(0.11, 6, 5).translate(0, 1.02, -0.06)
const bodyMat = new MeshStandardMaterial({ roughness: 0.9 })
const headMat = new MeshStandardMaterial({ roughness: 0.8 })
const SHIRTS = [
  '#1e56c8',
  '#1e56c8',
  '#2e6fe0',
  '#1e56c8',
  '#ffffff',
  '#e8e8e8',
  '#f2c230',
  '#d63a3a',
  '#222a3a',
  '#2a9d5c',
].map((c) => new Color(c))
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'].map((c) => new Color(c))
const hash = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** Row of small, well-spaced Indian flags; `arc` is the strip length in metres. */
function flagTexture(arc: number) {
  const W = 2048
  const H = 256
  const STRIP_H = 2.8 // metres
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.clearRect(0, 0, W, H)
  const n = Math.max(3, Math.round(arc / 8)) // one flag about every 8 m, well spaced
  const cell = W / n
  const fh = H * 0.56 // flag height ≈ 1.5 m
  const fw = fh * 1.5 * ((arc / W) ** -1 / (STRIP_H / H) ** -1) // keep a 3:2 flag despite different px/metre on each axis
  const sx = (fw / fh) * (2 / 3) // horizontal squash that keeps the chakra round in the world
  for (let k = 0; k < n; k++) {
    const x = k * cell + (cell - fw) / 2
    const y = (H - fh) / 2
    const band = fh / 3
    g.fillStyle = '#ff9933' // India saffron, white and green
    g.fillRect(x, y, fw, band)
    g.fillStyle = '#ffffff'
    g.fillRect(x, y + band, fw, band)
    g.fillStyle = '#138808'
    g.fillRect(x, y + 2 * band, fw, band)
    // Ashoka chakra: navy wheel, 24 spokes, diameter three quarters of the white band
    const cx = x + fw / 2
    const cy = y + fh / 2
    const r = band * 0.375
    g.save()
    g.translate(cx, cy)
    g.scale(sx, 1)
    g.strokeStyle = '#000080'
    g.fillStyle = '#000080'
    g.lineWidth = r * 0.14
    g.beginPath()
    g.arc(0, 0, r, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.arc(0, 0, r * 0.17, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = r * 0.07
    g.lineCap = 'round'
    for (let s = 0; s < 24; s++) {
      const a = (s / 24) * Math.PI * 2
      g.beginPath()
      g.moveTo(Math.cos(a) * r * 0.17, Math.sin(a) * r * 0.17)
      g.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97)
      g.stroke()
      // small bead where each spoke meets the rim
      g.beginPath()
      g.arc(
        Math.cos(a + Math.PI / 24) * r * 0.9,
        Math.sin(a + Math.PI / 24) * r * 0.9,
        r * 0.045,
        0,
        Math.PI * 2,
      )
      g.fill()
    }
    g.restore()
    // soft folds of cloth across the flag
    const fold = g.createLinearGradient(x, 0, x + fw, 0)
    for (let q = 0; q <= 6; q++)
      fold.addColorStop(q / 6, q % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)')
    g.fillStyle = fold
    g.fillRect(x, y, fw, fh)
    g.strokeStyle = 'rgba(0,0,0,0.22)' // faint edge so the white band reads on light walls
    g.lineWidth = 2
    g.strokeRect(x, y, fw, fh)
  }
  const t = new CanvasTexture(c)
  t.anisotropy = 4
  return t
}

/** Stand name lettering for the lower wall strip. */
function nameTexture(name: string, accent: string) {
  const W = 2048
  const H = 108
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const text = name.toUpperCase().split('').join('\u200A')
  let size = H * 0.62
  g.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  const w = g.measureText(text).width
  if (w > W * 0.7) {
    size *= (W * 0.7) / w
    g.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#ffffff'
  g.fillText(text, W / 2, H / 2 + 2)
  const half = g.measureText(text).width / 2
  g.fillStyle = accent
  g.fillRect(W / 2 - half - 150, H / 2 - 5, 110, 10)
  g.fillRect(W / 2 + half + 40, H / 2 - 5, 110, 10)
  const t = new CanvasTexture(c)
  t.anisotropy = 4
  return t
}

function TierSeats({ i, tier, mat }: { i: number; tier: number; mat: MeshStandardMaterial }) {
  const set = SEATS[i]
  const start = set.tierStart[tier]
  const count = set.tierStart[tier + 1] - start
  const ref = useRef<InstancedMesh>(null)
  const seatMode = useStadium((s) => s.mode === 'seat')
  const visible = useStadium(
    (s) =>
      s.mode !== 'stand' ||
      (s.activeStand === i &&
        (s.activeTier === null || s.activeTier === tier) &&
        (s.activeBlock === null || s.activeBlock.tier === tier)),
  )
  // once a block is chosen only that block's seats remain (others are scaled away)
  const blockOnly = useStadium((s) =>
    s.mode === 'stand' && s.activeStand === i && s.activeBlock && s.activeBlock.tier === tier
      ? s.activeBlock.block
      : -1,
  )
  const detail = useStadium((s) => s.activeStand === i)
  const enabled = useStadium((s) => s.mode === 'stand' && visible && s.activeBlock !== null)
  const selected = useStadium((s) =>
    s.selectedSeat?.stand === i ? s.selectedSeat.index - start : -1,
  )
  const hovered = useStadium((s) => (s.hoveredSeat?.stand === i ? s.hoveredSeat.index - start : -1))

  const paint = (k: number, sel: number, hov: number) => {
    const c = seatMode
      ? STAND_COLORS[i]
      : k === sel
        ? i === 3
          ? SELECTED_WHITE
          : SELECTED_YELLOW
        : k === hov
          ? STAND_HOVER[i]
          : STAND_COLORS[i]
    ref.current!.setColorAt(k, c)
  }

  useLayoutEffect(() => {
    const m = ref.current!
    const o = new Object3D()
    for (let k = 0; k < count; k++) {
      const g = start + k
      o.position.set(set.x[g], set.y[g], set.z[g])
      o.rotation.y = set.rot[g]
      if (blockOnly < 0) o.scale.set(1, 1, 1)
      else if (set.block[g] !== blockOnly) o.scale.setScalar(0.0001)
      else o.scale.set(1.04, 1.3, 1.2) // a bit larger in the zoomed block view; still clear of the neighbours
      o.updateMatrix()
      m.setMatrixAt(k, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [set, start, count, blockOnly])

  useLayoutEffect(() => {
    for (let k = 0; k < count; k++) paint(k, selected, hovered)
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatMode, count])

  const prev = useRef<number[]>([])
  useLayoutEffect(() => {
    for (const k of [...prev.current, selected, hovered])
      if (k >= 0 && k < count) paint(k, selected, hovered)
    prev.current = [selected, hovered]
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hovered])

  if (count === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[seatHi, mat, count]}
      geometry={detail || seatMode ? seatHi : seatLo}
      visible={visible}
      raycast={enabled ? InstancedMesh.prototype.raycast : noRaycast}
      onPointerMove={(e) => {
        if (e.instanceId === undefined) return
        e.stopPropagation()
        useStadium.getState().hoverSeat({ stand: i, index: start + e.instanceId })
      }}
      onPointerOut={() => useStadium.getState().hoverSeat(null)}
      onClick={(e) => {
        if (e.delta > 4 || e.instanceId === undefined) return
        e.stopPropagation()
        useStadium.getState().selectSeat({ stand: i, index: start + e.instanceId })
        useStadium.getState().enterSeat() // straight into the spectator view
      }}
    />
  )
}

function Crowd({ i, tier }: { i: number; tier: number }) {
  const set = SEATS[i]
  const seatMode = useStadium((s) => s.mode === 'seat')
  const picked = useStadium((st) => (st.selectedSeat?.stand === i ? st.selectedSeat.index : -1))
  const body = useRef<InstancedMesh>(null)
  const head = useRef<InstancedMesh>(null)
  const idx = useMemo(() => {
    const out: number[] = []
    for (let g = set.tierStart[tier]; g < set.tierStart[tier + 1]; g++)
      if (hash(i * 7919 + g * 31) < 0.62) out.push(g)
    return out
  }, [set, tier])
  useLayoutEffect(() => {
    if (!seatMode || !body.current || !head.current) return
    const o = new Object3D()
    idx.forEach((g, k) => {
      const h = hash(i * 100003 + g)
      o.position.set(set.x[g], set.y[g], set.z[g])
      o.rotation.y = set.rot[g]
      if (g === picked)
        o.scale.setScalar(0.0001) // nobody sits in your own seat
      else o.scale.set(1, 0.92 + h * 0.2, 1)
      o.updateMatrix()
      body.current!.setMatrixAt(k, o.matrix)
      head.current!.setMatrixAt(k, o.matrix)
      body.current!.setColorAt(k, SHIRTS[Math.floor(hash(g * 7 + i) * SHIRTS.length)])
      head.current!.setColorAt(k, SKIN[Math.floor(hash(g * 13 + i) * SKIN.length)])
    })
    for (const m of [body.current, head.current]) {
      m.instanceMatrix.needsUpdate = true
      m.instanceColor!.needsUpdate = true
    }
  }, [seatMode, idx, i, set, picked])
  if (!idx.length) return null
  return (
    <group visible={seatMode}>
      <instancedMesh ref={body} args={[bodyGeo, bodyMat, idx.length]} raycast={noRaycast} />
      <instancedMesh ref={head} args={[headGeo, headMat, idx.length]} raycast={noRaycast} />
    </group>
  )
}

/** Seats keep a soft self-lit glow after dark so the colours stay readable, without getting too bright. */
function seatMaterial() {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = { value: 0 }
    sh.uniforms.uDim = { value: 1 }
    sh.uniforms.uDull = { value: 0 }
    m.userData.sh = sh
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uGlow;\nuniform float uDim;\nuniform float uDull;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\nfloat lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), uDull) * uDim;\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;',
      )
  }
  return m
}

export function StandView({ i }: { i: number }) {
  const stand = STANDS[i]
  const terrace = useMemo(() => buildTerrace(stand), [stand])
  const roof = useMemo(() => (stand.roof ? buildRoof(stand) : null), [stand])
  const rim = useMemo(() => (stand.roof ? buildRim(stand) : null), [stand])
  const strips = useMemo(() => [buildStrip(stand, 0), buildStrip(stand, 1)], [stand])
  // strip 0 is the lower banner (between levels 1 and 2): the stand's name; strip 1 is the top banner: flags
  const labelMats = useMemo(() => {
    const opts = {
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }
    return [
      new MeshBasicMaterial({ map: nameTexture(stand.name, stand.color), ...opts }),
      new MeshBasicMaterial({
        map: flagTexture((((stand.t1 - stand.t0) * Math.PI) / 180) * (70 + STRIPS[1].d)),
        toneMapped: false,
        ...opts,
      }),
    ]
  }, [stand])
  const masts = useMemo(() => (stand.roof ? buildMasts(stand) : null), [stand])
  const mats = useMemo(
    () => ({
      terrace: new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.9 }),
      seat: seatMaterial(),
      roof: new MeshStandardMaterial({
        vertexColors: true,
        side: DoubleSide,
        transparent: true,
        roughness: 0.7,
      }),
      rim: new MeshStandardMaterial({
        color: '#d8d4c8',
        emissive: '#ffe9b8',
        emissiveIntensity: 0,
      }),
      mast: new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }),
    }),
    [],
  )
  const group = useRef<Group>(null)
  const seats = useRef<Group>(null)
  const v = useRef({ t: 1, hl: 0 })

  useFrame((_, dt) => {
    const st = useStadium.getState()
    const dim = st.mode === 'stand' && st.activeStand !== i
    const hov = st.mode === 'overview' && st.hoveredStand === i
    const k = 1 - Math.exp(-dt * 7)
    const a = v.current
    a.t = MathUtils.lerp(a.t, dim ? 0 : 1, k)
    a.hl = MathUtils.lerp(a.hl, hov ? 1 : 0, k)
    for (const m of [mats.terrace, mats.seat]) {
      m.opacity = a.t
      m.transparent = a.t < 0.99
      m.depthWrite = a.t > 0.5
    }
    for (const m of labelMats) m.opacity = a.t
    const night = Math.min(1, Math.max(0, (live.flood - 0.1) / 0.5))
    const sh = mats.seat.userData.sh
    if (sh) {
      // after dark the seats stay readable but softer: a little glow, slightly dimmer and duller
      sh.uniforms.uGlow.value = night * 0.2
      sh.uniforms.uDim.value = 1 - night * 0.25
      sh.uniforms.uDull.value = night * 0.3
    }
    mats.terrace.emissive.copy(live.highlight)
    mats.terrace.emissiveIntensity = a.hl * 0.22
    mats.seat.emissive.copy(live.highlight)
    mats.seat.emissiveIntensity = a.hl * 0.12
    // roofs are solid fabric; hover softens them a little, and they fade away in the stand view
    const roofTarget = st.mode === 'stand' ? 0 : hov ? 0.6 : 1 // no roof or masts while you are looking at the seats of a stand
    mats.roof.opacity = MathUtils.lerp(mats.roof.opacity, roofTarget, k)
    mats.roof.transparent = mats.roof.opacity < 0.99
    mats.roof.depthWrite = mats.roof.opacity > 0.5
    mats.roof.visible = mats.roof.opacity > 0.02
    mats.mast.visible = mats.rim.visible = st.mode !== 'stand'
    mats.rim.emissiveIntensity = 0.05 + live.flood * 3
    if (group.current) {
      group.current.visible = a.t > 0.02
      group.current.position.y = a.hl * 0.35
    }
    if (seats.current) seats.current.visible = a.t > 0.02
  })

  return (
    <>
      <group ref={group}>
        <mesh
          geometry={terrace}
          material={mats.terrace}
          onPointerOver={(e) => {
            if (useStadium.getState().mode !== 'overview') return
            e.stopPropagation()
            useStadium.getState().hoverStand(i)
          }}
          onPointerOut={() => {
            const st = useStadium.getState()
            if (st.hoveredStand === i) st.hoverStand(null)
          }}
          onClick={(e) => {
            if (useStadium.getState().mode !== 'overview' || e.delta > 4) return
            e.stopPropagation()
            useStadium.getState().focusStand(i)
          }}
        />
        {strips.map((g, k) => (
          <mesh key={k} geometry={g} material={labelMats[k]} renderOrder={3} />
        ))}
        {masts && <mesh geometry={masts} material={mats.mast} />}
        <group ref={seats}>
          {levelsOf(stand).map((t) => (
            <TierSeats key={t} i={i} tier={t} mat={mats.seat} />
          ))}
          {levelsOf(stand).map((t) => (
            <Crowd key={t} i={i} tier={t} />
          ))}
        </group>
      </group>
      {roof && <mesh geometry={roof} material={mats.roof} />}
      {rim && <mesh geometry={rim} material={mats.rim} />}
    </>
  )
}
