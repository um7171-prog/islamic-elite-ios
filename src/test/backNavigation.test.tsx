import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { StaticPageShell } from "@/components/site/StaticPageShell";
import { PageShell } from "@/components/site/PageHeader";
import { FullScreenDialog } from "@/components/site/FullScreenDialog";
import { MushafTopBar } from "@/components/mushaf/MushafBars";
import { InterstitialAd } from "@/components/ads/InterstitialAd";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "ar");
});
afterEach(() => cleanup());

function StaticPage() {
  return (
    <StaticPageShell title="t" description="d" path="/about" heading="عن التطبيق">
      <p>content</p>
    </StaticPageShell>
  );
}

function app(initial: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initial]}>
        <LocaleProvider>
          <Routes>
            <Route path="/" element={<p>HOME</p>} />
            <Route path="/about" element={<StaticPage />} />
            <Route path="/inner" element={<PageShell titleAr="داخلي" titleEn="Inner" fallback="/"><p>INNER</p></PageShell>} />
          </Routes>
        </LocaleProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("Back buttons actually go back", () => {
  it("static page opened directly (no history): Back goes Home instead of doing nothing", () => {
    app("/about");
    const back = screen.getByTestId("static-back");
    expect(back.className).toMatch(/h-11/);
    fireEvent.click(back);
    expect(screen.getByText("HOME")).toBeTruthy();
  });

  it("inner page opened directly: Back falls back to Home (never a dead button)", () => {
    app("/inner");
    fireEvent.click(screen.getByTestId("page-back"));
    expect(screen.getByText("HOME")).toBeTruthy();
  });

  it("inner page reached from Home: Back returns to the previous screen", () => {
    function Home() {
      const nav = useNavigate();
      return <button onClick={() => nav("/inner")}>go</button>;
    }
    window.history.replaceState({ idx: 1 }, "");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/inner" element={<PageShell titleAr="داخلي" titleEn="Inner"><p>INNER</p></PageShell>} />
          </Routes>
        </LocaleProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByText("INNER")).toBeTruthy();
    fireEvent.click(screen.getByTestId("page-back"));
    expect(screen.getByText("go")).toBeTruthy();
    window.history.replaceState(null, "");
  });
});

describe("Close buttons close what they opened", () => {
  it("full-screen tool dialog: Back (44px) closes it", () => {
    const onOpenChange = vi.fn();
    render(
      <LocaleProvider>
        <FullScreenDialog open onOpenChange={onOpenChange} titleAr="أذكار" titleEn="Athkar"><p>x</p></FullScreenDialog>
      </LocaleProvider>,
    );
    const back = screen.getByTestId("dialog-back");
    expect(back.className).toMatch(/h-11 w-11/);
    fireEvent.click(back);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Mushaf: the Back button is a 44px target and calls onBack", () => {
    const onBack = vi.fn();
    const info = { page: 1, juz: 1, hizb: 1, mainSurah: { ar: "الفاتحة", en: "Al-Fatiha" } } as unknown as Parameters<typeof MushafTopBar>[0]["info"];
    render(
      <LocaleProvider>
        <MushafTopBar visible info={info} bookmarked={false} onBack={onBack} onBookmark={vi.fn()} onOpen={vi.fn()} />
      </LocaleProvider>,
    );
    const back = screen.getByTestId("mushaf-back");
    expect(back.className).toMatch(/h-11 w-11/);
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalled();
  });

  it("ad overlay: Close is a 44px target and closes it once the countdown ends", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <LocaleProvider>
        <InterstitialAd open slot="fileConverterResult" onClose={onClose} delay={0} />
      </LocaleProvider>,
    );
    const close = screen.queryByTestId("ad-close");
    if (close) {
      expect(close.className).toMatch(/h-11/);
      fireEvent.click(close);
      expect(onClose).toHaveBeenCalled();
    } else {
      // ads switched off in this build: the overlay closes itself right away
      expect(onClose).toHaveBeenCalled();
    }
    vi.useRealTimers();
  });
});
