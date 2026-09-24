/**
 * Server-side translation core, used by the Vercel function api/translate.ts (never by the app
 * bundle: the app only calls that endpoint, so no secret key ever ships inside the app).
 *
 * Text:  Google Cloud Translation (v2) when GOOGLE_TRANSLATE_API_KEY is set on the server;
 *        otherwise the free MyMemory API (no key; MYMEMORY_EMAIL, optional, raises its daily quota).
 * Image: Gemini (reads the text in the image and translates it) when GEMINI_API_KEY is set;
 *        otherwise a clear "image_unavailable" error — never a fake result.
 *
 * Replies keep the shape the translator screen already understands:
 *   { translation: "…" }  or  { error: "rate_limit" | "credits" | "bad_request" | "image_unavailable" | "service" }
 *
 * No path aliases here: this file is bundled by Vercel from outside the Vite build.
 */

export interface TranslateEnv {
  GOOGLE_TRANSLATE_API_KEY?: string;
  GEMINI_API_KEY?: string;
  MYMEMORY_EMAIL?: string;
}

export interface TranslateRequestBody {
  text?: unknown;
  from?: unknown;
  to?: unknown;
  imageDataUrl?: unknown;
}

export type TranslateReply =
  | { status: 200; body: { translation: string; provider: "google" | "mymemory" | "gemini" } }
  | { status: number; body: { error: string } };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The languages the translator screen offers (same codes). */
export const SUPPORTED_LANGS = ["ar", "en", "fr", "es", "de", "tr", "ur", "id", "ms", "hi", "fa", "ru", "zh", "ja", "ko", "pt", "it", "nl", "bn", "sw"] as const;
const SUPPORTED = new Set<string>(SUPPORTED_LANGS);

export const MAX_TEXT_CHARS = 5000;
/** MyMemory rejects queries over 500 bytes-ish; stay well under by splitting on natural breaks. */
export const MYMEMORY_CHUNK_CHARS = 450;

const LANG_NAMES: Record<string, string> = {
  ar: "Arabic", en: "English", fr: "French", es: "Spanish", de: "German", tr: "Turkish", ur: "Urdu",
  id: "Indonesian", ms: "Malay", hi: "Hindi", fa: "Persian", ru: "Russian", zh: "Chinese (Simplified)",
  ja: "Japanese", ko: "Korean", pt: "Portuguese", it: "Italian", nl: "Dutch", bn: "Bengali", sw: "Swahili",
};

class TranslateError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

const fail = (code: string, status: number): TranslateReply => ({ status, body: { error: code } });

export async function translateRequest(input: TranslateRequestBody, env: TranslateEnv, fetchImpl: FetchLike = fetch): Promise<TranslateReply> {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const imageDataUrl = typeof input.imageDataUrl === "string" && input.imageDataUrl.startsWith("data:image/") ? input.imageDataUrl : null;
  const from = typeof input.from === "string" ? input.from : "auto";
  const to = typeof input.to === "string" ? input.to : "en";

  if (!text && !imageDataUrl) return fail("bad_request", 400);
  if (text.length > MAX_TEXT_CHARS) return fail("bad_request", 400);
  if (!SUPPORTED.has(to) || (from !== "auto" && !SUPPORTED.has(from))) return fail("bad_request", 400);

  try {
    if (imageDataUrl) {
      if (!env.GEMINI_API_KEY) return fail("image_unavailable", 501);
      const translation = await geminiImage(imageDataUrl, text, from, to, env.GEMINI_API_KEY, fetchImpl);
      return { status: 200, body: { translation, provider: "gemini" } };
    }
    if (from !== "auto" && from === to) return { status: 200, body: { translation: text, provider: "mymemory" } };
    if (env.GOOGLE_TRANSLATE_API_KEY) {
      const translation = await google(text, from, to, env.GOOGLE_TRANSLATE_API_KEY, fetchImpl);
      return { status: 200, body: { translation, provider: "google" } };
    }
    const translation = await myMemory(text, from, to, env.MYMEMORY_EMAIL, fetchImpl);
    return { status: 200, body: { translation, provider: "mymemory" } };
  } catch (e) {
    if (e instanceof TranslateError) return fail(e.code, e.status);
    return fail("service", 502);
  }
}

/* ---------------- providers ---------------- */

async function google(text: string, from: string, to: string, key: string, fetchImpl: FetchLike): Promise<string> {
  const res = await fetchImpl(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, target: googleCode(to), format: "text", ...(from !== "auto" ? { source: googleCode(from) } : {}) }),
  });
  if (res.status === 429) throw new TranslateError("rate_limit", 429);
  if (!res.ok) throw new TranslateError("service", 502);
  const data = (await res.json()) as { data?: { translations?: { translatedText?: string }[] } };
  const out = data?.data?.translations?.[0]?.translatedText?.trim() ?? "";
  if (!out) throw new TranslateError("service", 502);
  return out;
}

async function myMemory(text: string, from: string, to: string, email: string | undefined, fetchImpl: FetchLike): Promise<string> {
  const parts: string[] = [];
  for (const chunk of splitForMyMemory(text)) {
    if (!chunk.trim()) {
      parts.push(chunk);
      continue;
    }
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", chunk);
    url.searchParams.set("langpair", `${from === "auto" ? "autodetect" : myMemoryCode(from)}|${myMemoryCode(to)}`);
    if (email) url.searchParams.set("de", email);
    const res = await fetchImpl(url.toString());
    if (res.status === 429) throw new TranslateError("rate_limit", 429);
    if (!res.ok) throw new TranslateError("service", 502);
    const data = (await res.json()) as { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } };
    const out = data?.responseData?.translatedText ?? "";
    // MyMemory reports its daily limit inside the text itself, with a 200 status.
    if (data?.quotaFinished || /MYMEMORY WARNING/i.test(out) || Number(data?.responseStatus) === 429) throw new TranslateError("rate_limit", 429);
    if (Number(data?.responseStatus) !== 200 || !out.trim()) throw new TranslateError("service", 502);
    // keep the whitespace that separated this piece from the next (line breaks, spaces)
    parts.push(out.trim() + (/\s+$/.exec(chunk)?.[0] ?? ""));
  }
  const joined = parts.join("").trim();
  if (!joined) throw new TranslateError("service", 502);
  return joined;
}

async function geminiImage(imageDataUrl: string, context: string, from: string, to: string, key: string, fetchImpl: FetchLike): Promise<string> {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(imageDataUrl);
  if (!match) throw new TranslateError("bad_request", 400);
  const toName = LANG_NAMES[to] ?? to;
  const instruction =
    (from === "auto"
      ? `Extract all visible text from this image, then translate it to ${toName}.`
      : `Extract all visible ${LANG_NAMES[from] ?? from} text from this image, then translate it to ${toName}.`) +
    " Return ONLY the final translated text, no explanations, no quotes, no language labels." +
    (context ? `\n\nAdditional context: ${context}` : "");
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: instruction }, { inline_data: { mime_type: match[1], data: match[2] } }] }] }),
  });
  if (res.status === 429) throw new TranslateError("rate_limit", 429);
  if (!res.ok) throw new TranslateError("service", 502);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!out) throw new TranslateError("service", 502);
  return out;
}

/* ---------------- helpers ---------------- */

const googleCode = (c: string) => (c === "zh" ? "zh-CN" : c);
const myMemoryCode = (c: string) => (c === "zh" ? "zh-CN" : c);

/** Splits text into pieces under MYMEMORY_CHUNK_CHARS, on line breaks, then sentence ends, then
 * spaces — the separators are kept, so joining the translated pieces keeps the layout. */
export function splitForMyMemory(text: string, max = MYMEMORY_CHUNK_CHARS): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf("\n");
    // sentence end: cut after its space, so the space stays at the END of this piece
    if (cut < max / 3) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("۔ "), window.lastIndexOf("؟ "), window.lastIndexOf("! "), window.lastIndexOf("? ")) + 1;
    if (cut < max / 3) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max - 1;
    out.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  if (rest) out.push(rest);
  return out;
}
