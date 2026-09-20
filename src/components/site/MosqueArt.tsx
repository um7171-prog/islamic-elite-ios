/** Quiet mosque silhouette (dome + two minarets) used as a decorative watermark
 * on the Home hero card, the header and the splash screen. Pure SVG, inherits
 * `currentColor`, no external asset. */
export function MosqueArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 130" className={className} fill="currentColor" aria-hidden focusable="false">
      {/* minarets */}
      <rect x="22" y="38" width="12" height="80" rx="2" />
      <path d="M20 38 L28 12 L36 38 Z" />
      <circle cx="28" cy="9" r="3" />
      <rect x="206" y="38" width="12" height="80" rx="2" />
      <path d="M204 38 L212 12 L220 38 Z" />
      <circle cx="212" cy="9" r="3" />
      {/* main dome */}
      <path d="M80 92 C80 50 100 34 120 28 C140 34 160 50 160 92 Z" />
      <rect x="118" y="14" width="4" height="16" />
      <circle cx="120" cy="11" r="3.5" />
      {/* side domes */}
      <path d="M52 100 C52 78 64 70 76 68 C88 70 96 78 96 100 Z" />
      <path d="M144 100 C144 78 152 70 164 68 C176 70 188 78 188 100 Z" />
      {/* hall */}
      <rect x="40" y="96" width="160" height="22" rx="2" />
      <rect x="10" y="118" width="220" height="8" rx="2" />
    </svg>
  );
}
