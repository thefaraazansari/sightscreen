import { useEffect, useState } from 'react'

const MESSAGES = [
  'Rolling the pitch',
  'Marking the crease',
  'Polishing the ball',
  'Setting the field',
  'Counting the over',
  'Raising the floodlights',
  'Filling the stands',
  'Waiting for the toss',
]

const START = Math.floor(Math.random() * MESSAGES.length)

/** A cricket line whose dots grow . .. ... every 0.4s; the line changes every 4 ticks. */
export function CricketLine() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), 400)
    return () => clearInterval(id)
  }, [])
  return (
    <>
      {MESSAGES[(START + Math.floor(t / 4)) % MESSAGES.length]}{" "}
      <span className="inline-block w-[1.1em] text-left">{'.'.repeat((t % 3) + 1)}</span>
    </>
  )
}
