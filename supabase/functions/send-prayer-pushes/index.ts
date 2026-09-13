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

// Shared secret required on every invocation (legitimate cron call AND ?test=1).
// Configure it as an Edge Function secret named CRON_SECRET, then make the cron
// trigger send it back as the `x-cron-secret` request header. See README.md.
const CRON_SECRET = Deno.env.get("CRON_SECRET");

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

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

/**
 * Atomically claims the right to send `tag` to `endpoint` for the UTC minute of
 * `when`. Returns false if another invocation (overlapping/retried cron run)
 * already claimed it, so the same prayer/reminder is never pushed twice.
 */
async function claimSend(
  supabase: ReturnType<typeof createClient>,
  endpoint: string,
  tag: string,
  when: Date,
): Promise<boolean> {
  const minuteBucket = when.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const { error } = await supabase
    .from("push_send_log")
    .insert({ endpoint, tag, minute_bucket: minuteBucket });
  if (error) {
    if (error.code === "23505") return false; // already claimed — duplicate, skip
    console.error("dedupe claim failed, skipping to be safe", error.message);
    return false;
  }
  return true;
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

  // Fail closed: if the secret isn't configured, refuse every call instead of
  // silently allowing unauthenticated broadcasts.
  if (!CRON_SECRET) {
    console.error("CRON_SECRET is not configured for send-prayer-pushes");
    return Response.json({ error: "server misconfigured" }, { status: 500, headers: corsHeaders });
  }
  const provided = req.headers.get("x-cron-secret") || "";
  if (!timingSafeEqual(provided, CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const isTest = url.searchParams.get("test") === "1";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Housekeeping: prune old dedupe rows once an hour rather than every minute.
  if (new Date().getUTCMinutes() === 0) {
    const cutoff = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
    await supabase.from("push_send_log").delete().lt("sent_at", cutoff);
  }

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

    const checks: Array<{ when: Date; tag: string; payload: object }> = [];
    for (const p of PRAYERS) {
      const t: Date = (today as any)[p.key];
      const athanPayload = buildPayload("athan", sub, p);
      checks.push({ when: t, tag: (athanPayload as { tag: string }).tag, payload: athanPayload });
      if (sub.pre_reminder_minutes > 0) {
        const prePayload = buildPayload("pre", sub, p, sub.pre_reminder_minutes);
        checks.push({
          when: new Date(t.getTime() - sub.pre_reminder_minutes * 60_000),
          tag: (prePayload as { tag: string }).tag,
          payload: prePayload,
        });
      }
      if (sub.dhikr_reminder_minutes > 0) {
        const dhikrPayload = buildPayload("dhikr", sub, p, sub.dhikr_reminder_minutes);
        checks.push({
          when: new Date(t.getTime() - sub.dhikr_reminder_minutes * 60_000),
          tag: (dhikrPayload as { tag: string }).tag,
          payload: dhikrPayload,
        });
      }
    }
    if (sub.night_alerts) {
      const midnightPayload = buildPayload("midnight", sub);
      const lastThirdPayload = buildPayload("lastThird", sub);
      checks.push({ when: sunnah.middleOfTheNight, tag: (midnightPayload as { tag: string }).tag, payload: midnightPayload });
      checks.push({ when: sunnah.lastThirdOfTheNight, tag: (lastThirdPayload as { tag: string }).tag, payload: lastThirdPayload });
    }

    for (const c of checks) {
      if (sameMinute(c.when, now)) {
        const claimed = await claimSend(supabase, sub.endpoint, c.tag, c.when);
        if (!claimed) continue; // already sent this exact reminder this minute
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
