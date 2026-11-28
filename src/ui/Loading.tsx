import { CricketLine } from './CricketLine'

/** Shown while the stadium scene loads: cycles through cricket lines. */
export function Loading() {
  return (
    <div
      role="status"
      className="absolute inset-0 grid place-items-center text-sm font-semibold text-ink"
    >
      <span className="glass rounded-full px-5 py-2">
        <CricketLine />
      </span>
    </div>
  )
}
