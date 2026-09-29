import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Loader2, Mic, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { Segmented, SettingsGroup, SettingsSection } from "@/components/site/SettingsUI";
import { SEO } from "@/components/SEO";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SURAHS } from "@/lib/mushafData";
import { getSurah } from "@/lib/quran";
import type { QuranAyah } from "@/lib/quran";
import { ayahUrl, getReciter, getSelectedReciterId } from "@/lib/reciters";
import {
  deleteSession, loadSessions, practiceStats, saveSession, surahLevel, validRange,
  type MemorizationLevel, type PracticeMode, type PracticeSession, type SelfRating,
} from "@/lib/recitePractice";

type T = (en: string, ar: string) => string;

const levelLabel = (l: MemorizationLevel, t: T) =>
  ({ "not-started": t("Not started", "لم يبدأ"), learning: t("Learning", "قيد الحفظ"), "needs-review": t("Needs review", "يحتاج مراجعة"), memorized: t("Memorized", "محفوظة") })[l];

/**
 * «القراءة مع المعلم» — phase 1: self-practice (see src/lib/recitePractice.ts). Honest about it:
 * no teacher, no upload, the recording never leaves the device and is not kept after the session.
 */
export default function RecitePage() {
  const { t, lang } = useLocale();
  const [sessions, setSessions] = useState<PracticeSession[]>(() => loadSessions());
  const [surah, setSurah] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(SURAHS[0].ayahs);
  const [mode, setMode] = useState<PracticeMode>("memorize");
  const [ayahs, setAyahs] = useState<QuranAyah[] | null>(null);
  const [rating, setRating] = useState<SelfRating | null>(null);
  const [notes, setNotes] = useState("");

  const meta = SURAHS[surah - 1];
  const rangeOk = validRange(surah, from, to);
  const stats = useMemo(() => practiceStats(sessions), [sessions]);

  // The surah's text (local, licensed KFGQPC data) for the chosen range.
  useEffect(() => {
    let alive = true;
    setAyahs(null);
    void getSurah(surah).then((s) => { if (alive) setAyahs(s?.ayahs ?? []); });
    return () => { alive = false; };
  }, [surah]);

  const chooseSurah = (n: number) => { setSurah(n); setFrom(1); setTo(SURAHS[n - 1].ayahs); };
  const shown = (ayahs ?? []).filter((a) => a.ayah >= from && a.ayah <= to);

  const listen = useReferencePlayer();
  const rec = useRecorder();

  const save = () => {
    if (!rangeOk || !rating) return;
    saveSession({ surah, fromAyah: from, toAyah: to, mode, rating, recordedSeconds: rec.seconds, notes });
    setSessions(loadSessions());
    setRating(null);
    setNotes("");
    rec.reset();
    toast.success(t("Session saved", "تم حفظ الجلسة"));
  };

  return (
    <PageShell titleAr="القراءة مع المعلم" titleEn="Recite with a Teacher" fallback="/more">
      <SEO
        title={t("Recitation practice — Elite Islamic", "القراءة مع المعلم — النخبة الإسلامية")}
        description={t("Practise your recitation, record yourself and track your memorization.", "تدرّب على التلاوة، وسجّل قراءتك، وتابع حفظك.")}
        path="/recite"
        lang={lang === "ar" ? "ar" : "en"}
      />
      <div className="space-y-6" data-recite>
        <SettingsGroup className="p-4">
          <p className="text-body-sm leading-relaxed text-foreground/75" data-recite="notice">
            {t(
              "Self-practice for now: read, record yourself, listen back and rate your recitation. Review by a real teacher will come later — no teacher is connected yet.",
              "تدريب ذاتي حاليًا: اقرأ، وسجّل تلاوتك، واستمع إليها، ثم قيّم نفسك. مراجعة المعلم الحقيقي ستأتي لاحقًا، ولا يوجد معلم متصل حتى الآن.",
            )}
          </p>
        </SettingsGroup>

        <SettingsSection id="recite-stats" title={t("Your progress", "تقدّمك")}>
          <SettingsGroup className="grid grid-cols-2 divide-y-0 p-2">
            {[
              [t("Sessions", "الجلسات"), stats.sessions],
              [t("Memorized surahs", "سور محفوظة"), stats.memorized],
              [t("Need review", "تحتاج مراجعة"), stats.needsReview],
              [t("Day streak", "أيام متتالية"), stats.streakDays],
            ].map(([label, value]) => (
              <div key={String(label)} className="p-3 text-center" data-stat={String(label)}>
                <div className="font-display text-h3 font-bold tabular-nums text-primary">{value}</div>
                <div className="text-caption text-foreground/60">{label}</div>
              </div>
            ))}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection id="recite-setup" title={t("What will you recite?", "ماذا ستقرأ؟")}>
          <SettingsGroup className="space-y-3 p-4">
            <div>
              <label htmlFor="recite-surah" className="mb-1 block text-[12px] font-semibold">{t("Surah", "السورة")}</label>
              <select
                id="recite-surah"
                value={surah}
                onChange={(e) => chooseSurah(Number(e.target.value))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-body"
              >
                {SURAHS.map((s) => <option key={s.n} value={s.n}>{s.n}. {lang === "ar" ? s.ar : s.en}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="recite-from" className="mb-1 block text-[12px] font-semibold">{t("From ayah", "من الآية")}</label>
                <Input id="recite-from" type="number" inputMode="numeric" min={1} max={meta.ayahs} value={from} onChange={(e) => setFrom(Number(e.target.value))} dir="ltr" />
              </div>
              <div>
                <label htmlFor="recite-to" className="mb-1 block text-[12px] font-semibold">{t("To ayah", "إلى الآية")}</label>
                <Input id="recite-to" type="number" inputMode="numeric" min={1} max={meta.ayahs} value={to} onChange={(e) => setTo(Number(e.target.value))} dir="ltr" />
              </div>
            </div>
            {!rangeOk && <p role="alert" className="text-[12px] text-destructive">{t(`Choose ayahs between 1 and ${meta.ayahs}.`, `اختر آيات بين 1 و${meta.ayahs}.`)}</p>}
            <Segmented<PracticeMode>
              fullWidth
              value={mode}
              onChange={setMode}
              ariaLabel={t("Mode", "النوع")}
              options={[{ value: "memorize", label: t("Memorize", "حفظ") }, { value: "review", label: t("Review", "مراجعة") }]}
            />
          </SettingsGroup>
        </SettingsSection>

        {rangeOk && (
          <SettingsSection id="recite-text" title={t("Read", "اقرأ")}>
            <SettingsGroup className="p-4">
              {ayahs === null ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-foreground/50" /></div>
              ) : (
                <p dir="rtl" className="font-arabic text-[22px] leading-[2.2] text-foreground" data-recite="text">
                  {shown.map((a) => (
                    <span key={a.key}>{a.text} <span className="text-[16px] text-primary">﴿{a.ayah}﴾</span> </span>
                  ))}
                </p>
              )}
              <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => listen.toggle(surah, from, to)} data-recite="listen">
                {listen.playing ? <Square className="me-2 h-4 w-4" /> : <Headphones className="me-2 h-4 w-4" />}
                {listen.playing ? t("Stop", "إيقاف") : t(`Listen (${getReciter(getSelectedReciterId()).nameEn})`, `استمع (${getReciter(getSelectedReciterId()).name})`)}
              </Button>
              {listen.error && <p role="alert" className="mt-2 text-[12px] text-destructive">{t("Couldn't play the recitation. Check your connection.", "تعذّر تشغيل التلاوة. تحقّق من الاتصال.")}</p>}
            </SettingsGroup>
          </SettingsSection>
        )}

        {rangeOk && (
          <SettingsSection
            id="recite-record"
            title={t("Record yourself", "سجّل تلاوتك")}
            footer={t("Your recording stays on this device and is not kept after you leave this screen.", "تسجيلك يبقى على جهازك فقط، ولا يُحفظ بعد مغادرة هذه الشاشة.")}
          >
            <SettingsGroup className="space-y-3 p-4">
              {rec.supported ? (
                <Button type="button" onClick={rec.recording ? rec.stop : rec.start} className={cn("h-12 w-full text-base font-bold", rec.recording && "bg-destructive hover:bg-destructive/90")} data-recite="record">
                  {rec.recording ? <Square className="me-2 h-4 w-4" /> : <Mic className="me-2 h-4 w-4" />}
                  {rec.recording ? t(`Stop (${rec.seconds}s)`, `إيقاف (${rec.seconds} ث)`) : t("Start recording", "ابدأ التسجيل")}
                </Button>
              ) : (
                <p className="text-body-sm text-foreground/60">{t("Recording isn't available on this device.", "التسجيل غير متاح على هذا الجهاز.")}</p>
              )}
              {rec.error && <p role="alert" className="text-[12px] text-destructive">{rec.error === "denied" ? t("Microphone access was not allowed.", "لم يُسمح باستخدام الميكروفون.") : t("Couldn't record. Please try again.", "تعذّر التسجيل. حاول مرة أخرى.")}</p>}
              {rec.url && <audio controls src={rec.url} className="w-full" data-recite="playback" />}
            </SettingsGroup>
          </SettingsSection>
        )}

        {rangeOk && (
          <SettingsSection id="recite-rate" title={t("How did it go?", "كيف كانت تلاوتك؟")}>
            <SettingsGroup className="space-y-3 p-4">
              <div className="flex justify-between gap-2" role="radiogroup" aria-label={t("Rating", "التقييم")}>
                {([1, 2, 3, 4, 5] as SelfRating[]).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={rating === r} onClick={() => setRating(r)} data-rating={r}
                    className={cn("h-11 flex-1 rounded-xl border text-body font-bold tabular-nums", rating === r ? "border-primary bg-primary text-primary-foreground" : "border-foreground/10")}>
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-caption text-foreground/55">{t("1 = couldn't recite it · 5 = perfect from memory", "1 = لم أستطع · 5 = من الحفظ بلا خطأ")}</p>
              <Textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={t("Notes for yourself (optional)", "ملاحظات لنفسك (اختياري)")} rows={2} />
              <Button type="button" disabled={!rating} onClick={save} className="h-12 w-full text-base font-bold" data-recite="save">{t("Save session", "حفظ الجلسة")}</Button>
            </SettingsGroup>
          </SettingsSection>
        )}

        <SettingsSection id="recite-history" title={t("Your sessions", "جلساتك")}>
          <SettingsGroup>
            {sessions.length === 0 && <p className="px-4 py-4 text-body-sm text-foreground/60">{t("No sessions yet.", "لا توجد جلسات بعد.")}</p>}
            {sessions.slice(0, 30).map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3" data-session={s.id}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium">
                    {lang === "ar" ? SURAHS[s.surah - 1].ar : SURAHS[s.surah - 1].en} · {s.fromAyah}–{s.toAyah}
                  </div>
                  <div className="text-caption text-foreground/55">
                    {s.mode === "memorize" ? t("Memorize", "حفظ") : t("Review", "مراجعة")} · {t("rating", "التقييم")} {s.rating}/5 · {levelLabel(surahLevel(sessions, s.surah), t)} · {new Date(s.at).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB")}
                  </div>
                </div>
                <button type="button" aria-label={t("Delete", "حذف")} onClick={() => { deleteSession(s.id); setSessions(loadSessions()); }} className="grid h-10 w-10 place-items-center text-foreground/40">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </SettingsGroup>
        </SettingsSection>
      </div>
    </PageShell>
  );
}

/** Plays the chosen range ayah by ayah with the selected reciter (per-ayah files). */
function useReferencePlayer() {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const stop = () => { el.current?.pause(); setPlaying(false); };
  useEffect(() => () => el.current?.pause(), []);
  const toggle = (surah: number, from: number, to: number) => {
    if (playing) { stop(); return; }
    const audio = (el.current ??= new Audio());
    const reciter = getReciter(getSelectedReciterId());
    let ayah = from;
    setError(false);
    const playAyah = () => {
      audio.src = ayahUrl(reciter, surah, ayah);
      audio.play().then(() => setPlaying(true)).catch(() => { setError(true); setPlaying(false); });
    };
    audio.onended = () => { ayah += 1; if (ayah <= to) playAyah(); else setPlaying(false); };
    audio.onerror = () => { setError(true); setPlaying(false); };
    playAyah();
  };
  return { playing, error, toggle };
}

/** Records the user's voice with MediaRecorder; the result is an in-memory object URL only. */
function useRecorder() {
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<"denied" | "failed" | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds(Math.round((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [recording]);
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((tr) => tr.stop()); if (url) URL.revokeObjectURL(url); }, [url]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(new Blob(chunks, { type: r.mimeType || "audio/mp4" })); });
        setRecording(false);
      };
      recorder.current = r;
      started.current = Date.now();
      setSeconds(0);
      r.start();
      setRecording(true);
    } catch (e) {
      setError((e as Error)?.name === "NotAllowedError" ? "denied" : "failed");
    }
  };
  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
  const reset = () => { setUrl((old) => { if (old) URL.revokeObjectURL(old); return null; }); setSeconds(0); };
  return { supported, recording, seconds, url, error, start, stop, reset };
}
