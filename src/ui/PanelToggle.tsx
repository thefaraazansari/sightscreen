import { useStadium } from '../store/useStadium'

/** Small chevron that collapses / opens the info card so the whole scene can be enjoyed. */
export function PanelToggle({ flip = false }: { flip?: boolean }) {
  const open = useStadium((s) => s.panelOpen)
  const toggle = useStadium((s) => s.togglePanel)
  return (
    <button
      onClick={toggle}
      aria-label={open ? 'Collapse panel' : 'Open panel'}
      aria-expanded={open}
      title={open ? 'Collapse' : 'Open'}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-mute transition-colors hover:bg-accent/15 hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className={`size-4 transition-transform duration-300 ${open !== flip ? 'rotate-180 md:rotate-0' : 'rotate-0 md:rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  )
}
