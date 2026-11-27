import { STANDS, seatLabel } from '../stadiums/current'
import type { SeatRef } from '../store/useStadium'

/** The three sites linked for booking. Links go to each site's own pages (none accepts a per-seat deep link), so the user searches for the match there. */
export const BOOKING_SITES = [
  {
    name: 'BookMyShow',
    zoom: 1.55,
    icon: 'https://www.google.com/s2/favicons?domain=in.bookmyshow.com&sz=128',
    url: 'https://in.bookmyshow.com/explore/sports-mumbai',
  },
  {
    name: 'District',
    zoom: 1,
    icon: 'https://www.google.com/s2/favicons?domain=district.in&sz=128',
    url: 'https://www.district.in/',
  },
  {
    name: 'Mumbai Indians',
    zoom: 1.15,
    icon: 'https://www.mumbaiindians.com/static-assets/favicons/apple-touch-icon.png',
    url: 'https://www.mumbaiindians.com/',
  },
] as const

/** Details to quote on the booking site, in the stand / BLK / level style the ticketing sites use. */
export const seatSummary = (seat: SeatRef) => {
  const i = seatLabel(seat.stand, seat.index)
  return `${STANDS[seat.stand].name} · BLK ${i.block} · L${i.tier.slice(-1)} · Row ${i.row} · Seat ${i.num}`
}

/** The booking sites side by side: site logo above its name. */
export function BookingLinks() {
  return (
    <>
      {/* turns each logo's white backing transparent, so only the mark shows on the card */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="unwhite" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -0.64 -2.15 -0.22 0 2.9"
          />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </svg>
      <ul className="grid grid-cols-3 gap-2">
        {BOOKING_SITES.map((b) => (
          <li key={b.name}>
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-1.5 py-2.5 text-center text-ink no-underline transition-colors hover:bg-accent/10"
            >
              <span className="logo" style={{ '--zoom': b.zoom } as React.CSSProperties}>
                <img src={b.icon} alt="" loading="lazy" />
              </span>
              <span className="text-xs leading-tight font-semibold">{b.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
