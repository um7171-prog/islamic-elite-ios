import { describe, it, expect, vi, afterEach } from "vitest";
import { MYMEMORY_CHUNK_CHARS, splitForMyMemory, translateRequest } from "@/lib/translation/translateCore";
import handler from "../../api/translate";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const myMemoryOk = (text: string) => jsonResponse({ responseStatus: 200, quotaFinished: false, responseData: { translatedText: text } });

afterEach(() => vi.unstubAllGlobals());

describe("translation server core", () => {
  it("no key: Arabic -> English through MyMemory, with the right language pair", async () => {
    const fetchMock = vi.fn(async (_url: string) => myMemoryOk("Welcome"));
    const r = await translateRequest({ text: "مرحبا بك", from: "ar", to: "en" }, {}, fetchMock);
    expect(r).toEqual({ status: 200, body: { translation: "Welcome", provider: "mymemory" } });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.host).toBe("api.mymemory.translated.net");
    expect(url.searchParams.get("q")).toBe("مرحبا بك");
    expect(url.searchParams.get("langpair")).toBe("ar|en");
  });

  it("with GOOGLE_TRANSLATE_API_KEY: Google Cloud Translation is used (key stays server-side)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ data: { translations: [{ translatedText: "Welcome" }] } }));
    const r = await translateRequest({ text: "مرحبا بك", from: "ar", to: "en" }, { GOOGLE_TRANSLATE_API_KEY: "k-123" }, fetchMock);
    expect(r).toEqual({ status: 200, body: { translation: "Welcome", provider: "google" } });
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/translation\.googleapis\.com\/language\/translate\/v2\?key=k-123$/);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ q: "مرحبا بك", target: "en", source: "ar", format: "text" });
  });

  it("MyMemory's daily-limit warning (sent with a 200) is a rate_limit, never a 'translation'", async () => {
    const fetchMock = vi.fn(async () => myMemoryOk("MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY"));
    expect(await translateRequest({ text: "مرحبا", from: "ar", to: "en" }, {}, fetchMock)).toEqual({ status: 429, body: { error: "rate_limit" } });
  });

  it("an empty or failed provider answer is an error, never an empty success", async () => {
    expect(await translateRequest({ text: "مرحبا", from: "ar", to: "en" }, {}, async () => myMemoryOk("  "))).toEqual({ status: 502, body: { error: "service" } });
    expect(await translateRequest({ text: "مرحبا", from: "ar", to: "en" }, {}, async () => new Response("down", { status: 503 }))).toEqual({ status: 502, body: { error: "service" } });
    expect(await translateRequest({ text: "مرحبا", from: "ar", to: "en" }, {}, async () => { throw new TypeError("network"); })).toEqual({ status: 502, body: { error: "service" } });
  });

  it("rejects bad input: nothing to translate, unknown language, over-long text", async () => {
    const never = vi.fn();
    expect((await translateRequest({ text: "  " }, {}, never)).status).toBe(400);
    expect((await translateRequest({ text: "hi", to: "xx" }, {}, never)).status).toBe(400);
    expect((await translateRequest({ text: "a".repeat(5001), to: "en" }, {}, never)).status).toBe(400);
    expect(never).not.toHaveBeenCalled();
  });

  it("an image without GEMINI_API_KEY says so clearly (image_unavailable)", async () => {
    const r = await translateRequest({ imageDataUrl: "data:image/jpeg;base64,AAAA", to: "en" }, {}, vi.fn());
    expect(r).toEqual({ status: 501, body: { error: "image_unavailable" } });
  });

  it("long text is split under MyMemory's limit and put back together in order", async () => {
    const text = Array.from({ length: 30 }, (_, i) => `الجملة رقم ${i} في هذا النص الطويل.`).join(" ");
    const pieces = splitForMyMemory(text);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe(text);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(MYMEMORY_CHUNK_CHARS);
    let n = 0;
    const r = await translateRequest({ text, from: "ar", to: "en" }, {}, async () => myMemoryOk(`part${n++}`));
    expect(r.status).toBe(200);
    expect((r.body as { translation: string }).translation).toMatch(/^part0 part1/);
  });
});

describe("POST /api/translate (the Vercel function)", () => {
  it("answers the preflight with CORS, so the iPhone app (capacitor://) may call it", async () => {
    const res = await handler(new Request("https://x/api/translate", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("translates through the core and returns JSON with CORS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => myMemoryOk("Welcome")));
    const res = await handler(new Request("https://x/api/translate", { method: "POST", body: JSON.stringify({ text: "مرحبا بك", from: "ar", to: "en" }) }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ translation: "Welcome", provider: "mymemory" });
  });

  it("rejects non-POST and non-JSON bodies", async () => {
    expect((await handler(new Request("https://x/api/translate"))).status).toBe(405);
    expect((await handler(new Request("https://x/api/translate", { method: "POST", body: "not json" }))).status).toBe(400);
  });
});

// A REAL translation over the network (no mocks). Off by default so the suite never depends on the
// internet; run with:  RUN_LIVE_TRANSLATION=1 npx vitest run src/test/translateCore.test.ts
describe.skipIf(!process.env.RUN_LIVE_TRANSLATION)("LIVE translation (real network)", () => {
  it("Arabic -> English really comes back in English", async () => {
    const r = await translateRequest({ text: "مرحبا بك في تطبيق النخبة الإسلامية", from: "ar", to: "en" }, {});
    expect(r.status).toBe(200);
    const out = (r.body as { translation: string }).translation;
    expect(out).toMatch(/welcome/i);
    expect(out).not.toMatch(/[؀-ۿ]/); // no Arabic letters left
  }, 30_000);
});
