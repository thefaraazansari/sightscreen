import { useEffect, useRef } from 'react'
import { SEATS, STANDS, TIER_NAMES, blockName, seatLabel } from '../stadiums/current'
import { useStadium } from '../store/useStadium'

export function Tooltip() {
  const el = useRef<HTMLDivElement>(null)
  const seat = useStadium((s) => s.hoveredSeat)
  const stand = useStadium((s) => (s.mode === 'overview' ? s.hoveredStand : null))
  const blk = useStadium((s) => s.hoveredBlock)
  const open = useStadium((s) => s.activeStand)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!el.current) return
      el.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
      // no floating label while pointing at the side cards: they already name what they list
      el.current.style.visibility = (e.target as Element).closest?.('aside') ? 'hidden' : 'visible'
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])

  useEffect(() => {
    const canvas = document.querySelector('canvas')
    if (canvas) canvas.style.cursor = stand !== null || blk || seat ? 'pointer' : ''
  }, [seat, stand, blk])

  let body = null
  if (seat) {
    const i = seatLabel(seat.stand, seat.index)
    body = (
      <>
        <div className="font-semibold">
          Block {i.block} · Row {i.row} · Seat {i.num}
        </div>
        <div className="text-mute">
          {i.tier}
        </div>
      </>
    )
  } else if (blk && open !== null) {
    body = (
      <>
        <div className="font-semibold">
          Block {blockName(blk.block, open)} · {TIER_NAMES[blk.tier]}
        </div>
        <div className="text-mute">{SEATS[open].blockTotal[blk.tier][blk.block]} seats · click to zoom in</div>
      </>
    )
  } else if (stand !== null) {
    const f = SEATS[stand].total
    body = (
      <>
        <div className="font-semibold">{STANDS[stand].name}</div>
        <div className="text-mute">{(f[0] + f[1] + f[2]).toLocaleString('en-IN')} seats</div>
      </>
    )
  }
  return (
    <div ref={el} className="pointer-events-none fixed top-0 left-0 z-20">
      {body && <div className="glass rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg">{body}</div>}
    </div>
  )
}
