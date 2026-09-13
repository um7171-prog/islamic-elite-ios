// Sends an admin announcement to every registered iOS device through APNs
// (token-based auth, HTTP/2). Athan alerts are LOCAL and never go through here.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.techsnds.islamicelite";
const APNS_HOST = (Deno.env.get("APNS_ENV") ?? "production") === "sandbox"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function apnsJwt(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(APNS_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return await create(
    { alg: "ES256", kid: APNS_KEY_ID, typ: "JWT" },
    { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
    key,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // --- Auth: admins only ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim();
    const message = String(body?.body ?? "").trim();
    const route = typeof body?.route === "string" && body.route ? body.route : "/";
    if (!title || title.length > 120) return json({ error: "invalid_title" }, 400);
    if (!message || message.length > 500) return json({ error: "invalid_body" }, 400);

    if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
      return json({ error: "apns_not_configured" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: tokens, error } = await admin
      .from("device_tokens")
      .select("token")
      .eq("enabled", true)
      .eq("platform", "ios");
    if (error) return json({ error: error.message }, 500);
    if (!tokens?.length) return json({ sent: 0, failed: 0, total: 0 });

    const jwt = await apnsJwt();
    const payload = JSON.stringify({
      aps: { alert: { title, body: message }, sound: "default", badge: 1 },
      route,
    });

    let sent = 0;
    let failed = 0;
    const invalid: string[] = [];

    for (let i = 0; i < tokens.length; i += 20) {
      const chunk = tokens.slice(i, i + 20);
      await Promise.all(chunk.map(async ({ token }) => {
        try {
          const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
            method: "POST",
            headers: {
              authorization: `bearer ${jwt}`,
              "apns-topic": APNS_BUNDLE_ID,
              "apns-push-type": "alert",
              "apns-priority": "10",
            },
            body: payload,
          });
          if (res.ok) sent++;
          else {
            failed++;
            const text = await res.text();
            if (res.status === 410 || text.includes("BadDeviceToken")) invalid.push(token);
          }
        } catch {
          failed++;
        }
      }));
    }

    if (invalid.length) {
      await admin.from("device_tokens").update({ enabled: false }).in("token", invalid);
    }

    return json({ sent, failed, total: tokens.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
