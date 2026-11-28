/** The two flags shown on the veil and the stadium picker. `className` sets the size. */
export function AusFlag({ className = 'w-28 sm:w-36' }: { className?: string }) {
  const star = (cx: number, cy: number, r: number, n: number) =>
    Array.from({ length: n * 2 }, (_, k) => {
      const a = (k * Math.PI) / n - Math.PI / 2
      const rr = k % 2 ? r * 0.4 : r
      return `${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`
    }).join(' ')
  return (
    <svg
      viewBox="0 0 60 30"
      className={`${className} rounded-[2px] shadow-md`}
      role="img"
      aria-label="Flag of Australia"
    >
      <clipPath id="au-s">
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id="au-c">
        <path d="M0,0 h30 v15 h-30 z" />
      </clipPath>
      <clipPath id="au-t">
        <path d="M15,7.5 h15 v7.5 z v7.5 h-15 z h-15 v-7.5 z v-7.5 h15 z" />
      </clipPath>
      <g clipPath="url(#au-s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#00247d" />
        <g clipPath="url(#au-c)">
          <path d="M0,0 L30,15 M30,0 L0,15" stroke="#fff" strokeWidth="3" />
          <path d="M0,0 L30,15 M30,0 L0,15" clipPath="url(#au-t)" stroke="#C8102E" strokeWidth="2" />
          <path d="M15,0 v15 M0,7.5 h30" stroke="#fff" strokeWidth="5" />
          <path d="M15,0 v15 M0,7.5 h30" stroke="#C8102E" strokeWidth="3" />
        </g>
        <g fill="#fff">
          <polygon points={star(15, 22.5, 4.4, 7)} />
          <polygon points={star(46.5, 26, 2.6, 7)} />
          <polygon points={star(39, 14.5, 2.6, 7)} />
          <polygon points={star(46.5, 3.5, 2.6, 7)} />
          <polygon points={star(54, 13, 2.6, 7)} />
          <polygon points={star(50.5, 17.5, 1.5, 5)} />
        </g>
      </g>
    </svg>
  )
}


export function Flag({ className = 'w-24 sm:w-32' }: { className?: string }) {
  const spokes = Array.from({ length: 24 }, (_, i) => (i * 15 * Math.PI) / 180)
  return (
    <svg
      viewBox="0 0 90 60"
      className={`${className} rounded-[2px] shadow-md`}
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
