import { toArabicDigits } from "@/lib/mushaf";

/**
 * The end-of-ayah number, drawn by the UI: the source text's own number glyph belongs to the
 * KFGQPC font (see ayahDisplay.ts), so it is split off and shown here instead. Sized in em, so it
 * follows the text size wherever it is used (the reading screen, and the Mushaf's enlarged text).
 */
export function AyahMarker({ ayah, night }: { ayah: number; night: boolean }) {
  return (
    <span
      aria-label={`آية ${ayah}`}
      className="inline-grid min-w-[1.6em] place-items-center rounded-full border align-middle font-display leading-none tabular-nums"
      style={{ fontSize: "0.5em", padding: "0.35em 0.4em", borderColor: "hsl(var(--elite-gold-start) / .7)", color: night ? "hsl(var(--elite-gold-end))" : "hsl(var(--elite-gold-start))" }}
    >
      {toArabicDigits(ayah)}
    </span>
  );
}
