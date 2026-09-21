import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { existsSync, readFileSync, statSync } from "node:fs";
import { HaramHero, HARAM_HERO_VIDEO, HARAM_HERO_POSTER } from "@/components/site/HaramHero";

const read = (p: string) => readFileSync(p, "utf8");
const CR = String.fromCharCode(13);

describe("startup: the native iOS launch screen is the only launch screen", () => {
  it("the custom React splash is gone (component file, import and usage)", () => {
    expect(existsSync("src/components/site/SplashScreen.tsx")).toBe(false);
    expect(read("src/App.tsx")).not.toMatch(/SplashScreen/);
    expect(read("src/App.tsx")).not.toMatch(/data-testid=.splash./);
  });

  it("no artificial startup delay or splash flag remains in src (only the short permission-dialog delay)", () => {
    const onboarding = read("src/components/notifications/NotificationOnboardingCard.tsx");
    expect(onboarding).not.toMatch(/splash/i);
    for (const f of ["src/main.tsx", "src/App.tsx"]) {
      expect(read(f)).not.toMatch(/elite\.splash|splash-logo|MIN_MS|MAX_MS/);
    }
  });

  it("no splash animations are left in the stylesheet", () => {
    expect(read("src/index.css")).not.toMatch(/splash-logo-in|splash-fade|\.splash-(logo|text)/);
  });

  it("the native launch screen is configured for iOS (Info.plist + LaunchScreen.storyboard + Splash artwork)", () => {
    const plist = read("ios/App/App/Info.plist");
    expect(plist).toMatch(/<key>UILaunchStoryboardName<\/key>\s*<string>LaunchScreen<\/string>/);
    const sb = read("ios/App/App/Base.lproj/LaunchScreen.storyboard");
    expect(sb).toMatch(/launchScreen="YES"/);
    expect(sb).toMatch(/image="Splash"/);
    expect(existsSync("ios/App/App/Assets.xcassets/Splash.imageset/Contents.json")).toBe(true);
  });

  it("the native launch screen does not use Apple's logo artwork", () => {
    const sb = read("ios/App/App/Base.lproj/LaunchScreen.storyboard");
    expect(sb).not.toMatch(/apple(logo|\.logo)/i);
  });
});

describe("HaramHero (real footage, local, decorative)", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("renders ONE muted, looping, inline, control-less video from a local file", () => {
    const { container, getByTestId } = render(<HaramHero />);
    const vids = container.querySelectorAll("video");
    expect(vids.length).toBe(1);
    const v = getByTestId("haram-hero-video") as HTMLVideoElement;
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(true);
    expect(v.getAttribute("playsinline")).not.toBeNull();
    expect(v.autoplay).toBe(true);
    expect(v.controls).toBe(false);
    expect(v.getAttribute("src")).toBe(HARAM_HERO_VIDEO);
    expect(v.getAttribute("poster")).toBe(HARAM_HERO_POSTER);
    expect(v.getAttribute("src")).not.toMatch(/^(https?:)?\/\//);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
    expect(container.querySelector("svg, canvas, iframe")).toBeNull();
  });

  it("is decorative: aria-hidden and never intercepts touches", () => {
    const { getByTestId } = render(<HaramHero />);
    const root = getByTestId("haram-hero");
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toContain("pointer-events-none");
  });

  it("does not autoplay under prefers-reduced-motion (the still poster stays)", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }));
    const { getByTestId } = render(<HaramHero />);
    const v = getByTestId("haram-hero-video") as HTMLVideoElement;
    expect(v.autoplay).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(v.getAttribute("poster")).toBe(HARAM_HERO_POSTER);
  });
});

describe("hero assets", () => {
  const mp4 = "public/media/haram-hero.mp4";
  it("ship inside the app (offline) and stay small", () => {
    expect(existsSync(mp4)).toBe(true);
    expect(existsSync("public/media/haram-hero-poster.jpg")).toBe(true);
    expect(statSync(mp4).size).toBeLessThan(3 * 1024 * 1024);
    expect(statSync("public/media/haram-hero-poster.jpg").size).toBeLessThan(300 * 1024);
  });
  it("is an MP4 (ftyp) H.264 file with no audio track", () => {
    const b = readFileSync(mp4);
    expect(b.subarray(4, 8).toString("latin1")).toBe("ftyp");
    const text = b.toString("latin1");
    expect(text).toContain("avc1");
    expect(text).not.toContain("mp4a"); // no AAC audio sample entry
    expect(text.indexOf("moov")).toBeLessThan(text.indexOf("mdat")); // faststart
  });
  it("license and source are documented, with the attribution shown in About", () => {
    const doc = read("docs/HARAM_HERO_VIDEO.md").split(CR).join("");
    expect(doc).toMatch(/CC BY 3\.0/);
    expect(doc).toMatch(/commons\.wikimedia\.org/);
    expect(read("src/pages/About.tsx")).toMatch(/CC BY 3\.0/);
  });
  it("the old SVG/CSS Haram scene is gone", () => {
    expect(existsSync("src/components/site/HaramScene.tsx")).toBe(false);
    const css = read("src/index.css");
    expect(css).not.toMatch(/tawaf|haram-cloud|haram-glow|cloud-drift/);
    expect(read("src/components/islamic/HomeHeader.tsx")).not.toMatch(/HaramScene/);
  });
});
