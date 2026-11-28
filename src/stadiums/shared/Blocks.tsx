import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  CanvasTexture,
  DoubleSide,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import {
  STANDS,
  TIER_NAMES,
  blockName,
  blockSurface,
  buildBlockPatch,
  levelAnchor,
  levelsOf,
} from '../current'
import { useStadium } from '../../store/useStadium'

/** One whole block on one floor: hover lights up the entire block, click zooms in on it. */
function BlockPatch({ stand, tier, block }: { stand: number; tier: number; block: number }) {
  const geo = useMemo(() => buildBlockPatch(STANDS[stand], tier, block), [stand, tier, block])
  const mat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: '#ffd54a',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  )
  const o = useRef(0)
  useFrame((_, dt) => {
    const h = useStadium.getState().hoveredBlock
    o.current = MathUtils.lerp(
      o.current,
      h && h.tier === tier && h.block === block ? 0.34 : 0,
      1 - Math.exp(-dt * 14),
    )
    mat.opacity = o.current
  })
  return (
    <mesh
      geometry={geo}
      material={mat}
      renderOrder={6}
      onPointerOver={(e) => {
        e.stopPropagation()
        useStadium.getState().hoverBlock({ tier, block })
      }}
      onPointerOut={() => {
        const h = useStadium.getState().hoveredBlock
        if (h && h.tier === tier && h.block === block) useStadium.getState().hoverBlock(null)
      }}
      onClick={(e) => {
        if (e.delta > 4) return
        e.stopPropagation()
        useStadium.getState().selectBlock({ tier, block })
      }}
    />
  )
}

/** Pickable blocks for the open stand (all floors, or just the chosen one) until a block is chosen. */
export function BlockPickers() {
  const stand = useStadium((s) =>
    s.mode === 'stand' && s.activeBlock === null ? s.activeStand : null,
  )
  const tier = useStadium((s) => s.activeTier)
  if (stand === null) return null
  const s = STANDS[stand]
  const tiers = tier === null ? levelsOf(s) : [tier]
  return (
    <>
      {tiers.flatMap((t) =>
        Array.from({ length: s.blocks }, (_, b) => (
          <BlockPatch key={`${stand}-${t}-${b}`} stand={stand} tier={t} block={b} />
        )),
      )}
    </>
  )
}

const pill =
  'level-pill pointer-events-none select-none whitespace-nowrap rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold text-white shadow-md backdrop-blur-sm'

const LETTER = 7 // metres
const letterGeo = new PlaneGeometry(1, 1)
const letterMats = new Map<string, MeshStandardMaterial>()
const FONT = "700 200px 'Montserrat', system-ui, sans-serif"

/** Block letter as if painted on the seats: cream paint, lit by the scene like the seats themselves. */
function letterMat(ch: string) {
  let m = letterMats.get(ch)
  if (!m) {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const t = new CanvasTexture(c)
    t.anisotropy = 8
    const draw = () => {
      const g = c.getContext('2d')!
      g.clearRect(0, 0, 256, 256)
      g.font = FONT
      g.textAlign = 'center'
      g.textBaseline = 'alphabetic'
      const b = g.measureText(ch)
      // centre the glyph's own bounds, not its line box
      const x = 128 + (b.actualBoundingBoxLeft - b.actualBoundingBoxRight) / 2
      const y = 128 + (b.actualBoundingBoxAscent - b.actualBoundingBoxDescent) / 2
      g.fillStyle = '#fbf7ea'
      g.fillText(ch, x, y)
      t.needsUpdate = true
    }
    draw()
    void document.fonts.load(FONT).then(draw) // redraw once the font is in
    // a touch of self-light keeps it readable at night; mostly it takes light and shade like the seats
    m = new MeshStandardMaterial({
      map: t,
      emissiveMap: t,
      emissive: '#ffffff',
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.82,
      roughness: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    letterMats.set(ch, m)
  }
  return m
}

function BlockLetter({ stand, tier, block }: { stand: number; tier: number; block: number }) {
  const { pos, mat } = useMemo(() => {
    const f = blockSurface(stand, tier, block)
    const m = new Matrix4()
      .makeBasis(new Vector3(...f.x), new Vector3(...f.s), new Vector3(...f.n))
      .setPosition(...f.p)
      .multiply(new Matrix4().makeScale(LETTER, LETTER, 1))
    return { pos: m, mat: letterMat(blockName(block, stand)) }
  }, [stand, tier, block])
  return (
    <mesh
      geometry={letterGeo}
      material={mat}
      matrix={pos}
      matrixAutoUpdate={false}
      renderOrder={5}
      raycast={() => {}}
    />
  )
}

/** Floor names beside the start of the stand and block letters printed on the seats; shown only in the stand view. */
export function StandLabels() {
  const stand = useStadium((s) =>
    s.mode === 'stand' && s.activeBlock === null ? s.activeStand : null,
  )
  const tier = useStadium((s) => s.activeTier)
  if (stand === null) return null
  const s = STANDS[stand]
  const tiers = tier === null ? levelsOf(s) : [tier]
  return (
    <>
      {tiers.map((t) => (
        // z-index 0 keeps the pills underneath the cards
        <Html key={`l${t}`} position={levelAnchor(stand, t)} center zIndexRange={[0, 0]}>
          <div className={pill}>{TIER_NAMES[t]}</div>
        </Html>
      ))}
      {tiers.flatMap((t) =>
        Array.from({ length: s.blocks }, (_, b) => (
          <BlockLetter key={`${t}-${b}`} stand={stand} tier={t} block={b} />
        )),
      )}
    </>
  )
}
