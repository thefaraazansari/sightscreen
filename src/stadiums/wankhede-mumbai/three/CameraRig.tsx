import { CameraControls } from '@react-three/drei'
import CC from 'camera-controls'
import { useEffect, useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import { blockView, seatEye, standView } from '../data/layout'
import { useStadium } from '../../../store/useStadium'

const { ACTION } = CC

/**
 * On wide screens the picture is pushed right by a fixed number of pixels so the stadium sits clear of the left card.
 * A view offset (not a focal offset) keeps the point you zoom into and orbit around exactly on the pitch at any zoom.
 */
const SHIFT_PX = 110
let shift = 0
let shiftRaf = 0
const applyShift = (c: CC) => {
  const cam = c.camera as PerspectiveCamera
  const w = window.innerWidth
  const h = window.innerHeight
  if (Math.abs(shift) < 0.5) cam.clearViewOffset()
  else cam.setViewOffset(w, h, -shift, 0, w, h)
}
function moveShift(c: CC, to: number, animate: boolean) {
  cancelAnimationFrame(shiftRaf)
  const from = shift
  const t0 = performance.now()
  const step = () => {
    const k = animate ? Math.min(1, (performance.now() - t0) / 600) : 1
    shift = from + (to - from) * (1 - (1 - k) ** 3)
    applyShift(c)
    if (k < 1) shiftRaf = requestAnimationFrame(step)
  }
  step()
}
let ctrl: CC | null = null
let introDone = false
/** how much closer the resting overview sits than the base (0, 320, 380) view */
const OVERVIEW_ZOOM = 1.4
const OV_Y = 320 / OVERVIEW_ZOOM
const OV_Z = 380 / OVERVIEW_ZOOM

/** Zoom in (+1) or out (-1): dolly normally, lens zoom in first-person seat view. */
export function zoomBy(dir: 1 | -1) {
  const c = ctrl
  if (!c) return
  if (useStadium.getState().mode === 'seat')
    void c.zoomTo(Math.min(3.5, Math.max(0.8, c.camera.zoom * (dir > 0 ? 1.35 : 1 / 1.35))), true)
  else
    void c.dollyTo(
      Math.min(c.maxDistance, Math.max(c.minDistance, c.distance * (dir > 0 ? 0.65 : 1.5))),
      true,
    )
}

function setLimits(c: CC, kind: 'overview' | 'stand' | 'seat') {
  const seat = kind === 'seat'
  c.minDistance = seat ? 0.001 : kind === 'stand' ? 12 : 60
  c.maxDistance = seat ? 1000 : kind === 'stand' ? 190 : 900
  c.camera.near = kind === 'overview' ? 3 : kind === 'stand' ? 1 : 1
  c.camera.updateProjectionMatrix()
  c.minPolarAngle = seat ? 0 : 0.12
  c.maxPolarAngle = seat ? Math.PI : 1.5
  c.azimuthRotateSpeed = c.polarRotateSpeed = seat ? -0.45 : 1
  c.mouseButtons.wheel = seat ? ACTION.ZOOM : ACTION.DOLLY
  c.mouseButtons.right = seat ? ACTION.NONE : ACTION.TRUCK
  c.touches.two = seat ? ACTION.TOUCH_ZOOM : ACTION.TOUCH_DOLLY_TRUCK
  c.minZoom = 0.8
  c.maxZoom = 3.5
  if (!seat) void c.zoomTo(1, true)
}

export function CameraRig() {
  const ref = useRef<CC>(null)
  const mode = useStadium((s) => s.mode)
  const active = useStadium((s) => s.activeStand)
  const tier = useStadium((s) => s.activeTier)
  const block = useStadium((s) => s.activeBlock)
  const first = useRef(true)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    ctrl = c
    if (import.meta.env.DEV) (window as unknown as { __cc: CC }).__cc = c
    c.smoothTime = 0.55
    const onResize = () => applyShift(c)
    window.addEventListener('resize', onResize)
    const animate = !first.current
    first.current = false
    let stale = false
    let cancelIntro: (() => void) | null = null

    // keep the focus clear of the left-hand panel on wide screens
    const wide = window.innerWidth >= 768
    moveShift(c, wide && mode !== 'seat' ? SHIFT_PX : 0, animate)
    if (mode !== 'overview') introDone = true
    if (mode === 'overview') {
      setLimits(c, 'overview')
      if (introDone) void c.setLookAt(0, OV_Y, OV_Z, 0, 0, 0, animate)
      else {
        // opening shot: a spin from the farthest zoom that ends exactly on the usual overview
        const endD = Math.hypot(OV_Y, OV_Z)
        const endP = Math.atan2(OV_Z, OV_Y)
        const from = { az: (135 * Math.PI) / 180, polar: 1.18, d: 900 }
        let t0 = 0
        const DUR = 7000
        const place = (az: number, polar: number, d: number) =>
          c.setLookAt(
            d * Math.sin(polar) * Math.sin(az),
            d * Math.cos(polar),
            d * Math.sin(polar) * Math.cos(az),
            0,
            0,
            0,
            false,
          )
        place(from.az, from.polar, from.d)
        let raf = 0
        const step = () => {
          if (!useStadium.getState().ready) {
            raf = requestAnimationFrame(step)
            return
          }
          if (!t0) t0 = performance.now()
          const k = Math.min(1, (performance.now() - t0) / DUR)
          const e = 1 - (1 - k) ** 4 // ease out: fast spin at first, settling slowly
          void place(
            from.az * (1 - e),
            from.polar + (endP - from.polar) * e,
            from.d + (endD - from.d) * e,
          )
          if (k < 1) raf = requestAnimationFrame(step)
          else off()
        }
        const stop = () => {
          cancelAnimationFrame(raf)
          c.removeEventListener('controlstart', off)
        }
        const off = () => {
          introDone = true
          stop()
        }
        c.addEventListener('controlstart', off)
        raf = requestAnimationFrame(step)
        cancelIntro = stop
      }
    } else if (mode === 'stand' && active !== null) {
      setLimits(c, 'stand')
      if (block) c.minDistance = 6
      const { pos, target } = block
        ? blockView(active, block.tier, block.block)
        : standView(active, tier)
      void c.setLookAt(...pos, ...target, animate)
    } else if (mode === 'seat') {
      const sel = useStadium.getState().selectedSeat
      if (!sel) return
      setLimits(c, 'seat')
      const eye = seatEye(sel.stand, sel.index)
      const dir = [-eye[0], 1 - eye[1], -eye[2]]
      const len = Math.hypot(...dir)
      const look = eye.map((e, i) => e + (dir[i] / len) * 0.1) as [number, number, number]
      c.setLookAt(...eye, ...look, true).then(() => {
        if (stale) return
        c.camera.near = 0.1
        c.camera.updateProjectionMatrix()
        c.minPolarAngle = Math.max(0.1, c.polarAngle - 0.8)
        c.maxPolarAngle = Math.min(Math.PI - 0.1, c.polarAngle + 0.9)
      })
    }
    return () => {
      window.removeEventListener('resize', onResize)
      cancelIntro?.()
      cancelIntro = null
      stale = true
    }
  }, [mode, active, tier, block?.tier, block?.block])

  return <CameraControls ref={ref} makeDefault />
}
