// Cron-triggered every minute. Computes prayer times for each subscription
// and sends a Web Push notification when the current minute matches:
// - main athan time
// - pre-reminder (configurable minutes before)
// - dhikr reminder (configurable minutes before)
// - midnight / last third of the night (if night_alerts enabled)
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { Coordinates, CalculationMethod, PrayerTimes, SunnahTimes } from "npm:adhan@4.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@techsnds.com";
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const PRAYERS: Array<{ key: string; ar: string; en: string }> = [
  { key: "fajr",    ar: "الفجر",    en: "Fajr" },
  { key: "dhuhr",   ar: "الظهر",    en: "Dhuhr" },
  { key: "asr",     ar: "العصر",    en: "Asr" },
  { key: "maghrib", ar: "المغرب",   en: "Maghrib" },
  { key: "isha",    ar: "العشاء",   en: "Isha" },
];

function sameMinute(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) < 60_000 &&
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate() &&
    a.getUTCHours() === b.getUTCHours() &&
    a.getUTCMinutes() === b.getUTCMinutes();
}

interface Sub {
  endpoint: string; p256dh: string; auth: string;
  lat: number; lng: number; tz: string; lang: string;
  enabled: boolean; pre_reminder_minutes: number;
  dhikr_reminder_minutes: number; night_alerts: boolean;
}

function athanSoundUrl(prayerKey: string): string {
  // Fajr gets a distinct softer athan; others use the standard Makkah recording.
  if (prayerKey === "fajr") return "https://www.islamcan.com/audio/adhan/azan2.mp3";
  return "https://www.islamcan.com/audio/adhan/azan3.mp3";
}

function buildPayload(kind: string, sub: Sub, prayer?: { ar: string; en: string; key?: string }, mins = 0) {
  const ar = sub.lang === "ar";
  if (kind === "athan") {
    return {
      title: ar ? `حان الآن وقت صلاة ${prayer!.ar}` : `It's time for ${prayer!.en}`,
      body: ar ? "حيّ على الصلاة، حيّ على الفلاح" : "Hayya 'ala-s-salah",
      tag: `athan-${prayer!.en.toLowerCase()}`,
      soundUrl: athanSoundUrl(prayer!.key || prayer!.en.toLowerCase()),
      lang: sub.lang,
    };
  }
  if (kind === "pre") {
    return {
      title: ar ? `تذكير: ${prayer!.ar} بعد ${mins} دقيقة` : `Reminder: ${prayer!.en} in ${mins} min`,
      body: ar ? "استعد لأداء الصلاة" : "Prepare for prayer",
      tag: `pre-${prayer!.en.toLowerCase()}`,
      lang: sub.lang,
    };
  }
  if (kind === "dhikr") {
    return {
      title: ar ? "اذكر الله" : "Remember Allah",
      body: ar ? `${prayer!.ar} بعد ${mins} دقيقة — سبحان الله وبحمده` : `${prayer!.en} in ${mins} min — Subhan Allah`,
      tag: `dhikr-${prayer!.en.toLowerCase()}`,
      lang: sub.lang,
    };
  }
  if (kind === "midnight") {
    return {
      title: ar ? "منتصف الليل" : "Middle of the Night",
      body: ar ? "وقت قيام الليل والدعاء" : "Time for Qiyam al-Layl",
      tag: "midnight",
      lang: sub.lang,
    };
  }
  // lastThird
  return {
    title: ar ? "الثلث الأخير من الليل" : "Last Third of the Night",
    body: ar ? "ساعة الإجابة — لا تنسَ الوتر والاستغفار" : "Hour of acceptance — don't forget Witr",
    tag: "last-third",
    lang: sub.lang,
  };
}

async function sendPush(sub: Sub, payload: object): Promise<{ ok: boolean; gone?: boolean }> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 },
    );
    return { ok: true };
  } catch (e: any) {
    const code = e?.statusCode;
    if (code === 404 || code === 410) return { ok: false, gone: true };
    console.error("push error", code, e?.body || e?.message);
    return { ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const isTest = url.searchParams.get("test") === "1";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("enabled", true);
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  if (isTest) {
    let sent = 0;
    const gone: string[] = [];
    for (const sub of (subs || []) as Sub[]) {
      const ar = sub.lang === "ar";
      const payload = {
        title: ar ? "تنبيه تجريبي ✅" : "Test notification ✅",
        body: ar ? "وصلك إشعار Push بنجاح" : "Push notifications are working",
        tag: "test",
        lang: sub.lang,
      };
      const r = await sendPush(sub, payload);
      if (r.ok) sent++;
      if (r.gone) gone.push(sub.endpoint);
    }
    if (gone.length) await supabase.from("push_subscriptions").delete().in("endpoint", gone);
    return Response.json({ test: true, total: subs?.length || 0, sent, removed: gone.length }, { headers: corsHeaders });
  }

  const now = new Date();
  let sent = 0;
  const goneEndpoints: string[] = [];

  for (const sub of (subs || []) as Sub[]) {
    const coords = new Coordinates(sub.lat, sub.lng);
    const params = CalculationMethod.UmmAlQura();
    const today = new PrayerTimes(coords, now, params);
    const sunnah = new SunnahTimes(today);

    const checks: Array<{ when: Date; payload: object }> = [];
    for (const p of PRAYERS) {
      const t: Date = (today as any)[p.key];
      checks.push({ when: t, payload: buildPayload("athan", sub, p) });
      if (sub.pre_reminder_minutes > 0) {
        checks.push({
          when: new Date(t.getTime() - sub.pre_reminder_minutes * 60_000),
          payload: buildPayload("pre", sub, p, sub.pre_reminder_minutes),
        });
      }
      if (sub.dhikr_reminder_minutes > 0) {
        checks.push({
          when: new Date(t.getTime() - sub.dhikr_reminder_minutes * 60_000),
          payload: buildPayload("dhikr", sub, p, sub.dhikr_reminder_minutes),
        });
      }
    }
    if (sub.night_alerts) {
      checks.push({ when: sunnah.middleOfTheNight, payload: buildPayload("midnight", sub) });
      checks.push({ when: sunnah.lastThirdOfTheNight, payload: buildPayload("lastThird", sub) });
    }

    for (const c of checks) {
      if (sameMinute(c.when, now)) {
        const r = await sendPush(sub, c.payload);
        if (r.ok) sent++;
        if (r.gone) goneEndpoints.push(sub.endpoint);
      }
    }
  }

  if (goneEndpoints.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", goneEndpoints);
  }

  return Response.json({ checked: subs?.length || 0, sent, removed: goneEndpoints.length }, { headers: corsHeaders });
});
