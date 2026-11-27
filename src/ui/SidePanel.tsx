import { SEATS, STANDS } from '../stadiums/current'
import { useStadium } from '../store/useStadium'
import { PanelToggle } from './PanelToggle'

const n = (x: number) => x.toLocaleString('en-IN')
const total = (i: number) => SEATS[i].total.reduce((a, b) => a + b, 0)

/** Sachin Tendulkar then North first, Dilip Vengsarkar Stand last. */
const ORDER = [6, 7, 0, 1, 2, 3, 4, 5]

function Overview() {
  const hovered = useStadium((s) => s.hoveredStand)
  const { hoverStand, focusStand } = useStadium.getState()
  const cap = STANDS.reduce((a, s) => a + total(s.id), 0)
  return (
    <>
      <p className="text-sm leading-relaxed text-mute">
        <b className="text-ink">{n(cap)}</b> seats across {STANDS.length} stands. Hover a stand to
        preview, click to open it.
      </p>
      <ul className="-mx-1 flex flex-col gap-1.5 overflow-y-auto px-1 py-1">
        {ORDER.map((id) => STANDS[id]).map((s) => (
          <li key={s.id}>
            <button
              onMouseEnter={() => hoverStand(s.id)}
              onMouseLeave={() => hoverStand(null)}
              onClick={() => focusStand(s.id)}
              className={`w-full cursor-pointer rounded-xl border px-3 py-3 text-left text-ink transition-colors ${hovered === s.id ? 'border-accent bg-accent/15' : 'border-transparent hover:bg-accent/10'}`}
            >
              <div className="flex items-center justify-between gap-2 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <i className="size-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="text-xs text-mute">{n(total(s.id))} seats</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function StandDetail() {
  const block = useStadium((st) => st.activeBlock)
  const { backToStadium, backToStand } = useStadium.getState()
  return (
    <>
      <button
        onClick={block ? backToStand : backToStadium}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-ink"
      >
        {block ? 'Choose different block' : 'Choose different stand'}
      </button>
    </>
  )
}

export function SidePanel() {
  const mode = useStadium((s) => s.mode)
  const active = useStadium((s) => s.activeStand)
  // the collapse chevron only exists in the overview; the stand and block views always show their card
  const open = useStadium((s) => s.panelOpen || s.mode !== 'overview')
  if (mode === 'seat') return null
  return (
    <aside className="glass pointer-events-auto absolute inset-x-2 bottom-2 flex max-h-[30vh] flex-col overflow-y-auto rounded-2xl p-5 md:inset-x-auto md:top-20 md:bottom-auto md:left-4 md:max-h-[calc(100dvh-6rem)] md:w-96">
      {mode === 'stand' && active !== null && (
        <h2 className="mb-1.5 flex items-center gap-2 text-lg font-semibold">
          <i className="size-3 rounded-full" style={{ background: STANDS[active].color }} />
          {STANDS[active].name}
          <span className="ml-auto text-xs font-medium text-mute">{n(total(active))} seats</span>
        </h2>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xs font-semibold tracking-widest text-accent uppercase">
          Wankhede Stadium · Mumbai
        </h1>
        {mode === 'overview' && <PanelToggle flip />}
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-3.5 pt-3.5">
            {mode === 'stand' && active !== null ? <StandDetail /> : <Overview />}
          </div>
        </div>
      </div>
    </aside>
  )
}
