import { lazy, Suspense, useEffect } from 'react'
import { loadScene, preloadStadium, seatLabel, STANDS } from './stadiums/current'
import { zoomBy } from './stadiums/shared/CameraRig'
import { useStadium } from './store/useStadium'
import { BookingLinks } from './ui/Booking'
import { PanelToggle } from './ui/PanelToggle'
import { SidePanel } from './ui/SidePanel'
import { Cover } from './ui/Cover'
import { TimeToggle } from './ui/TimeToggle'
import { Tooltip } from './ui/Tooltip'

preloadStadium() // start fetching the city data in parallel with the scene code
const Scene = lazy(loadScene)

function ZoomButtons() {
  const btn =
    'glass grid size-10 cursor-pointer place-items-center text-xl leading-none transition-transform active:scale-90'
  return (
    <div className="pointer-events-auto absolute right-3 bottom-[34vh] flex flex-col overflow-hidden rounded-xl md:right-4 md:bottom-4">
      <button
        aria-label="Zoom in"
        onClick={() => zoomBy(1)}
        className={`${btn} rounded-none border-b-0`}
      >
        +
      </button>
      <button aria-label="Zoom out" onClick={() => zoomBy(-1)} className={`${btn} rounded-none`}>
        −
      </button>
    </div>
  )
}

function SeatOverlay() {
  const sel = useStadium((s) => s.selectedSeat)
  const open = useStadium((s) => s.panelOpen)
  const { backToBlock } = useStadium.getState()
  if (!sel) return null
  const i = seatLabel(sel.stand, sel.index)
  return (
    <div className="glass pointer-events-auto absolute inset-x-2 bottom-3 mx-auto flex flex-col rounded-2xl p-5 md:inset-x-auto md:top-20 md:bottom-auto md:left-4 md:mx-0 md:w-[30rem]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">{STANDS[sel.stand].name}</div>
          <div className="text-mute">
            {i.tier} · Block {i.block} · Row {i.row} · Seat {i.num}
          </div>
        </div>
        <PanelToggle flip />
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-3 pt-3">
            <BookingLinks />
            <button
              onClick={backToBlock}
              className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-ink"
            >
              Choose different seat
            </button>
            <div className="text-center text-xs text-mute">
              Drag to look around · Scroll or pinch to zoom
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const time = useStadium((s) => s.time)
  useEffect(() => {
    document.documentElement.dataset.time = time
  }, [time])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useStadium.getState().back()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const mode = useStadium((s) => s.mode)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <div className="pointer-events-none absolute inset-0">
        <header className="absolute inset-x-0 top-0 flex items-center justify-between p-3 md:p-4">
          <a
            href={import.meta.env.BASE_URL}
            title="Choose another stadium"
            className="glass pointer-events-auto rounded-full px-4 py-2 text-sm font-semibold tracking-tight text-ink no-underline"
          >
            Sight<span className="text-accent">Screen</span>
          </a>
          <div className="pointer-events-auto">
            <TimeToggle />
          </div>
        </header>
        <SidePanel />
        <ZoomButtons />
        {mode === 'seat' && <SeatOverlay />}
      </div>
      <Tooltip />
      <Cover />
    </div>
  )
}
