import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Pause, Play, Search, Star } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { SettingsGroup, SettingsSection } from "@/components/site/SettingsUI";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SURAHS } from "@/lib/mushafData";
import { RECITERS, getFavorites, getReciter, getSelectedReciterId, setMediaSession, setSelectedReciterId, sortByFavorites, toggleFavorite } from "@/lib/reciters";
import { loadLastPlayed, nextSurah, prevSurah, saveLastPlayed, searchReciters, searchSurahs, streamOrCachedUrl } from "@/lib/surahPlayer";

type Status = "idle" | "loading" | "playing" | "paused" | "error";

/**
 * «القرّاء»: choose a reciter (search, favorites — the same saved choice the Mushaf uses) and listen
 * to whole surahs: play / pause / resume, previous / next surah, continues where it stopped.
 * Streams by default; a surah already saved for offline plays from the device.
 */
export default function RecitersPage() {
  const { t, lang, dir } = useLocale();
  const last = useMemo(() => loadLastPlayed(), []);
  const [reciterId, setReciterId] = useState(() => getSelectedReciterId());
  const [favs, setFavs] = useState<string[]>(() => getFavorites());
  const [surah, setSurah] = useState<number>(() => last?.surah ?? 1);
  const [status, setStatus] = useState<Status>("idle");
  const [time, setTime] = useState({ at: 0, total: 0 });
  const [reciterQuery, setReciterQuery] = useState("");
  const [surahQuery, setSurahQuery] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const loaded = useRef<{ reciterId: string; surah: number } | null>(null);
  const resumeAt = useRef<number>(last && last.reciterId === getSelectedReciterId() ? last.position : 0);

  const reciter = getReciter(reciterId);
  const meta = SURAHS[surah - 1];
  const surahName = (n: number) => (lang === "ar" ? `سورة ${SURAHS[n - 1].ar}` : `${SURAHS[n - 1].en}`);

  const remember = useCallback(() => {
    const el = audio.current;
    if (loaded.current) saveLastPlayed({ reciterId: loaded.current.reciterId, surah: loaded.current.surah, position: el?.currentTime ?? 0 });
  }, []);

  const releaseUrl = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };

  const play = useCallback(async (n: number, r = getReciter(reciterId)) => {
    const el = (audio.current ??= new Audio());
    el.pause();
    setSurah(n);
    setStatus("loading");
    releaseUrl();
    try {
      const { url, cached } = await streamOrCachedUrl(r, n);
      if (cached) objectUrl.current = url;
      el.src = url;
      loaded.current = { reciterId: r.id, surah: n };
      const start = resumeAt.current;
      resumeAt.current = 0;
      if (start > 0) el.addEventListener("loadedmetadata", () => { try { el.currentTime = start; } catch { /* seek unsupported */ } }, { once: true });
      await el.play();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }, [reciterId]);

  const toggle = () => {
    const el = audio.current;
    if (status === "playing" && el) { el.pause(); return; }
    if (status === "paused" && el && loaded.current?.surah === surah && loaded.current.reciterId === reciterId) {
      void el.play().then(() => setStatus("playing")).catch(() => setStatus("error"));
      return;
    }
    void play(surah);
  };

  const step = (n: number | null) => { if (n) { resumeAt.current = 0; void play(n); } };

  // Audio element events: progress, pause, end -> next surah, failures.
  useEffect(() => {
    const el = (audio.current ??= new Audio());
    const onTime = () => setTime({ at: el.currentTime, total: Number.isFinite(el.duration) ? el.duration : 0 });
    const onPause = () => { if (!el.ended) setStatus((s) => (s === "loading" ? s : "paused")); remember(); };
    const onPlay = () => setStatus("playing");
    const onError = () => setStatus("error");
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("error", onError);
    };
  }, [remember]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onEnded = () => { resumeAt.current = 0; const n = nextSurah(loaded.current?.surah ?? surah); if (n) void play(n); else setStatus("idle"); };
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [play, surah]);

  // Save the position now and then, and stop + save when leaving the screen.
  useEffect(() => {
    const id = setInterval(() => { if (status === "playing") remember(); }, 5000);
    return () => clearInterval(id);
  }, [status, remember]);
  useEffect(() => () => { remember(); audio.current?.pause(); releaseUrl(); }, [remember]);

  // Lock-screen / headphone controls.
  useEffect(() => {
    if (status !== "playing") return;
    setMediaSession({
      title: surahName(surah),
      artist: t(reciter.nameEn, reciter.name),
      onPlay: () => void audio.current?.play(),
      onPause: () => audio.current?.pause(),
      onNext: () => step(nextSurah(surah)),
      onPrev: () => step(prevSurah(surah)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, surah, reciterId]);

  const chooseReciter = (id: string) => {
    setSelectedReciterId(id);
    setReciterId(id);
    // A different voice: restart the current surah with it if something was playing.
    if (status === "playing" || status === "paused") { resumeAt.current = 0; void play(surah, getReciter(id)); }
  };

  const reciters = searchReciters(sortByFavorites(RECITERS, favs), reciterQuery);
  const surahs = searchSurahs(surahQuery);
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <PageShell titleAr="القرّاء" titleEn="Reciters" fallback="/more">
      <SEO
        title={t("Reciters — Elite Islamic", "القرّاء — النخبة الإسلامية")}
        description={t("Listen to the Quran with your favourite reciter.", "استمع إلى القرآن الكريم بصوت قارئك المفضل.")}
        path="/reciters"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-6" data-reciters>
        {/* Player */}
        <SettingsGroup className="p-4">
          <div className="space-y-3" data-player-status={status}>
            <div className="text-center">
              <p className="font-display text-h3 font-bold text-foreground" data-player-surah>{surahName(surah)}</p>
              <p className="text-body-sm text-foreground/60">{t(reciter.nameEn, reciter.name)} · {t(`${meta.ayahs} ayahs`, `${meta.ayahs} آية`)}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${time.total ? Math.min(100, (time.at / time.total) * 100) : 0}%` }} />
            </div>
            <div className="flex justify-between text-caption tabular-nums text-foreground/50" dir="ltr">
              <span>{fmt(time.at)}</span><span>{time.total ? fmt(time.total) : "--:--"}</span>
            </div>
            <div className="flex items-center justify-center gap-6">
              <button type="button" onClick={() => step(prevSurah(surah))} disabled={!prevSurah(surah)} aria-label={t("Previous surah", "السورة السابقة")} className="grid h-11 w-11 place-items-center rounded-full border border-foreground/10 disabled:opacity-30" data-player="prev">
                <Prev className="h-5 w-5" />
              </button>
              <button type="button" onClick={toggle} aria-label={status === "playing" ? t("Pause", "إيقاف مؤقت") : t("Play", "تشغيل")} className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm" data-player="toggle">
                {status === "loading" ? <Loader2 className="h-6 w-6 animate-spin" /> : status === "playing" ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </button>
              <button type="button" onClick={() => step(nextSurah(surah))} disabled={!nextSurah(surah)} aria-label={t("Next surah", "السورة التالية")} className="grid h-11 w-11 place-items-center rounded-full border border-foreground/10 disabled:opacity-30" data-player="next">
                <Next className="h-5 w-5" />
              </button>
            </div>
            {status === "error" && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-[12px] text-destructive">
                {t("Couldn't play the recitation. Check your connection and try again.", "تعذّر تشغيل التلاوة. تحقّق من الاتصال ثم أعد المحاولة.")}
              </p>
            )}
          </div>
        </SettingsGroup>

        {/* Reciters */}
        <SettingsSection id="reciters-list" title={t("Reciters", "القرّاء")}>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-foreground/40" />
            <Input value={reciterQuery} onChange={(e) => setReciterQuery(e.target.value)} placeholder={t("Search reciters…", "ابحث عن قارئ…")} className="ps-11" data-search="reciters" />
          </div>
          <SettingsGroup>
            {reciters.length === 0 && <p className="px-4 py-4 text-body-sm text-foreground/60">{t("No reciter matches.", "لا يوجد قارئ مطابق.")}</p>}
            {reciters.map((r) => {
              const active = r.id === reciterId;
              const fav = favs.includes(r.id);
              return (
                <div key={r.id} className="flex items-center" data-reciter={r.id}>
                  <button type="button" onClick={() => chooseReciter(r.id)} role="radio" aria-checked={active} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-start">
                    <span className="grid h-6 w-6 shrink-0 place-items-center" aria-hidden>{active && <Check className="h-5 w-5 text-primary" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-body font-medium", active && "text-primary")}>{t(r.nameEn, r.name)}</span>
                      {r.rewaya && <span className="block text-caption text-foreground/55">{r.rewaya}</span>}
                    </span>
                  </button>
                  <button type="button" onClick={() => setFavs(toggleFavorite(r.id))} aria-label={t("Favorite", "مفضل")} aria-pressed={fav} className="me-3 grid h-10 w-10 place-items-center" data-fav={r.id}>
                    <Star className={cn("h-5 w-5", fav ? "fill-[hsl(var(--elite-gold-start))] text-[hsl(var(--elite-gold-start))]" : "text-foreground/35")} />
                  </button>
                </div>
              );
            })}
          </SettingsGroup>
        </SettingsSection>

        {/* Surahs */}
        <SettingsSection
          id="reciters-surahs"
          title={t("Surahs", "السور")}
          footer={t("Recitations are streamed from mp3quran.net.", "التلاوات تُبث من mp3quran.net.")}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-foreground/40" />
            <Input value={surahQuery} onChange={(e) => setSurahQuery(e.target.value)} placeholder={t("Search surahs…", "ابحث عن سورة…")} className="ps-11" data-search="surahs" />
          </div>
          <SettingsGroup>
            {surahs.map((s) => (
              <button key={s.n} type="button" onClick={() => { resumeAt.current = 0; void play(s.n); }} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-start" data-surah={s.n}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-caption font-bold tabular-nums">{s.n}</span>
                <span className={cn("min-w-0 flex-1 truncate text-body font-medium", s.n === surah && "text-primary")}>{lang === "ar" ? s.ar : s.en}</span>
                <span className="shrink-0 text-caption text-foreground/50">{t(`${s.ayahs} ayahs`, `${s.ayahs} آية`)}</span>
              </button>
            ))}
          </SettingsGroup>
        </SettingsSection>
      </div>
    </PageShell>
  );
}
