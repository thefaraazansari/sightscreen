import { create } from 'zustand'
import type { TimeOfDay } from '../data/times'

export type Mode = 'overview' | 'stand' | 'seat'
export interface BlockRef {
  tier: number
  block: number
}
export interface SeatRef {
  stand: number
  index: number
}

interface State {
  /** the whole scene (city included) has loaded; the intro cover lifts and the opening shot starts */
  ready: boolean
  setReady: () => void
  time: TimeOfDay
  mode: Mode
  /** left info card open (true) or collapsed to its title bar (false) */
  panelOpen: boolean
  togglePanel: () => void
  activeStand: number | null
  /** Selected level inside the open stand (null = all levels). */
  activeTier: number | null
  /** The block (on one floor) zoomed into; seats can only be picked once a block is chosen. */
  activeBlock: BlockRef | null
  hoveredBlock: BlockRef | null
  hoveredStand: number | null
  hoveredSeat: SeatRef | null
  selectedSeat: SeatRef | null
  setTime: (t: TimeOfDay) => void
  hoverStand: (i: number | null) => void
  hoverSeat: (s: SeatRef | null) => void
  focusStand: (i: number) => void
  selectTier: (t: number | null) => void
  hoverBlock: (b: BlockRef | null) => void
  selectBlock: (b: BlockRef | null) => void
  selectSeat: (s: SeatRef | null) => void
  enterSeat: () => void
  /** Straight back to the whole stand (all blocks) from a block or a seat. */
  backToStand: () => void
  /** From a seat back to its block, to pick another seat. */
  backToBlock: () => void
  /** Back out to the whole stadium from anywhere. */
  backToStadium: () => void
  back: () => void
}

const SLUG = 'wankhede-stadium'
const TIMES_LIST: TimeOfDay[] = ['day', 'evening', 'night']
/** the URL carries the stadium and the view: ?stadium=wankhede-stadium&view=night */
const urlTime = (): TimeOfDay => {
  const t = new URLSearchParams(location.search).get('view') as TimeOfDay
  return TIMES_LIST.includes(t) ? t : 'day'
}
const syncUrl = (t: TimeOfDay) => {
  const q = new URLSearchParams(location.search)
  q.set('stadium', SLUG)
  q.set('view', t)
  history.replaceState(null, '', `/?${q}${location.hash}`)
}

const same = (a: SeatRef | null, b: SeatRef | null) =>
  a?.stand === b?.stand && a?.index === b?.index

export const useStadium = create<State>((set, get) => ({
  ready: false,
  setReady: () => set({ ready: true }),
  time: urlTime(),
  mode: 'overview',
  panelOpen: true,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  activeStand: null,
  activeTier: null,
  activeBlock: null,
  hoveredBlock: null,
  hoveredStand: null,
  hoveredSeat: null,
  selectedSeat: null,
  setTime: (time) => {
    syncUrl(time)
    set({ time })
  },
  hoverStand: (hoveredStand) => get().hoveredStand !== hoveredStand && set({ hoveredStand }),
  hoverSeat: (hoveredSeat) => !same(get().hoveredSeat, hoveredSeat) && set({ hoveredSeat }),
  focusStand: (i) =>
    set((s) => ({
      mode: 'stand',
      activeStand: i,
      activeTier: null,
      activeBlock: null,
      hoveredBlock: null,
      hoveredStand: null,
      hoveredSeat: null,
      selectedSeat: s.selectedSeat?.stand === i ? s.selectedSeat : null,
    })),
  selectTier: (activeTier) =>
    set((s) => ({
      activeTier,
      hoveredSeat: null,
      hoveredBlock: null,
      activeBlock:
        activeTier !== null && s.activeBlock && s.activeBlock.tier !== activeTier
          ? null
          : s.activeBlock,
    })),
  hoverBlock: (hoveredBlock) =>
    get().hoveredBlock?.tier !== hoveredBlock?.tier ||
    get().hoveredBlock?.block !== hoveredBlock?.block
      ? set({ hoveredBlock })
      : undefined,
  selectBlock: (activeBlock) =>
    set({
      activeBlock,
      hoveredBlock: null,
      hoveredSeat: null,
      selectedSeat: null,
      activeTier: activeBlock ? activeBlock.tier : null,
    }),
  selectSeat: (selectedSeat) => set({ selectedSeat }),
  backToBlock: () => set({ mode: 'stand', selectedSeat: null, hoveredSeat: null }),
  backToStadium: () =>
    set({
      mode: 'overview',
      activeStand: null,
      activeTier: null,
      activeBlock: null,
      hoveredBlock: null,
      selectedSeat: null,
      hoveredSeat: null,
    }),
  backToStand: () =>
    set({
      mode: 'stand',
      activeBlock: null,
      activeTier: null,
      selectedSeat: null,
      hoveredSeat: null,
      hoveredBlock: null,
    }),
  enterSeat: () => {
    const sel = get().selectedSeat
    if (sel) set({ mode: 'seat', activeStand: sel.stand, hoveredSeat: null })
  },
  back: () => {
    const { mode } = get()
    if (mode === 'seat') set({ mode: 'stand' })
    else if (mode === 'stand' && get().activeBlock)
      set({ activeBlock: null, activeTier: null, hoveredSeat: null, selectedSeat: null })
    else if (mode === 'stand')
      set({
        mode: 'overview',
        activeStand: null,
        activeTier: null,
        activeBlock: null,
        hoveredBlock: null,
        selectedSeat: null,
        hoveredSeat: null,
      })
  },
}))

// Dev-only handle for debugging in the console.
if (import.meta.env.DEV)
  (window as unknown as { __stadium: typeof useStadium }).__stadium = useStadium

syncUrl(useStadium.getState().time)
