import { memo, useMemo } from "react";
import { toArabicDigits } from "@/lib/mushaf";
import type { QuranAyah, QuranSurah } from "@/lib/quran";
import { ayahBody, surahNameAr } from "./ayahDisplay";
import { QURAN_READING_FONT } from "./readingPrefs";

interface Props {
  surah: QuranSurah;
  /** Basmala line shown above the surah (null for Al-Fatiha, where it is ayah 1, and At-Tawbah). */
  basmala: string | null;
  fontSize: number;
  night: boolean;
  selectedKey: string | null;
  onSelectAyah: (ayah: QuranAyah) => void;
}

/**
 * One surah as real, reflowing text. The ayahs flow inline inside one paragraph per Mushaf page, so
 * a larger `font-size` simply re-wraps the words inside the screen width — never a transform, never a
 * horizontal scroll, never a broken word. The whole surah is laid out for real (no
 * content-visibility / placeholder heights), so positions stay stable when the size changes.
 */
export const SurahText = memo(function SurahText({ surah, basmala, fontSize, night, selectedKey, onSelectAyah }: Props) {
  const pages = useMemo(() => {
    const out: { page: number; ayahs: QuranAyah[] }[] = [];
    for (const a of surah.ayahs) {
      const last = out[out.length - 1];
      if (last && last.page === a.mushafPage) last.ayahs.push(a);
      else out.push({ page: a.mushafPage, ayahs: [a] });
    }
    return out;
  }, [surah]);

  const ink = night ? "#ece5d3" : "#1d2621";
  const soft = night ? "rgba(236,229,211,.55)" : "rgba(29,38,33,.5)";

  return (
    <article dir="rtl" data-surah={surah.surah} className="min-w-0" style={{ color: ink }}>
      <header className="mb-4 mt-2 flex justify-center">
        <h2
          className="rounded-full border px-6 py-1.5 text-center font-arabic text-body-lg"
          style={{ borderColor: "hsl(var(--elite-gold-start) / .6)", color: ink }}
        >
          سورة {surahNameAr(surah.surah)}
        </h2>
      </header>

      {basmala && (
        <p
          data-testid="reading-basmala"
          data-quran-text
          className="mb-3 text-center"
          style={{ fontFamily: QURAN_READING_FONT.family, fontWeight: QURAN_READING_FONT.weight, fontSize, lineHeight: QURAN_READING_FONT.lineHeight, letterSpacing: QURAN_READING_FONT.letterSpacing }}
        >
          {basmala}
        </p>
      )}

      {pages.map(({ page, ayahs }) => (
        <section key={page} data-page={page}>
          <p
            data-testid="reading-flow"
            data-quran-text
            className="min-w-0"
            style={{
              fontFamily: QURAN_READING_FONT.family,
              fontWeight: QURAN_READING_FONT.weight,
              fontSize,
              lineHeight: QURAN_READING_FONT.lineHeight,
              letterSpacing: QURAN_READING_FONT.letterSpacing,
              textAlign: "justify",
              overflowWrap: "break-word",
              wordBreak: "normal",
              maxWidth: "100%",
            }}
          >
            {ayahs.map((a) => (
              <span
                key={a.key}
                data-ayah={a.key}
                data-page={a.mushafPage}
                role="button"
                tabIndex={0}
                onClick={() => onSelectAyah(a)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectAyah(a); } }}
                className="cursor-pointer rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                style={selectedKey === a.key ? { background: night ? "rgba(212,175,55,.18)" : "rgba(16,94,72,.12)" } : undefined}
              >
                {ayahBody(a)}
                {"\u00A0"}
                <span
                  aria-label={`آية ${a.ayah}`}
                  className="inline-grid min-w-[1.6em] place-items-center rounded-full border align-middle font-display leading-none tabular-nums"
                  style={{ fontSize: "0.5em", padding: "0.35em 0.4em", borderColor: "hsl(var(--elite-gold-start) / .7)", color: night ? "hsl(var(--elite-gold-end))" : "hsl(var(--elite-gold-start))" }}
                >
                  {toArabicDigits(a.ayah)}
                </span>{" "}
              </span>
            ))}
          </p>
          <div className="my-3 flex items-center gap-3 text-caption" style={{ color: soft }} aria-hidden="true">
            <span className="h-px flex-1" style={{ background: soft, opacity: 0.35 }} />
            <span className="tabular-nums">{toArabicDigits(page)}</span>
            <span className="h-px flex-1" style={{ background: soft, opacity: 0.35 }} />
          </div>
        </section>
      ))}
    </article>
  );
});
