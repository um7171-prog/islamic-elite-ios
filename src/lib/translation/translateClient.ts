import { isNativeApp } from "@/lib/platform";
import { translateRequest } from "@/lib/translation/translateCore";

/**
 * The translator screen's link to translation: POST to the site's own /api/translate
 * (api/translate.ts, a Vercel function). No provider key is in the app — the server holds them.
 *
 * Web: same-origin "/api/translate". iPhone app (capacitor://localhost): the production site.
 * VITE_TRANSLATE_API_URL (public, optional) overrides both, e.g. to point at a preview deployment.
 *
 * Text fallback: when that endpoint can't give a translation (not deployed → 404 with no CORS
 * headers, which WKWebView reports as a network error; offline server; server-side provider
 * failure or its shared daily quota), plain text is sent straight from the device to the free,
 * keyless MyMemory API — the same code path the server uses without a Google key. No secret is
 * involved. Images are never sent there: they need the server's Gemini key, so an image request
 * without a working server is a clear "image_unavailable", and text translation keeps working.
 */
export const PRODUCTION_TRANSLATE_URL = "https://www.techsnds.com/api/translate";

/** How long to wait for the backend before falling back (text) / giving up (image). */
export const BACKEND_TIMEOUT_MS = 15_000;

export function translateEndpoint(): string {
  const override = import.meta.env.VITE_TRANSLATE_API_URL as string | undefined;
  if (override) return override;
  return isNativeApp() ? PRODUCTION_TRANSLATE_URL : "/api/translate";
}

export interface TranslationOutcome {
  translation?: string;
  /** "unreachable" (no answer at all), or the server's reason: rate_limit, credits, image_unavailable, bad_request, service */
  error?: string;
  /** which path produced the translation */
  via?: "backend" | "direct";
  /** an image was attached but image translation is unavailable: only the typed text was translated */
  imageSkipped?: boolean;
}

interface TranslationBody {
  text: string;
  from: string;
  to: string;
  imageDataUrl: string | null;
}

async function viaBackend(body: TranslationBody): Promise<TranslationOutcome> {
  let res: Response;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), BACKEND_TIMEOUT_MS) : null;
  try {
    res = await fetch(translateEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl?.signal,
    });
  } catch {
    return { error: "unreachable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data: { translation?: unknown; error?: unknown } | null = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON (e.g. Vercel's "NOT_FOUND" text page when the function isn't deployed) */
  }
  if (typeof data?.error === "string" && data.error) return { error: data.error };
  const translation = typeof data?.translation === "string" ? data.translation.trim() : "";
  // No real translated text = a failure. Never a fake success.
  if (!res.ok || !translation) return { error: data ? "service" : "unreachable" };
  return { translation, via: "backend" };
}

/** Plain text straight to MyMemory (keyless, CORS-open) using the shared translation core. */
async function viaDirectMyMemory(body: TranslationBody): Promise<TranslationOutcome> {
  let networkFailed = false;
  const fetchImpl = async (input: string, init?: RequestInit) => {
    try {
      return await fetch(input, init);
    } catch (e) {
      networkFailed = true;
      throw e;
    }
  };
  const reply = await translateRequest({ text: body.text, from: body.from, to: body.to }, {}, fetchImpl);
  if ("translation" in reply.body) return { translation: reply.body.translation, via: "direct" };
  return { error: networkFailed ? "unreachable" : reply.body.error };
}

/** Backend errors after which plain text is worth retrying directly on the device. */
const RETRY_TEXT_DIRECTLY = new Set(["unreachable", "service", "rate_limit", "method_not_allowed"]);

export async function requestTranslation(body: TranslationBody): Promise<TranslationOutcome> {
  const primary = await viaBackend(body);
  if (primary.translation) return primary;

  const text = body.text.trim();
  if (body.imageDataUrl) {
    // Image translation needs the server (Gemini key). Without it, say so for the image only —
    // and still translate any typed text on its own, so text translation never breaks with it.
    const imageError = primary.error === "unreachable" ? "image_unavailable" : primary.error;
    if (imageError !== "image_unavailable" || !text) return { error: imageError };
    const textOnly = await requestTranslation({ ...body, text, imageDataUrl: null });
    return textOnly.translation ? { ...textOnly, imageSkipped: true } : { error: imageError };
  }
  if (!text || !primary.error || !RETRY_TEXT_DIRECTLY.has(primary.error)) return primary;

  const direct = await viaDirectMyMemory({ ...body, text });
  if (direct.translation) return direct;
  // Report the more specific reason: a quota message beats a generic failure.
  return { error: direct.error === "rate_limit" ? "rate_limit" : primary.error === "unreachable" ? direct.error : primary.error };
}
