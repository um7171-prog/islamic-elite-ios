import type { PrayerEntry } from "./prayer";
import type { SunnahTimes } from "adhan";
import {
  AthanSettings,
  firedKey,
  soundUrl,
  todayISO,
  type ExtraAlertKind,
} from "./athanSettings";

export async function requestAthanPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

export async function testAthanNotification(
  lang: "en" | "ar",
  sound: AthanSettings["soundFajr"] = "makkah",
): Promise<{ ok: boolean; reason?: string }> {
  if (typeof Notification === "undefined") return { ok: false, reason: "unsupported" };
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };
  const title = lang === "ar" ? "تجربة الأذان" : "Athan test";
  const body = lang === "ar" ? "هذا تنبيه تجريبي — يعمل التنبيه بشكل صحيح" : "This is a test alert — notifications are working";
  try {
    new Notification(title, { body, tag: "athan-test", lang: lang === "ar" ? "ar" : "en" });
  } catch {
    return { ok: false, reason: "error" };
  }
  play(sound);
  return { ok: true };
}


export interface ScheduleHandle {
  cancel: () => void;
  scheduledCount: number;
}

interface ScheduleOptions {
  entries: PrayerEntry[];
  settings: AthanSettings;
  lang: "en" | "ar";
  sunnah?: SunnahTimes | null;
  now?: Date;
}

const PRAYER_KEYS = new Set(["fajr", "dhuhr", "asr", "maghrib", "isha"]);

export function getAthanEnvironment() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(typeof window !== "undefined" && (window as any).MSStream);
  const isStandalone =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && (navigator as any).standalone === true);
  return {
    origin,
    isIOS,
    isStandalone,
    isSecure: typeof window !== "undefined" ? window.isSecureContext : false,
    supported: typeof Notification !== "undefined",
    customDomainReady: origin === "https://www.techsnds.com" || origin === "https://techsnds.com" || origin.endsWith(".lovable.app"),
  };
}

function bodyFor(nameEn: string, nameAr: string, lang: "en" | "ar", pre: boolean, mins: number): { title: string; body: string } {
  if (lang === "ar") {
    return pre
      ? { title: `تذكير: ${nameAr} بعد ${mins} دقيقة`, body: "استعد لأداء الصلاة" }
      : { title: `حان الآن وقت صلاة ${nameAr}`, body: "حيّ على الصلاة، حيّ على الفلاح" };
  }
  return pre
    ? { title: `Reminder: ${nameEn} in ${mins} min`, body: "Prepare for prayer" }
    : { title: `It's time for ${nameEn}`, body: "Hayya 'ala-s-salah" };
}

function extraBody(kind: ExtraAlertKind, lang: "en" | "ar", mins: number, prayerAr: string, prayerEn: string) {
  if (lang === "ar") {
    if (kind === "dhikr") return { title: "اذكر الله", body: `${prayerAr} بعد ${mins} دقيقة — سبحان الله وبحمده` };
    if (kind === "midnight") return { title: "منتصف الليل", body: "وقت قيام الليل والدعاء" };
    return { title: "الثلث الأخير من الليل", body: "ساعة الإجابة — لا تنسَ الوتر والاستغفار" };
  }
  if (kind === "dhikr") return { title: "Remember Allah", body: `${prayerEn} in ${mins} min — Subhan Allah` };
  if (kind === "midnight") return { title: "Middle of the Night", body: "Time for Qiyam al-Layl" };
  return { title: "Last Third of the Night", body: "Hour of acceptance — don't forget Witr" };
}

function play(soundName: AthanSettings["soundFajr"]) {
  const url = soundUrl(soundName);
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.85;
    void audio.play().catch(() => {});
  } catch {}
}

function speakDhikr(lang: "en" | "ar") {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(lang === "ar" ? "اذكر الله" : "Remember Allah");
    u.lang = lang === "ar" ? "ar-SA" : "en-US";
    u.rate = 0.9;
    u.volume = 0.95;
    synth.cancel();
    synth.speak(u);
  } catch {}
}

function softChime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(660, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.2);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 1.5);
  } catch {}
}

export function scheduleAthan({ entries, settings, lang, sunnah = null, now = new Date() }: ScheduleOptions): ScheduleHandle {
  const timers: number[] = [];
  if (!settings.enabled) return { cancel: () => {}, scheduledCount: 0 };
  if (settings.mutedDates.includes(todayISO(now))) return { cancel: () => {}, scheduledCount: 0 };
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return { cancel: () => {}, scheduledCount: 0 };
  }

  const fire = (entry: PrayerEntry, pre: boolean) => {
    const k = firedKey(now, entry.key, pre ? "pre" : "athan");
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
    const sound = entry.key === "fajr" ? settings.soundFajr : settings.soundOther;
    const { title, body } = bodyFor(entry.nameEn, entry.nameAr, lang, pre, settings.preReminderMinutes);
    try {
      new Notification(title, { body, tag: k, lang: lang === "ar" ? "ar" : "en" });
    } catch {}
    if (!pre) play(sound);
  };

  const fireExtra = (kind: ExtraAlertKind, prayerAr = "", prayerEn = "", mins = 0) => {
    const k = firedKey(now, kind, "extra");
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
    const { title, body } = extraBody(kind, lang, mins, prayerAr, prayerEn);
    try {
      new Notification(title, { body, tag: k, lang: lang === "ar" ? "ar" : "en" });
    } catch {}
    if (kind === "dhikr") speakDhikr(lang);
    else softChime();
  };

  const scheduleAt = (when: number, fn: () => void) => {
    const delay = when - now.getTime();
    if (delay > 0 && delay < 24 * 3600 * 1000) {
      const id = window.setTimeout(fn, delay);
      timers.push(id);
    }
  };

  for (const entry of entries) {
    if (!PRAYER_KEYS.has(entry.key)) continue;
    if (settings.perPrayerEnabled && settings.perPrayerEnabled[entry.key] === false) continue;
    const t = entry.time.getTime();

    scheduleAt(t, () => fire(entry, false));

    if (settings.preReminderMinutes > 0) {
      scheduleAt(t - settings.preReminderMinutes * 60_000, () => fire(entry, true));
    }

    if (settings.dhikrReminderMinutes > 0) {
      scheduleAt(t - settings.dhikrReminderMinutes * 60_000, () =>
        fireExtra("dhikr", entry.nameAr, entry.nameEn, settings.dhikrReminderMinutes),
      );
    }
  }

  if (settings.nightAlertsEnabled && sunnah) {
    scheduleAt(sunnah.middleOfTheNight.getTime(), () => fireExtra("midnight"));
    scheduleAt(sunnah.lastThirdOfTheNight.getTime(), () => fireExtra("lastThird"));
  }

  return {
    cancel: () => timers.forEach(clearTimeout),
    scheduledCount: timers.length,
  };
}
