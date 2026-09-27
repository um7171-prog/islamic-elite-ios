import { ATHKAR_LISTS, type AthkarListKey } from "@/lib/athkarProgress";
import type { DayContext } from "./context";
import type { AthkarDayProgress, QuranProgress } from "./sources";
import { minutesTextAr } from "./format";
import type { LocalizedText } from "./types";

/**
 * ONE suggestion for right now, chosen from the day context and the user's real progress. It only
 * points to content that exists in the app (the Mushaf, its Athkar lists, a session, the prayer
 * times) and never states a ruling — it says what is available, not what is required.
 */
export type SuggestionKind =
  | "resume-session"
  | "prayer-time"
  | "prayer-soon"
  | "athkar"
  | "continue"
  | "quran"
  | "session";

export interface Suggestion {
  kind: SuggestionKind;
  title: LocalizedText;
  body: LocalizedText;
  action: LocalizedText;
  route: string;
}

export interface SuggestionInput {
  context: DayContext;
  quran: QuranProgress | null;
  athkarToday: AthkarDayProgress[];
}

const athkarSuggestion = (list: AthkarListKey, p: AthkarDayProgress | undefined): Suggestion => ({
  kind: "athkar",
  title: { ar: ATHKAR_LISTS[list].ar, en: ATHKAR_LISTS[list].en },
  body: p && p.started
    ? { ar: `أنجزت ${p.done} من ${p.total} اليوم`, en: `${p.done} of ${p.total} done today` }
    : { ar: "من أذكار التطبيق، مع عدّاد يحفظ تقدمك", en: "From the app's Athkar, with a counter that keeps your place" },
  action: { ar: "افتح الأذكار", en: "Open Athkar" },
  route: `/athkar?list=${list}`,
});

const quranSuggestion = (q: QuranProgress | null): Suggestion => ({
  kind: "quran",
  title: { ar: "ابدأ وردك", en: "Start your reading" },
  body: q
    ? { ar: `تابع من صفحة ${q.page} — ${q.surahAr}`, en: `Continue from page ${q.page} — ${q.surahEn}` }
    : { ar: "افتح المصحف من أوله أو اختر سورة", en: "Open the Mushaf or pick a surah" },
  action: { ar: "افتح المصحف", en: "Open Mushaf" },
  route: q ? "/mushaf" : "/quran",
});

const sessionSuggestion: Suggestion = {
  kind: "session",
  title: { ar: "جلسة الآن", en: "Session now" },
  body: { ar: "اختر وقتًا قصيرًا: قرآن وذكر من محتوى التطبيق", en: "Pick a short time: Quran and dhikr from the app" },
  action: { ar: "ابدأ جلسة", en: "Start a session" },
  route: "/session",
};

export function suggestNow({ context: c, quran, athkarToday }: SuggestionInput): Suggestion {
  const athkar = (list: AthkarListKey) => athkarToday.find((a) => a.list === list);
  const unfinishedAthkar = (list: AthkarListKey) => {
    const p = athkar(list);
    return !p || p.done < p.total;
  };

  if (c.activeSession) {
    const s = c.activeSession;
    return {
      kind: "resume-session",
      title: { ar: "أكمل جلستك", en: "Continue your session" },
      body: { ar: `الجزء ${s.currentStep + 1} من ${s.steps.length}`, en: `Part ${s.currentStep + 1} of ${s.steps.length}` },
      action: { ar: "متابعة", en: "Continue" },
      route: "/session",
    };
  }

  if (c.phase === "prayer-time" && c.currentPrayer) {
    return {
      kind: "prayer-time",
      title: { ar: `دخل وقت ${c.currentPrayer.nameAr}`, en: `${c.currentPrayer.nameEn} time has begun` },
      body: { ar: `منذ ${minutesTextAr(Math.max(1, c.minutesSinceCurrent ?? 0))}`, en: `${Math.max(1, c.minutesSinceCurrent ?? 0)} min ago` },
      action: { ar: "مواقيت الصلاة", en: "Prayer times" },
      route: "/prayer-times",
    };
  }

  if (c.phase === "before-prayer" && c.nextPrayer && c.minutesToNext !== null) {
    return {
      kind: "prayer-soon",
      title: { ar: "اقتربت الصلاة", en: "Prayer is near" },
      body: { ar: `متبقي ${minutesTextAr(Math.max(1, c.minutesToNext))} على ${c.nextPrayer.nameAr}`, en: `${c.nextPrayer.nameEn} in ${Math.max(1, c.minutesToNext)} min` },
      action: { ar: "مواقيت الصلاة", en: "Prayer times" },
      route: "/prayer-times",
    };
  }

  if (c.phase === "after-prayer" && unfinishedAthkar("post-prayer")) return athkarSuggestion("post-prayer", athkar("post-prayer"));

  if (c.unfinished) {
    return {
      kind: "continue",
      title: { ar: "أكمل من حيث توقفت", en: "Pick up where you left off" },
      body: c.unfinished.title,
      action: { ar: "متابعة", en: "Continue" },
      route: c.unfinished.route,
    };
  }

  switch (c.period) {
    case "dawn":
      return quranSuggestion(quran);
    case "morning":
      return unfinishedAthkar("morning") ? athkarSuggestion("morning", athkar("morning")) : quranSuggestion(quran);
    case "afternoon":
    case "evening":
      if (unfinishedAthkar("evening")) return athkarSuggestion("evening", athkar("evening"));
      break;
    case "night":
    case "late-night":
      if (unfinishedAthkar("sleep")) return athkarSuggestion("sleep", athkar("sleep"));
      break;
    default:
      break;
  }
  return sessionSuggestion;
}

/** The Athkar list a new session's dhikr part starts with, from the time of day. */
export function sessionDhikrList(c: DayContext): AthkarListKey {
  if (c.phase === "prayer-time" || c.phase === "after-prayer") return "post-prayer";
  if (c.period === "dawn" || c.period === "morning") return "morning";
  if (c.period === "afternoon" || c.period === "evening") return "evening";
  if (c.period === "night" || c.period === "late-night") return "sleep";
  return "post-prayer";
}
