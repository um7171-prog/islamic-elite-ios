const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANG_NAMES: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  tr: "Turkish",
  ur: "Urdu",
  id: "Indonesian",
  ms: "Malay",
  hi: "Hindi",
  fa: "Persian",
  ru: "Russian",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  bn: "Bengali",
  sw: "Swahili",
  auto: "auto-detected",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, from = "auto", to = "en", imageDataUrl } = await req.json();
    if ((!text || typeof text !== "string") && !imageDataUrl) {
      return new Response(JSON.stringify({ error: "Missing text or image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromName = LANG_NAMES[from] ?? from;
    const toName = LANG_NAMES[to] ?? to;

    const system =
      "You are a professional translator. Translate accurately and naturally, preserving meaning, tone, formatting, line breaks and punctuation. Return ONLY the translated text, no explanations, no quotes, no language labels.";

    let userContent: any;
    if (imageDataUrl) {
      const instruction =
        from === "auto"
          ? `Extract all visible text from this image, then translate it to ${toName}. Return ONLY the final translated text.`
          : `Extract all visible ${fromName} text from this image, then translate it to ${toName}. Return ONLY the final translated text.`;
      userContent = [
        { type: "text", text: instruction + (text ? `\n\nAdditional context: ${text}` : "") },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ];
    } else {
      userContent =
        from === "auto"
          ? `Detect the source language and translate the following text to ${toName}:\n\n${text}`
          : `Translate the following text from ${fromName} to ${toName}:\n\n${text}`;
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "credits" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: "ai_error", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const translation = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ translation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
