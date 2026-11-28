import { useEffect, useRef, useState } from 'react'
import { stadiums } from '../stadiums/catalog'
import { AusFlag, Flag } from './Flags'

const STADIUMS = Object.values(stadiums)
const FONT = { fontFamily: "'DM Serif Display', serif" }

/** A real link, so keyboard, middle-click and focus work. The page reloads so only this stadium's code loads. */
const href = (slug: string) => {
  const q = new URLSearchParams(location.search)
  q.set('stadium', slug)
  q.set('view', 'day')
  return `${import.meta.env.BASE_URL}?${q}`
}

const still =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const texCache: Record<string, HTMLCanvasElement> = {}
const TAU = Math.PI * 2

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number) {
  g.beginPath()
  for (let k = 0; k < n * 2; k++) {
    const a = (k * Math.PI) / n - Math.PI / 2
    const rr = k % 2 ? r * 0.42 : r
    g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  g.fill()
}

/** One stroke of several segments, each [x1, y1, x2, y2]. */
function lines(g: CanvasRenderingContext2D, color: string, w: number, segs: number[][]) {
  g.strokeStyle = color
  g.lineWidth = w
  g.beginPath()
  for (const [x1, y1, x2, y2] of segs) {
    g.moveTo(x1, y1)
    g.lineTo(x2, y2)
  }
  g.stroke()
}

/** The flat flag, drawn once; the page then bends it like cloth. */
function flagTexture(au: boolean) {
  const key = au ? 'au' : 'in'
  if (texCache[key]) return texCache[key]
  const W = au ? 2000 : 1800
  const H = au ? 1000 : 1200
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  if (au) {
    g.fillStyle = '#00247d'
    g.fillRect(0, 0, W, H)
    g.save()
    g.beginPath()
    g.rect(0, 0, W / 2, H / 2)
    g.clip()
    const diag = [
      [0, 0, W / 2, H / 2],
      [W / 2, 0, 0, H / 2],
    ]
    const cross = [
      [W / 4, 0, W / 4, H / 2],
      [0, H / 4, W / 2, H / 4],
    ]
    lines(g, '#fff', H * 0.1, diag)
    lines(g, '#c8102e', H * 0.04, diag)
    lines(g, '#fff', H * 0.17, cross)
    lines(g, '#c8102e', H * 0.1, cross)
    g.restore()
    g.fillStyle = '#fff'
    // [x, y, radius, points]: Commonwealth star, four Southern Cross stars, the small fifth
    for (const [x, y, r, n] of [
      [0.25, 0.75, 0.14, 7],
      [0.75, 0.12, 0.075, 7],
      [0.75, 0.82, 0.075, 7],
      [0.63, 0.42, 0.075, 7],
      [0.87, 0.35, 0.075, 7],
      [0.81, 0.58, 0.035, 5],
    ])
      starPath(g, W * x, H * y, H * r, n)
  } else {
    ;['#ff9933', '#fff', '#138808'].forEach((col, i) => {
      g.fillStyle = col
      g.fillRect(0, (i * H) / 3, W, H / 3)
    })
    g.translate(W / 2, H / 2)
    const r = H * 0.15
    g.fillStyle = '#000080'
    g.beginPath()
    g.arc(0, 0, r * 0.18, 0, TAU)
    g.fill()
    g.beginPath()
    g.arc(0, 0, r, 0, TAU)
    g.strokeStyle = '#000080'
    g.lineWidth = r * 0.12
    g.stroke()
    const spokes = Array.from({ length: 24 }, (_, k) => {
      const [cos, sin] = [Math.cos((k * TAU) / 24), Math.sin((k * TAU) / 24)]
      return [cos * r * 0.18, sin * r * 0.18, cos * r, sin * r]
    })
    lines(g, '#000080', r * 0.05, spokes)
  }
  return (texCache[key] = c)
}

/** The hovered stadium's flag as a page background: a cloth that flies from a pole on the left, tilted,
 * drawn column by column. Each column is lifted by travelling waves that grow away from the pole, and lit by
 * the slope of the wave, so the folds catch light and shadow like real cloth. */
function WavingFlag({ show, au }: { show: boolean; au: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const g = cv?.getContext('2d')
    if (!cv || !g) return
    const tex = flagTexture(au)
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      last = t
      const w = cv.width
      const h = cv.height
      const asp = tex.width / tex.height
      const Wf = Math.max(w, h * asp) * 1.5
      const Hf = Wf / asp
      const A = h * 0.06
      const wave = (u: number) =>
        A *
        (0.2 + 0.8 * u) *
        (0.62 * Math.sin(u * 15 - t * 2.1) + 0.28 * Math.sin(u * 28 - t * 3.3 + 1.3))
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, w, h)
      g.translate(w / 2, h / 2)
      g.rotate((-12 * Math.PI) / 180)
      g.translate(-Wf / 2, 0)
      const step = 3
      for (let x = 0; x < Wf; x += step) {
        const u = x / Wf
        const y = wave(u)
        const slope = (wave(u + step / Wf) - y) / step
        g.drawImage(
          tex,
          u * tex.width,
          0,
          (step * tex.width) / Wf + 1,
          tex.height,
          x,
          y - Hf / 2,
          step + 1,
          Hf,
        )
        const sh = Math.max(-0.4, Math.min(0.4, -slope * 2.4))
        g.fillStyle = sh > 0 ? `rgba(255,255,255,${sh * 0.55})` : `rgba(0,0,0,${-sh * 0.9})`
        g.fillRect(x, y - Hf / 2, step + 1, Hf)
      }
    }
    const size = () => {
      cv.width = Math.round(innerWidth * 0.7)
      cv.height = Math.round(innerHeight * 0.7)
      draw(last)
    }
    size()
    addEventListener('resize', size)
    const loop = (now: number) => {
      draw(now / 1000)
      raf = requestAnimationFrame(loop)
    }
    if (show && !still) raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
    }
  }, [show, au])
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full blur-[1.5px] transition-opacity duration-700"
      style={{ opacity: show ? 1 : 0 }}
    />
  )
}

/** Landing page: two postcards, each a zoomed shot of the real 3D stadium. Fits one screen, never scrolls. */
export default function Landing() {
  // the flag of the card being hovered or focused takes over the page background
  const [hot, setHot] = useState<'in' | 'au' | null>(null)
  const au = hot === 'au'
  const off = () => setHot(null)
  return (
    <div
      className={`relative flex h-svh flex-col gap-3 overflow-hidden px-5 pt-9 pb-5 transition-colors duration-700 md:gap-[50px] md:pt-16 md:pb-8 ${au ? 'text-white' : 'text-[#fff1e0]'}`}
      style={{
        background: 'linear-gradient(165deg,#0f2347 0%,#3b2a5a 30%,#a4474f 65%,#ff9f55 100%)',
      }}
    >
      <WavingFlag show={hot === 'in'} au={false} />
      <WavingFlag show={au} au />

      <h1
        className={`relative mx-auto w-full max-w-6xl text-3xl md:text-5xl ${au ? '[text-shadow:0_2px_14px_rgb(0_20_80/.9)]' : ''}`}
        style={FONT}
      >
        Sight<span className={au ? 'text-[#7db8ff]' : 'text-[#ffb066]'}>Screen</span>
      </h1>
      <ul className="relative mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-rows-2 gap-6 md:grid-cols-2 md:grid-rows-1 md:gap-14">
        {STADIUMS.map((s) => {
          const F = s.flag === 'au' ? AusFlag : Flag
          const on = () => setHot(s.flag === 'au' ? 'au' : 'in')
          return (
            <li
              key={s.slug}
              className="h-full max-h-[30rem] min-h-0 self-start"
              onPointerEnter={on}
              onPointerLeave={off}
              onFocus={on}
              onBlur={off}
            >
              <a
                href={href(s.slug)}
                className="group flex size-full flex-col overflow-hidden rounded-[2rem] bg-white text-[#0d2547] ring-1 ring-white/40 transition-transform duration-500 hover:-translate-y-1 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#0b6bdc]"
              >
                <div className="min-h-0 flex-1 overflow-hidden bg-[#14305c]">
                  <img
                    src={`${import.meta.env.BASE_URL}previews/${s.slug}.jpg`}
                    alt={`${s.name} in 3D from above`}
                    width={1324}
                    height={1000}
                    className="size-full object-cover object-center brightness-[1.18] transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-4 p-5 md:p-9">
                  <F className="h-11 w-auto shrink-0 md:h-12" />
                  <div>
                    <h2 className="text-2xl leading-8 md:text-3xl md:leading-9" style={FONT}>
                      {s.name}
                    </h2>
                    <p className="mt-1 text-[11px] leading-4 font-semibold tracking-[0.2em] uppercase">
                      {s.city}
                    </p>
                  </div>
                </div>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
