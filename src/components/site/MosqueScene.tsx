/**
 * Layered night-sky mosque scene for Home's header: crescent + stars, a far
 * skyline, a mid mosque with minarets and a near dome. Pure SVG (no image or
 * video to download), coloured with currentColor so every theme tints it. Three
 * layers drift very slowly (transform only) and the stars twinkle softly; all of
 * it stops under prefers-reduced-motion (see index.css).
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

      {/* far skyline */}
      <div className="scene-layer-slow absolute inset-x-[-6%] bottom-0 h-[58%] opacity-[0.10]">
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="h-full w-full" fill="currentColor">
          <path d="M0 120V84h20V70l8-14 8 14v14h18V62h14V50l10-16 10 16v12h14v22h24V72l10-22 10 22v12h22V90h16V60l8-18 8 18v30h20V76h18V56l10-16 10 16v20h22v44z" />
        </svg>
      </div>

      {/* mid mosque + minarets */}
      <div className="scene-layer-mid absolute inset-x-[-4%] bottom-0 h-[62%] opacity-[0.16]">
        <svg viewBox="0 0 400 130" preserveAspectRatio="xMidYMax meet" className="h-full w-full" fill="currentColor">
          <rect x="52" y="34" width="10" height="96" rx="2" />
          <path d="M50 34l7-24 7 24z" />
          <rect x="338" y="34" width="10" height="96" rx="2" />
          <path d="M336 34l7-24 7 24z" />
          <path d="M150 104c0-38 20-56 50-64 30 8 50 26 50 64z" />
          <rect x="198" y="26" width="4" height="16" />
          <path d="M96 112c0-22 12-32 28-36 16 4 28 14 28 36z" />
          <path d="M248 112c0-22 12-32 28-36 16 4 28 14 28 36z" />
          <rect x="84" y="108" width="232" height="22" />
        </svg>
      </div>

      {/* near dome silhouette */}
      <div className="scene-layer-slow absolute inset-x-[-8%] bottom-[-2%] h-[38%] opacity-[0.22]">
        <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="h-full w-full" fill="hsl(var(--header-a))">
          <path d="M0 80V52c30-2 46-20 70-20s40 18 70 20c34 2 46-30 70-30s36 30 70 30c30 0 40-18 60-18s30 16 60 16v30z" />
        </svg>
      </div>
    </div>
  );
}
