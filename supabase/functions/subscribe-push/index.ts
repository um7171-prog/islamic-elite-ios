import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function decodeVapidPublicKey(raw: string): Uint8Array | null {
  try {
    const clean = raw.replace(/\s+/g, "").replace(/=+$/, "");
    const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.length === 65 && bytes[0] === 0x04 ? bytes : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "publicKey") {
      const raw = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      // Strip whitespace/newlines and any accidental padding to keep base64url valid.
      const publicKey = raw.replace(/\s+/g, "").replace(/=+$/, "");
      const decoded = decodeVapidPublicKey(publicKey);
      if (!decoded) {
        return Response.json({ error: "VAPID_PUBLIC_KEY is not a valid P-256 public key" }, { status: 500, headers: corsHeaders });
      }
      try {
        await crypto.subtle.importKey("raw", decoded, { name: "ECDH", namedCurve: "P-256" }, false, []);
      } catch {
        return Response.json({ error: "VAPID_PUBLIC_KEY is not a valid P-256 public key" }, { status: 500, headers: corsHeaders });
      }
      return Response.json({ publicKey }, { headers: corsHeaders });
    }

    if (action === "subscribe") {
      const { subscription, lat, lng, tz, lang, settings, user_agent } = body;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return Response.json({ error: "invalid subscription" }, { status: 400, headers: corsHeaders });
      }
      if (typeof lat !== "number" || typeof lng !== "number") {
        return Response.json({ error: "lat/lng required" }, { status: 400, headers: corsHeaders });
      }
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert({
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          lat, lng,
          tz: tz || "Asia/Riyadh",
          lang: lang || "ar",
          enabled: true,
          pre_reminder_minutes: Number(settings?.preReminderMinutes ?? 0),
          dhikr_reminder_minutes: Number(settings?.dhikrReminderMinutes ?? 0),
          night_alerts: !!settings?.nightAlertsEnabled,
          user_agent: user_agent || null,
        }, { onConflict: "endpoint" });
      if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "unsubscribe") {
      const { endpoint } = body;
      if (!endpoint) return Response.json({ error: "endpoint required" }, { status: 400, headers: corsHeaders });
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return Response.json({ error: "unknown action" }, { status: 400, headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500, headers: corsHeaders });
  }
});
