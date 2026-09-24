import { isNativeApp } from "@/lib/platform";

/**
 * The translator screen's only link to translation: POST to the site's own /api/translate
 * (api/translate.ts, a Vercel function). No provider key is in the app — the server holds them.
 *
 * Web: same-origin "/api/translate". iPhone app (capacitor://localhost): the production site.
 * VITE_TRANSLATE_API_URL (public, optional) overrides both, e.g. to point at a preview deployment.
 */
export const PRODUCTION_TRANSLATE_URL = "https://www.techsnds.com/api/translate";

export function translateEndpoint(): string {
  const override = import.meta.env.VITE_TRANSLATE_API_URL as string | undefined;
  if (override) return override;
  return isNativeApp() ? PRODUCTION_TRANSLATE_URL : "/api/translate";
}

export interface TranslationOutcome {
  translation?: string;
  /** "unreachable" (no answer at all), or the server's reason: rate_limit, credits, image_unavailable, bad_request, service */
  error?: string;
}

export async function requestTranslation(body: { text: string; from: string; to: string; imageDataUrl: string | null }): Promise<TranslationOutcome> {
  let res: Response;
  try {
    res = await fetch(translateEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: "unreachable" };
  }
  let data: { translation?: unknown; error?: unknown } | null = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON (e.g. an HTML error page) */
  }
  if (typeof data?.error === "string" && data.error) return { error: data.error };
  const translation = typeof data?.translation === "string" ? data.translation.trim() : "";
  // No real translated text = a failure. Never a fake success.
  if (!res.ok || !translation) return { error: "service" };
  return { translation };
}
