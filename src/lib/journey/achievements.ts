import type { JourneyState } from "./types";

export interface Achievement {
  id: string;
  ar: string;
  en: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function activityDays(state: JourneyState): Set<string> {
  const days = new Set<string>();
  for (const a of state.activities) days.add(dayKey(a.updatedAt));
  for (const s of state.sessions) {
    days.add(dayKey(s.startedAt));
    if (s.completedAt) days.add(dayKey(s.completedAt));
  }
  return days;
}

function currentStreak(state: JourneyState, now = Date.now()): number {
  const days = activityDays(state);
  const today = new Date(now);
  let streak = 0;
  for (let i = 0; i < 366; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (!days.has(dayKey(d.getTime()))) break;
    streak += 1;
  }
  return streak;
}

export function getAchievements(state: JourneyState, now = Date.now()): Achievement[] {
  const completedSessions = state.sessions.filter((s) => s.status === "completed").length;
  const completedAthkar = state.activities.filter((a) => a.type === "dhikr" && a.status === "completed").length;
  const quranStarted = state.activities.some((a) => a.type === "quran");
  const namesStarted = state.cursors.names > 0 || state.activities.some((a) => a.type === "names");
  const streak = currentStreak(state, now);

  return [
    {
      id: "first-session",
      ar: "أول جلسة",
      en: "First session",
      descriptionAr: "أتمم أول جلسة من «جلسة الآن».",
      descriptionEn: "Complete your first Session now.",
      icon: "⏱️",
      unlocked: completedSessions >= 1,
      progress: Math.min(completedSessions, 1),
      target: 1,
    },
    {
      id: "five-sessions",
      ar: "رفيق الاستمرار",
      en: "Keep going",
      descriptionAr: "أتمم 5 جلسات.",
      descriptionEn: "Complete 5 sessions.",
      icon: "🔥",
      unlocked: completedSessions >= 5,
      progress: Math.min(completedSessions, 5),
      target: 5,
    },
    {
      id: "first-quran",
      ar: "خطوة مع القرآن",
      en: "First step with Quran",
      descriptionAr: "افتح المصحف وابدأ رحلتك معه.",
      descriptionEn: "Open the Mushaf and begin your journey.",
      icon: "📖",
      unlocked: quranStarted,
      progress: quranStarted ? 1 : 0,
      target: 1,
    },
    {
      id: "first-athkar",
      ar: "أول إنجاز في الأذكار",
      en: "First Athkar milestone",
      descriptionAr: "أكمل قائمة أذكار كاملة.",
      descriptionEn: "Complete an Athkar list.",
      icon: "🤲",
      unlocked: completedAthkar >= 1,
      progress: Math.min(completedAthkar, 1),
      target: 1,
    },
    {
      id: "names-started",
      ar: "مع أسماء الله الحسنى",
      en: "With the Names of Allah",
      descriptionAr: "ابدأ التقدم في أسماء الله الحسنى.",
      descriptionEn: "Start progressing through the Names of Allah.",
      icon: "✨",
      unlocked: namesStarted,
      progress: namesStarted ? 1 : 0,
      target: 1,
    },
    {
      id: "seven-day-streak",
      ar: "أسبوع من الاستمرار",
      en: "Seven-day streak",
      descriptionAr: "استخدم أنشطة النخبة 7 أيام متتالية.",
      descriptionEn: "Use Elite activities for 7 consecutive days.",
      icon: "🏆",
      unlocked: streak >= 7,
      progress: Math.min(streak, 7),
      target: 7,
    },
  ];
}

export function getCurrentStreak(state: JourneyState, now = Date.now()): number {
  return currentStreak(state, now);
}
