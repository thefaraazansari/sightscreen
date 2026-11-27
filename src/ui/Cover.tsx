import { useStadium } from '../store/useStadium'

const THEMES = {
  day: {
    bg: 'linear-gradient(180deg, #6fa9e4 0%, #a6cdf0 45%, #e4f0fb 100%)',
    glow: 'rgb(255 252 235 / 0.7)',
    cloud: '1 1 1',
    ink: '#0d2547',
    stars: false,
    cloudOp: 1,
  },
  evening: {
    bg: 'linear-gradient(180deg, #30181f 0%, #5e2c36 28%, #b5524a 56%, #ff9f55 84%, #ffc383 100%)',
    glow: 'rgb(255 170 90 / 0.55)',
    cloud: '1 0.78 0.62',
    ink: '#fff1e0',
    stars: false,
    cloudOp: 0.8,
  },
  night: {
    bg: 'linear-gradient(180deg, #020611 0%, #081730 50%, #14305c 100%)',
    glow: 'rgb(120 150 230 / 0.28)',
    cloud: '0.45 0.55 0.8',
    ink: '#e8eeff',
    stars: true,
    cloudOp: 0.55,
  },
} as const

const STARS = Array.from({ length: 80 }, (_, i) => ({
  x: (i * 37.7) % 100,
  y: (i * 23.3) % 70,
  r: 0.8 + ((i * 13) % 10) / 8,
  d: (i % 7) * 0.6,
}))

/** The Indian tricolour, static. */
function Flag() {
  const spokes = Array.from({ length: 24 }, (_, i) => (i * 15 * Math.PI) / 180)
  return (
    <svg
      viewBox="0 0 90 60"
      className="w-24 rounded-[2px] shadow-md sm:w-32"
      role="img"
      aria-label="Flag of India"
    >
      <rect width="90" height="20" fill="#FF9933" />
      <rect y="20" width="90" height="20" fill="#FFFFFF" />
      <rect y="40" width="90" height="20" fill="#138808" />
      <g transform="translate(45 30)" stroke="#000080" fill="none" strokeWidth="0.45">
        <circle r="8.2" strokeWidth="0.9" />
        {spokes.map((a, i) => (
          <line
            key={i}
            x1={Math.cos(a) * 1.2}
            y1={Math.sin(a) * 1.2}
            x2={Math.cos(a) * 8}
            y2={Math.sin(a) * 8}
          />
        ))}
        <circle r="1.1" fill="#000080" stroke="none" />
      </g>
    </svg>
  )
}

/** Soft fractal-noise cloud layer, drifting slowly. */
function Clouds({
  seed,
  freq,
  opacity,
  top,
  duration,
  scale,
  rgb,
}: {
  rgb: string
  seed: number
  freq: string
  opacity: number
  top: string
  duration: number
  scale: number
}) {
  const id = `cloud${seed}`
  return (
    <div
      className="absolute -inset-x-1/4 h-[70%]"
      style={{
        top,
        opacity,
        maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
        animation: `sky-drift ${duration}s linear infinite alternate`,
      }}
    >
      <svg width="100%" height="100%" preserveAspectRatio="none">
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves="5" seed={seed} />
          <feColorMatrix
            type="matrix"
            values={`${rgb
              .split(' ')
              .map((c) => `0 0 0 0 ${c}`)
              .join('  ')}  0 0 0 ${scale} ${-scale * 0.52}`}
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </div>
  )
}

/** Opening veil: a bright sky of drifting cloud and blur that hides the scene while it loads, then lifts away. */
export function Cover() {
  const ready = useStadium((s) => s.ready)
  const th = THEMES[useStadium((s) => s.time)]
  return (
    <div
      aria-hidden={ready}
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
      style={{
        background: th.bg,
        backdropFilter: ready ? 'blur(0px)' : 'blur(28px)',
        opacity: ready ? 0 : 1,
        transform: ready ? 'scale(1.12)' : 'scale(1)',
        transition:
          'opacity 1.5s ease-in-out, backdrop-filter 1.5s ease-in-out, transform 2s ease-out',
      }}
    >
      <div
        className="absolute -top-[10%] left-1/2 size-[70vmax] -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(closest-side, ' + th.glow + ', transparent)' }}
      />
      {th.stars &&
        STARS.map((st, i) => (
          <i
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${st.x}%`,
              top: `${st.y}%`,
              width: st.r,
              height: st.r,
              animation: `twinkle 3.4s ease-in-out ${st.d}s infinite alternate`,
            }}
          />
        ))}
      <Clouds
        rgb={th.cloud}
        seed={4}
        freq="0.0045 0.009"
        opacity={0.6 * th.cloudOp}
        top="-5%"
        duration={70}
        scale={2.2}
      />
      <Clouds
        rgb={th.cloud}
        seed={9}
        freq="0.007 0.014"
        opacity={0.45 * th.cloudOp}
        top="35%"
        duration={50}
        scale={2}
      />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
        style={{ opacity: ready ? 0 : 1, transition: 'opacity 0.8s' }}
      >
        <Flag />
        <div
          className="mt-7 text-4xl sm:text-5xl"
          style={{
            color: th.ink,
            fontFamily: "'DM Serif Display', serif",
            textShadow:
              th.ink === '#0d2547'
                ? '0 2px 22px rgb(255 255 255 / 0.6)'
                : '0 2px 18px rgb(0 0 0 / 0.4)',
          }}
        >
          Wankhede Stadium
        </div>
        <div className="mt-3 h-px w-10 opacity-40" style={{ background: th.ink }} />
        <div
          className="mt-3 text-[11px] font-semibold tracking-[0.6em] pl-[0.6em] uppercase"
          style={{ color: th.ink }}
        >
          Mumbai
        </div>
      </div>
    </div>
  )
}
