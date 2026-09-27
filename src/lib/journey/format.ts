import type { JourneyActivity, LocalizedText } from "./types";

/** "دقيقة واحدة" / "دقيقتان" / "5 دقائق" / "12 دقيقة". */
export function minutesTextAr(n: number): string {
  if (n === 1) return "دقيقة واحدة";
  if (n === 2) return "دقيقتان";
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

function hoursTextAr(n: number): string {
  if (n === 1) return "ساعة";
  if (n === 2) return "ساعتان";
  if (n >= 3 && n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}

/** A remaining time in minutes as words: "ساعتان و15 دقيقة" / "2 h 15 min". */
export function durationText(totalMinutes: number): LocalizedText {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return { ar: minutesTextAr(Math.max(1, r)), en: `${Math.max(1, r)} min` };
  if (r === 0) return { ar: hoursTextAr(h), en: `${h} h` };
  return { ar: `${hoursTextAr(h)} و${minutesTextAr(r)}`, en: `${h} h ${r} min` };
}

/** The activity's real progress in words (from its own recorded numbers), or null when it has none. */
export function activityProgressText(a: JourneyActivity): LocalizedText | null {
  const m = a.metadata;
  if (a.type === "quran" && typeof m.page === "number") return { ar: `صفحة ${m.page} من 604`, en: `Page ${m.page} of 604` };
  if (a.type === "dhikr" && typeof m.done === "number" && typeof m.total === "number") {
    return { ar: `${m.done} من ${m.total}`, en: `${m.done} of ${m.total}` };
  }
  if (a.type === "session" && typeof m.stepsDone === "number" && typeof m.steps === "number") {
    return a.status === "completed"
      ? { ar: "مكتملة", en: "Completed" }
      : { ar: `الجزء ${Math.min(m.steps, m.stepsDone + 1)} من ${m.steps}`, en: `Part ${Math.min(m.steps, m.stepsDone + 1)} of ${m.steps}` };
  }
  return null;
}
