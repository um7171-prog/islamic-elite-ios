// Sole write path for `device_tokens`. Anonymous devices have no user account
// to own a row, so ownership is enforced structurally instead: every write is
// scoped by this function to the exact `token` the caller supplies (their own
// APNs token), never by a client-controlled filter. Direct anon/authenticated
// INSERT/UPDATE on the table are revoked (see migration
// 20260913120100_lock_device_tokens_writes.sql) — this function, using the
// service role, is the only way in.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TOKEN_LEN = 500;
const MAX_MODEL_LEN = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, token } = body;

    if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LEN) {
      return Response.json({ error: "invalid token" }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "register") {
      const { platform, lang, device_model } = body;
      const safePlatform = platform === "android" ? "android" : "ios";
      const safeLang = lang === "en" ? "en" : "ar";
      const safeModel = typeof device_model === "string" ? device_model.slice(0, MAX_MODEL_LEN) : null;

      // onConflict("token") only ever touches the row for THIS token — it can
      // never affect any other device's row.
      const { error } = await supabase
        .from("device_tokens")
        .upsert(
          {
            token,
            platform: safePlatform,
            lang: safeLang,
            enabled: true,
            device_model: safeModel,
          },
          { onConflict: "token" },
        );
      if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "disable") {
      // Scoped strictly to the caller's own token — cannot reach other rows.
      const { error } = await supabase
        .from("device_tokens")
        .update({ enabled: false })
        .eq("token", token);
      if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return Response.json({ error: "unknown action" }, { status: 400, headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message || e) }, { status: 500, headers: corsHeaders });
  }
});
