/**
 * POST /api/translate — the translator's backend (Vercel Edge Function, deployed with the site).
 *
 * Body:  { text?: string, from?: string ("auto" | "ar" | …), to: string, imageDataUrl?: string }
 * Reply: { translation: string } | { error: string }   (logic: src/lib/translation/translateCore.ts)
 *
 * Server-side environment variables (Vercel → Project → Settings → Environment Variables; never
 * VITE_-prefixed, so they are never in the app bundle):
 *   GOOGLE_TRANSLATE_API_KEY  optional — Google Cloud Translation; without it the free MyMemory API is used
 *   MYMEMORY_EMAIL            optional — raises MyMemory's free daily quota
 *   GEMINI_API_KEY            optional — enables translating text inside an image
 *
 * CORS is open (no cookies/credentials are used) so the iPhone app (capacitor://localhost) can call it.
 */
import { translateRequest, type TranslateEnv } from "../src/lib/translation/translateCore";

export const config = { runtime: "edge" };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }

  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const env: TranslateEnv = {
    GOOGLE_TRANSLATE_API_KEY: processEnv.GOOGLE_TRANSLATE_API_KEY,
    GEMINI_API_KEY: processEnv.GEMINI_API_KEY,
    MYMEMORY_EMAIL: processEnv.MYMEMORY_EMAIL,
  };

  const reply = await translateRequest((body ?? {}) as Record<string, unknown>, env);
  return json(reply.status, reply.body);
}
