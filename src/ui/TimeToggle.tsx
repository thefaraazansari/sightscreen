import { TIMES, type TimeOfDay } from '../data/times'
import { useStadium } from '../store/useStadium'

const ICONS: Record<TimeOfDay, string> = {
  day: 'M12 4V2m0 20v-2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
  evening: 'M3 18h18M6 18a6 6 0 0 1 12 0M12 6V4M4.5 10.5 3 9m16.5 1.5L21 9',
  night: 'M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',
}

export function TimeToggle() {
  const time = useStadium((s) => s.time)
  const setTime = useStadium((s) => s.setTime)
  return (
    <div role="radiogroup" aria-label="Time of day" className="glass flex rounded-full p-1">
      {(Object.keys(TIMES) as TimeOfDay[]).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={time === t}
          onClick={() => setTime(t)}
          className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${time === t ? 'bg-accent text-accent-ink' : 'text-mute hover:text-ink'}`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS[t]} />
          </svg>
          <span className="hidden sm:inline">{TIMES[t].label}</span>
        </button>
      ))}
    </div>
  )
}
