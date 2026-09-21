/**
 * Night-sky backdrop for Home's header: sky glow, crescent and softly twinkling
 * stars. Pure SVG (no image or video to download). The Haram/Kaaba architecture
 * and its motion live in HaramScene; stars stop under prefers-reduced-motion
 * (see index.css).
 */
const STARS: [number, number][] = [[60, 30], [120, 58], [200, 22], [250, 64], [356, 96], [30, 96], [170, 88], [292, 18]];

export function MosqueScene({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden text-white ${className}`} data-testid="mosque-scene">
      {/* sky glow */}
      <div className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_70%_0%,hsl(var(--elite-gold-end)/0.16),transparent_60%)]" />

      {/* crescent + stars */}
      <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <g fill="hsl(var(--elite-gold-end))" opacity="0.85" transform="translate(-184 43) scale(0.8)">
          <path d="M318 34a26 26 0 1 0 22 40 21 21 0 1 1-22-40z" />
        </g>
        <g fill="white">
          {STARS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1.1} className="scene-star" style={{ animationDelay: `${(i * 0.7).toFixed(1)}s` }} />
          ))}
        </g>
      </svg>

    </div>
  );
}
