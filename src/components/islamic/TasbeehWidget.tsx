import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

export function TasbeehWidget() {
  const { t, dir } = useLocale();
  const [count, setCount] = useState<number>(() => Number(localStorage.getItem("tasbeeh") || 0));
  const [phraseIdx, setPhraseIdx] = useState<number>(() => Number(localStorage.getItem("tasbeeh.phrase") || 0));

  const phrases = [
    { ar: "سُبْحَانَ ٱللَّٰه", en: "SubhanAllah", target: 33 },
    { ar: "ٱلْحَمْدُ لِلَّٰه", en: "Alhamdulillah", target: 33 },
    { ar: "ٱللَّٰهُ أَكْبَر",   en: "Allahu Akbar", target: 34 },
  ];
  const phrase = phrases[phraseIdx] ?? phrases[0];
  const progress = Math.min(1, count / phrase.target);

  useEffect(() => { localStorage.setItem("tasbeeh", String(count)); }, [count]);
  // Persist the active phrase too — otherwise reopening the widget always
  // shows phrase 1 while the count keeps counting toward a different phrase.
  useEffect(() => { localStorage.setItem("tasbeeh.phrase", String(phraseIdx)); }, [phraseIdx]);

  const tap = () => {
    setCount(c => {
      const n = c + 1;
      if ("vibrate" in navigator) navigator.vibrate(8);
      if (n >= phrase.target) {
        if ("vibrate" in navigator) navigator.vibrate([20, 30, 20]);
        setPhraseIdx(i => (i + 1) % phrases.length);
        return 0;
      }
      return n;
    });
  };

  return (
    <div className="relative overflow-hidden rounded-3xl glass-strong p-6 flex flex-col items-center" dir={dir}>
      <div className="absolute inset-0 bg-emerald-500/5" />
      <div className="relative z-10 w-full">
        <div className="text-xs uppercase tracking-[0.3em] text-accent text-center">
          {t("Digital Tasbeeh", "السبحة الرقمية")}
        </div>
        <div className="mt-3 font-arabic text-4xl text-center text-gradient-emerald">
          {phrase.ar}
        </div>
        <div className="text-center text-xs text-foreground/60 mt-1">{t(phrase.en, `المطلوب`)} · {phrase.target}</div>

        <button
          onClick={tap}
          className="mt-6 mx-auto relative h-40 w-40 rounded-full grid place-items-center transition-transform active:scale-95"
          style={{
            background: "var(--gradient-emerald)",
            boxShadow: "var(--shadow-glow-emerald), inset 0 -8px 20px hsl(165 60% 4% / 0.4), inset 0 4px 10px hsl(45 38% 94% / 0.2)",
          }}
        >
          {/* progress ring */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--foreground) / 0.15)" strokeWidth="3" />
            <circle
              cx="50" cy="50" r="46" fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${progress * 289} 289`}
              style={{ transition: "stroke-dasharray 300ms" }}
            />
          </svg>
          <div className="flex flex-col items-center justify-center gap-1">
            <Heart className="h-6 w-6 text-primary-foreground/80" fill="currentColor" />
            <div className="font-display text-5xl font-bold text-primary-foreground tabular-nums leading-none">
              {count}
            </div>
          </div>
        </button>

        <button
          onClick={() => { setCount(0); setPhraseIdx(0); }}
          className="mt-5 mx-auto block text-xs text-foreground/60 hover:text-foreground transition"
        >
          {t("Reset", "إعادة تعيين")}
        </button>

      </div>
    </div>
  );
}
