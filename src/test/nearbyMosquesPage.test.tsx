import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LocaleProvider } from "@/contexts/LocaleContext";
import NearbyMosquesPage from "@/pages/NearbyMosquesPage";
import { OVERPASS_ENDPOINTS, OVERPASS_USER_AGENT } from "@/lib/mosques/config";
import type { LatLng } from "@/lib/mosques/model";
import { clearMosqueCache } from "@/lib/mosques/search";

const platform = vi.hoisted(() => ({ ios: false }));
const httpPost = vi.hoisted(() => vi.fn());
const openSettings = vi.hoisted(() => vi.fn());
const mapsPlugin = vi.hoisted(() => ({ open: vi.fn(), canOpen: vi.fn() }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform", () => ({
  isIOSNativeApp: () => platform.ios,
  isNativeApp: () => platform.ios,
  openNativeAppSettings: openSettings,
}));
vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    CapacitorHttp: { post: httpPost },
    registerPlugin: ((name: string, impl?: never) => (name === "MapsLauncher" ? mapsPlugin : actual.registerPlugin(name, impl))) as typeof actual.registerPlugin,
  };
});
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const USER: LatLng = { lat: 24.713612, lng: 46.675349 };
const M_PER_DEG = (Math.PI * 6_371_000) / 180;
const north = (m: number, from = USER): LatLng => ({ lat: from.lat + m / M_PER_DEG, lng: from.lng });
const east = (m: number, from = USER): LatLng => ({ lat: from.lat, lng: from.lng + m / (M_PER_DEG * Math.cos((from.lat * Math.PI) / 180)) });

const MOSQUE = { amenity: "place_of_worship", religion: "muslim" };
const node = (id: number, p: LatLng, tags: Record<string, string> = MOSQUE) => ({ type: "node", id, lat: p.lat, lon: p.lng, tags });
const way = (id: number, p: LatLng, tags: Record<string, string>) => ({ type: "way", id, center: { lat: p.lat, lon: p.lng }, tags });

/** Three mosques inside 1 km, deliberately out of distance order. */
const THREE = [
  node(1, north(900), { ...MOSQUE, name: "مسجد البعيد" }),
  node(2, east(350)), // no name
  way(3, north(-600), { building: "mosque", name: "جامع الوسط", "name:en": "Al Wasat Mosque" }),
];

let permission = "prompt";
const permissionsQuery = vi.fn(async () => ({ state: permission }));
const getCurrentPosition = vi.fn();
const fixOf = (p: LatLng, accuracy = 12) => ({ coords: { latitude: p.lat, longitude: p.lng, accuracy } });
const giveFix = (p: LatLng, accuracy = 12) => getCurrentPosition.mockImplementation((ok: (pos: unknown) => void) => ok(fixOf(p, accuracy)));
const failFix = (code: number) => getCurrentPosition.mockImplementation((_ok: unknown, err: (e: unknown) => void) => err({ code }));

const fetchMock = vi.fn();
const respond = (elements: unknown[]) => ({ status: 200, text: async () => JSON.stringify({ elements }) });
const queryOf = (call: unknown[]) => decodeURIComponent(String((call[1] as RequestInit).body).slice("data=".length));
const radiusOf = (call: unknown[]) => Number(/around:(\d+)/.exec(queryOf(call))?.[1]);

const names = () => screen.getAllByTestId("mosque-name").map((n) => n.textContent);
const texts = (id: string) => screen.getAllByTestId(id).map((n) => n.textContent);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function page(lang: "ar" | "en" = "ar") {
  localStorage.setItem("lang", lang);
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={["/mosques"]}>
        <LocaleProvider>
          <NearbyMosquesPage />
        </LocaleProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  clearMosqueCache();
  localStorage.clear();
  platform.ios = false;
  permission = "prompt";
  permissionsQuery.mockClear();
  getCurrentPosition.mockReset();
  giveFix(USER);
  fetchMock.mockReset();
  httpPost.mockReset();
  openSettings.mockReset();
  mapsPlugin.open.mockReset().mockResolvedValue({ completed: true });
  mapsPlugin.canOpen.mockReset().mockResolvedValue({ value: true });
  toastError.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  Object.defineProperty(navigator, "permissions", { value: { query: permissionsQuery }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Nearby Mosques — permission and location states", () => {
  it("initial: explains why location is needed and asks for nothing until tapped", async () => {
    render(page());
    expect(await screen.findByTestId("mosques-intro")).toBeInTheDocument();
    expect(screen.getByText("نستخدم موقعك لعرض المساجد القريبة منك.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("المساجد القريبة");
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tap → requesting location → searching → results, nearest first", async () => {
    let giveLocation = () => {};
    getCurrentPosition.mockImplementation((ok: (pos: unknown) => void) => {
      giveLocation = () => ok(fixOf(USER));
    });
    let answer: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    render(page());

    fireEvent.click(await screen.findByTestId("mosques-start"));
    expect(await screen.findByText("جارٍ تحديد موقعك…")).toBeInTheDocument();
    // One While-In-Use fix (high accuracy), never a watch.
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });

    act(() => giveLocation());
    expect(await screen.findByText("جارٍ البحث عن المساجد القريبة…")).toBeInTheDocument();

    await act(async () => answer(respond(THREE)));
    await screen.findAllByTestId("mosque-item");
    expect(names()).toEqual(["مسجد قريب", "جامع الوسط", "مسجد البعيد"]);
    expect(texts("mosque-distance")).toEqual(["350 م", "600 م", "900 م"]);
    expect(texts("mosque-direction")).toEqual(["شرق", "جنوب", "شمال"]);
    expect(screen.getByTestId("mosques-count")).toHaveTextContent("3");
    expect(screen.getByText("الأقرب")).toBeInTheDocument();
    expect(screen.getAllByText("الطريق")).toHaveLength(3);
    expect(screen.getAllByText("فتح في الخرائط")).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(radiusOf(fetchMock.mock.calls[0])).toBe(1150);
  });

  it("location already allowed: searches on open without a tap", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    await screen.findAllByTestId("mosque-item");
    expect(screen.queryByTestId("mosques-intro")).toBeNull();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("denied: a clear state, no prompt and no search; Try again does not crash", async () => {
    permission = "denied";
    failFix(1);
    render(page());
    expect(await screen.findByTestId("mosques-denied")).toBeInTheDocument();
    expect(screen.getByText("الوصول إلى الموقع متوقف")).toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.queryByTestId("mosques-open-settings")).toBeNull(); // web has no app settings
    fireEvent.click(screen.getByTestId("mosques-retry"));
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("mosques-denied")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refusing the system prompt shows the denied state", async () => {
    failFix(1);
    render(page());
    fireEvent.click(await screen.findByTestId("mosques-start"));
    expect(await screen.findByTestId("mosques-denied")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("location unavailable or timed out: explained, with a working retry", async () => {
    failFix(2);
    render(page());
    fireEvent.click(await screen.findByTestId("mosques-start"));
    expect(await screen.findByTestId("mosques-unavailable")).toBeInTheDocument();
    expect(screen.getByText(/خدمة GPS غير متاحة الآن/)).toBeInTheDocument();
    failFix(3);
    fireEvent.click(screen.getByTestId("mosques-retry"));
    expect(await screen.findByText(/استغرق تحديد الموقع وقتاً طويلاً/)).toBeInTheDocument();
    giveFix(USER);
    fetchMock.mockResolvedValue(respond(THREE));
    fireEvent.click(screen.getByTestId("mosques-retry"));
    await screen.findAllByTestId("mosque-item");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an invalid position from the device never reaches the network", async () => {
    giveFix({ lat: Number.NaN, lng: 200 });
    render(page());
    fireEvent.click(await screen.findByTestId("mosques-start"));
    expect(await screen.findByTestId("mosques-unavailable")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Nearby Mosques — data source failures", () => {
  it("network error: message and retry, which then shows the results", async () => {
    permission = "granted";
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(page());
    expect(await screen.findByText("تعذر تحميل المساجد القريبة حاليًا.")).toBeInTheDocument();
    expect(screen.getByText("تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.")).toBeInTheDocument();
    expect(screen.getByText("إعادة المحاولة")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(OVERPASS_ENDPOINTS.length); // bounded: once per endpoint
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(respond(THREE));
    fireEvent.click(screen.getByTestId("mosques-retry"));
    await screen.findAllByTestId("mosque-item");
    expect(names()).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Overpass timeout (504 everywhere): error state, the page stays intact", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue({ status: 504, text: async () => "Gateway Timeout" });
    render(page());
    expect(await screen.findByTestId("mosques-error")).toBeInTheDocument();
    expect(screen.getByText("خدمة الخرائط مشغولة الآن. حاول مرة أخرى بعد قليل.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("المساجد القريبة");
  });

  it("malformed OSM response: error state, no crash", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue({ status: 200, text: async () => "<html>maintenance</html>" });
    render(page());
    expect(await screen.findByTestId("mosques-error")).toBeInTheDocument();
    expect(screen.queryByTestId("mosque-item")).toBeNull();
  });
});

describe("Nearby Mosques — results and radius", () => {
  it("too few within 1 km: widens once, automatically, to 2 km", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond([node(1, north(400), { ...MOSQUE, name: "مسجد الحي" }), node(2, east(1600), { ...MOSQUE, name: "جامع الشارع" })]));
    render(page());
    await waitFor(() => expect(screen.getAllByTestId("mosque-item")).toHaveLength(2));
    expect(fetchMock.mock.calls.map(radiusOf)).toEqual([1150, 2150]);
    expect(screen.getByTestId("mosques-auto-expanded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 كم" })).toHaveAttribute("aria-pressed", "true");
  });

  it("no mosques: an empty state that offers a wider search", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond([]));
    render(page());
    expect(await screen.findByTestId("mosques-empty")).toBeInTheDocument();
    expect(screen.getByText(/لا توجد مساجد مسجّلة ضمن\s*2 كم/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(radiusOf)).toEqual([1150, 2150]);
    fetchMock.mockResolvedValue(respond([node(9, north(4000), { ...MOSQUE, name: "جامع الضاحية" })]));
    fireEvent.click(screen.getByTestId("mosques-expand"));
    await waitFor(() => expect(names()).toEqual(["جامع الضاحية"]));
    expect(radiusOf(fetchMock.mock.calls[2])).toBe(5150);
    expect(screen.getByRole("button", { name: "5 كم" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the same mosque mapped more than once is listed once", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(
      respond([
        node(1, north(300), { ...MOSQUE, name: "مسجد التقوى" }),
        way(2, north(315), { building: "mosque" }),
        node(1, north(300), { ...MOSQUE, name: "مسجد التقوى" }),
        node(3, east(500), { ...MOSQUE, name: "جامع الهدى" }),
        node(4, east(-800), { ...MOSQUE, name: "مسجد الرحمة" }),
      ]),
    );
    render(page());
    await screen.findAllByTestId("mosque-item");
    expect(names()).toEqual(["مسجد التقوى", "جامع الهدى", "مسجد الرحمة"]);
  });

  it("quick radius changes send one request for the last choice; a smaller radius reuses the cache", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    await screen.findAllByTestId("mosque-item");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "5 كم" }));
    fireEvent.click(screen.getByRole("button", { name: "10 كم" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(radiusOf(fetchMock.mock.calls[1])).toBe(10_150);
    await waitFor(() => expect(screen.getByTestId("mosques-count")).toHaveTextContent("10 كم"));

    fireEvent.click(screen.getByRole("button", { name: "2 كم" }));
    expect(screen.getByTestId("mosques-count")).toHaveTextContent("2 كم");
    await pause(450);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refresh takes a new position fix and searches again", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    await screen.findAllByTestId("mosque-item");
    giveFix(north(5000));
    fetchMock.mockResolvedValue(respond([node(7, north(5200), { ...MOSQUE, name: "مسجد الحي الجديد" })]));
    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));
    await waitFor(() => expect(names()).toEqual(["مسجد الحي الجديد"]));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-renders never repeat the request", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond(THREE));
    const { rerender } = render(page());
    await screen.findAllByTestId("mosque-item");
    for (let i = 0; i < 3; i++) rerender(page());
    await pause(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("React StrictMode's double mount still sends a single request", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond(THREE));
    render(<StrictMode>{page()}</StrictMode>);
    await screen.findAllByTestId("mosque-item");
    await pause(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

describe("Nearby Mosques — maps, platforms, languages and privacy", () => {
  it("web: Directions / Open in Maps are Google Maps links to the mosque only", async () => {
    permission = "granted";
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    await screen.findAllByTestId("mosque-item");
    const p = east(350);
    const directions = screen.getAllByTestId("mosque-directions")[0];
    expect(directions).toHaveAttribute("href", `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
    expect(directions).toHaveAttribute("target", "_blank");
    expect(directions.getAttribute("rel")).toContain("noopener");
    expect(screen.getAllByTestId("mosque-open-map")[0]).toHaveAttribute("href", `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
    const userPair = `${USER.lat.toFixed(6)},${USER.lng.toFixed(6)}`;
    for (const a of [...screen.getAllByTestId("mosque-directions"), ...screen.getAllByTestId("mosque-open-map")]) {
      expect(a.getAttribute("href")).not.toContain(userPair);
    }
  });

  it("iOS app: a native request that names the app, and Open iPhone Settings when denied", async () => {
    platform.ios = true;
    permission = "granted";
    httpPost.mockResolvedValue({ status: 200, data: { elements: THREE }, headers: {}, url: "" });
    const { unmount } = render(page());
    await screen.findAllByTestId("mosque-item");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(httpPost).toHaveBeenCalledTimes(1);
    expect(httpPost.mock.calls[0][0].headers["User-Agent"]).toBe(OVERPASS_USER_AGENT);
    unmount();

    permission = "denied";
    render(page());
    fireEvent.click(await screen.findByTestId("mosques-open-settings"));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("English labels", async () => {
    render(page("en"));
    expect(await screen.findByText("We use your location to show the mosques near you.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nearby Mosques");
    fetchMock.mockResolvedValue(respond(THREE));
    fireEvent.click(screen.getByTestId("mosques-start"));
    await screen.findAllByTestId("mosque-item");
    expect(names()).toEqual(["Nearby mosque", "Al Wasat Mosque", "مسجد البعيد"]);
    expect(texts("mosque-distance")).toEqual(["350 m", "600 m", "900 m"]);
    expect(texts("mosque-direction")).toEqual(["East", "South", "North"]);
    expect(screen.getAllByText("Directions")).toHaveLength(3);
    expect(screen.getAllByText("Open in Maps")).toHaveLength(3);
    expect(screen.getByText("Nearest first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 km" })).toBeInTheDocument();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();
  });

  it("the position is never stored or logged, and the server only gets a rounded point", async () => {
    const spies = (["log", "info", "debug", "warn", "error"] as const).map((k) => vi.spyOn(console, k));
    permission = "granted";
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    await screen.findAllByTestId("mosque-item");

    const stored: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) as string;
      stored.push(`${k}=${localStorage.getItem(k)}`);
    }
    expect(stored.join("\n")).not.toMatch(/24\.71|46\.67/);
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toMatch(/24\.71|46\.67/);
      spy.mockRestore();
    }
    const q = queryOf(fetchMock.mock.calls[0]);
    expect(q).toContain("24.714,46.675");
    expect(q).not.toContain("24.713612");
  });
});

describe("Nearby Mosques — maps app on the iPhone (Apple Maps or Google Maps)", () => {
  const MAPS_KEY = "elite.mapsApp.v1";
  const p = east(350); // the nearest mosque in THREE (listed first)
  const c = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const userPair = `${USER.lat.toFixed(6)},${USER.lng.toFixed(6)}`;
  const openedUrls = () => mapsPlugin.open.mock.calls.map((call) => (call[0] as { url: string }).url);

  async function iosResults(choice?: "apple" | "google") {
    platform.ios = true;
    permission = "granted";
    httpPost.mockResolvedValue({ status: 200, data: { elements: THREE }, headers: {}, url: "" });
    if (choice) localStorage.setItem(MAPS_KEY, choice); // an earlier choice, before the page opens
    render(page());
    await screen.findAllByTestId("mosque-item");
  }

  it("first tap asks Apple Maps or Google Maps; the choice is saved and used from then on", async () => {
    await iosResults();
    fireEvent.click(screen.getAllByTestId("mosque-directions")[0]);
    const google = await screen.findByRole("radio", { name: /خرائط Google/ });
    expect(screen.getByRole("radio", { name: /خرائط Apple/ })).toBeInTheDocument();
    expect(mapsPlugin.open).not.toHaveBeenCalled();
    fireEvent.click(google);
    await waitFor(() => expect(mapsPlugin.open).toHaveBeenCalledTimes(1));
    expect(openedUrls()).toEqual([`comgooglemaps://?daddr=${c}&directionsmode=driving`]);
    expect(localStorage.getItem(MAPS_KEY)).toBe("google");

    await waitFor(() => expect(screen.queryByRole("radio")).toBeNull());
    fireEvent.click(screen.getAllByTestId("mosque-open-map")[0]);
    await waitFor(() => expect(mapsPlugin.open).toHaveBeenCalledTimes(2));
    expect(openedUrls()[1]).toBe(`comgooglemaps://?q=${c}&center=${c}`);
    expect(screen.queryByRole("radio")).toBeNull(); // not asked again
  });

  it("the chooser says when Google Maps isn't installed (it will open in the browser)", async () => {
    mapsPlugin.canOpen.mockResolvedValue({ value: false });
    await iosResults();
    fireEvent.click(screen.getAllByTestId("mosque-directions")[0]);
    expect(await screen.findByText("غير مثبت على جهازك — سيُفتح في المتصفح")).toBeInTheDocument();
    expect(mapsPlugin.canOpen).toHaveBeenCalledWith({ url: "comgooglemaps://" });
  });

  it("Google Maps chosen but not installed → Google Maps on the web, at the mosque's coordinates", async () => {
    mapsPlugin.open.mockImplementation(async ({ url }: { url: string }) => ({ completed: !url.startsWith("comgooglemaps://") }));
    await iosResults("google");
    fireEvent.click(screen.getAllByTestId("mosque-directions")[0]);
    await waitFor(() => expect(mapsPlugin.open).toHaveBeenCalledTimes(2));
    expect(openedUrls()).toEqual([
      `comgooglemaps://?daddr=${c}&directionsmode=driving`,
      `https://www.google.com/maps/dir/?api=1&destination=${c}`,
    ]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("Apple Maps chosen → maps.apple.com at the mosque; the user's position is never in any link", async () => {
    await iosResults("apple");
    fireEvent.click(screen.getAllByTestId("mosque-directions")[0]);
    fireEvent.click(screen.getAllByTestId("mosque-open-map")[0]);
    await waitFor(() => expect(mapsPlugin.open).toHaveBeenCalledTimes(2));
    expect(openedUrls()[0]).toBe(`https://maps.apple.com/?daddr=${c}`);
    expect(openedUrls()[1].startsWith(`https://maps.apple.com/?ll=${c}&q=`)).toBe(true);
    for (const u of openedUrls()) expect(u).not.toContain(userPair);
  });

  it("when no maps app can open, the user is told instead of nothing happening", async () => {
    mapsPlugin.open.mockResolvedValue({ completed: false });
    await iosResults("apple");
    fireEvent.click(screen.getAllByTestId("mosque-directions")[0]);
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe("تعذّر فتح الخرائط");
  });
});

describe("Nearby Mosques — how precise the user's location is", () => {
  it("asks for a fresh, precise fix (maximumAge 0) rather than a cached one", async () => {
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    fireEvent.click(await screen.findByTestId("mosques-start"));
    await screen.findAllByTestId("mosque-item");
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  });

  it("accuracy worse than 100 m: a clear warning that the location is approximate, with Precise Location guidance", async () => {
    platform.ios = true;
    permission = "granted";
    giveFix(USER, 1500);
    httpPost.mockResolvedValue({ status: 200, data: { elements: THREE }, headers: {}, url: "" });
    render(page());
    const warning = await screen.findByTestId("mosques-approximate");
    expect(warning).toHaveTextContent("موقعك تقريبي");
    expect(warning).toHaveTextContent("1.5 كم");
    expect(warning).toHaveTextContent("الموقع الدقيق");
    fireEvent.click(screen.getByTestId("mosques-approximate-settings"));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("accuracy of 100 m or better: no warning", async () => {
    permission = "granted";
    giveFix(USER, 100);
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    await screen.findAllByTestId("mosque-item");
    expect(screen.queryByTestId("mosques-approximate")).toBeNull();
  });

  it("a better fix on refresh clears the warning", async () => {
    permission = "granted";
    giveFix(USER, 800);
    fetchMock.mockResolvedValue(respond(THREE));
    render(page());
    await screen.findByTestId("mosques-approximate");
    await screen.findAllByTestId("mosque-item");
    giveFix(USER, 15);
    fireEvent.click(screen.getByRole("button", { name: "تحديث" }));
    await waitFor(() => expect(screen.queryByTestId("mosques-approximate")).toBeNull());
  });
});
