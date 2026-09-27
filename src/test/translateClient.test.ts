import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/platform", () => ({ isNativeApp: () => true }));

import { PRODUCTION_TRANSLATE_URL, requestTranslation, translateEndpoint } from "@/lib/translation/translateClient";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const myMemoryOk = (text: string) => json({ responseStatus: 200, quotaFinished: false, responseData: { translatedText: text } });
// What www.techsnds.com/api/translate really answered while the function wasn't deployed.
const vercelNotFound = () => new Response("The page could not be found\n\nNOT_FOUND\n", { status: 404, headers: { "Content-Type": "text/plain" } });

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
function stubFetch(backend: Route, mymemory: Route = () => myMemoryOk("Peace be upon you")) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://api.mymemory.translated.net/")) return mymemory(url, init);
    return backend(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const arEn = { text: "السلام عليكم", from: "ar", to: "en", imageDataUrl: null };

afterEach(() => vi.unstubAllGlobals());

describe("translation client (iPhone app → www.techsnds.com/api/translate)", () => {
  it("the iPhone app calls the production endpoint", () => {
    expect(translateEndpoint()).toBe(PRODUCTION_TRANSLATE_URL);
    expect(PRODUCTION_TRANSLATE_URL).toBe("https://www.techsnds.com/api/translate");
  });

  it("backend OK: POSTs JSON {text, from, to, imageDataUrl} and returns its translation", async () => {
    const calls = stubFetch(() => json({ translation: "Peace be upon you", provider: "mymemory" }));
    const r = await requestTranslation(arEn);
    expect(r).toMatchObject({ translation: "Peace be upon you", via: "backend" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PRODUCTION_TRANSLATE_URL);
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(arEn);
  });

  it("backend not deployed (404 NOT_FOUND text): Arabic text still comes back in English via MyMemory", async () => {
    const calls = stubFetch(() => vercelNotFound());
    const r = await requestTranslation(arEn);
    expect(r).toMatchObject({ translation: "Peace be upon you", via: "direct" });
    const mm = new URL(calls[1].url);
    expect(mm.searchParams.get("q")).toBe("السلام عليكم");
    expect(mm.searchParams.get("langpair")).toBe("ar|en");
    // no key of any kind is sent from the device
    expect(calls[1].url).not.toMatch(/key=/);
  });

  it("backend unreachable (network / CORS error on iOS): falls back to MyMemory", async () => {
    stubFetch(() => { throw new TypeError("Load failed"); });
    expect(await requestTranslation(arEn)).toMatchObject({ translation: "Peace be upon you", via: "direct" });
  });

  it("backend service error or shared quota: the device retries directly", async () => {
    stubFetch(() => json({ error: "service" }, 502));
    expect((await requestTranslation(arEn)).translation).toBe("Peace be upon you");
    stubFetch(() => json({ error: "rate_limit" }, 429));
    expect((await requestTranslation(arEn)).translation).toBe("Peace be upon you");
  });

  it("keeps the chosen languages on the fallback (fr → de)", async () => {
    const calls = stubFetch(() => vercelNotFound(), () => myMemoryOk("Hallo"));
    await requestTranslation({ text: "Bonjour", from: "fr", to: "de", imageDataUrl: null });
    expect(new URL(calls[1].url).searchParams.get("langpair")).toBe("fr|de");
  });

  it("long text on the fallback is split and put back together", async () => {
    const long = Array.from({ length: 30 }, (_, i) => `جملة رقم ${i} في نص طويل.`).join(" ");
    let n = 0;
    const calls = stubFetch(() => vercelNotFound(), () => myMemoryOk(`part${++n}`));
    const r = await requestTranslation({ ...arEn, text: long });
    expect(calls.length).toBeGreaterThan(2);
    expect(r.translation).toMatch(/^part1 .*part\d+$/);
  });

  it("both paths down: a clear 'unreachable', never a fake success", async () => {
    stubFetch(() => { throw new TypeError("offline"); }, () => { throw new TypeError("offline"); });
    expect(await requestTranslation(arEn)).toEqual({ error: "unreachable" });
  });

  it("fallback hits MyMemory's daily limit: 'rate_limit'", async () => {
    stubFetch(() => vercelNotFound(), () => myMemoryOk("MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY"));
    expect(await requestTranslation(arEn)).toEqual({ error: "rate_limit" });
  });

  it("bad_request from the server is not retried", async () => {
    const calls = stubFetch(() => json({ error: "bad_request" }, 400));
    expect(await requestTranslation(arEn)).toEqual({ error: "bad_request" });
    expect(calls).toHaveLength(1);
  });

  it("image without a working image service: image_unavailable only — typed text still translates", async () => {
    const image = "data:image/jpeg;base64,AAAA";
    // server says images are off (no GEMINI_API_KEY)
    let calls = stubFetch((_u, init) => (JSON.parse(String(init?.body)).imageDataUrl ? json({ error: "image_unavailable" }, 501) : json({ translation: "Peace be upon you" })));
    expect(await requestTranslation({ ...arEn, imageDataUrl: image })).toMatchObject({ translation: "Peace be upon you", imageSkipped: true });
    // image alone: a clear image-only message
    calls = stubFetch(() => json({ error: "image_unavailable" }, 501));
    expect(await requestTranslation({ ...arEn, text: "", imageDataUrl: image })).toEqual({ error: "image_unavailable" });
    // backend down: the image is never sent anywhere else
    calls = stubFetch(() => vercelNotFound());
    expect(await requestTranslation({ ...arEn, text: "", imageDataUrl: image })).toEqual({ error: "image_unavailable" });
    expect(calls.every((c) => !c.url.includes("mymemory") || !c.url.includes("base64"))).toBe(true);
  });
});
