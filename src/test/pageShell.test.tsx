import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { PageShell } from "@/components/site/PageHeader";
import { BottomNav } from "@/components/islamic/BottomNav";

function renderAt(path: string, lang: "ar" | "en", ui: React.ReactNode) {
  localStorage.setItem("lang", lang);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocaleProvider>{ui}</LocaleProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.clear());

describe("shared page header", () => {
  it("Arabic UI: Arabic title large + English subtitle, RTL, with a Back button", () => {
    const { container } = renderAt("/x", "ar", <PageShell titleAr="التقويم" titleEn="Calendar">body</PageShell>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("التقويم");
    expect(container.textContent).toContain("Calendar");
    expect(screen.getByTestId("page-back")).toBeTruthy();
  });

  it("English UI: English title only — no Arabic text", () => {
    const { container } = renderAt("/x", "en", <PageShell titleAr="التقويم" titleEn="Calendar">body</PageShell>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Calendar");
    expect(/[؀-ۿ]/.test(container.textContent ?? "")).toBe(false);
  });

  it("top-level tabs can hide Back", () => {
    renderAt("/x", "en", <PageShell titleAr="الإعدادات" titleEn="Settings" hideBack>body</PageShell>);
    expect(screen.queryByTestId("page-back")).toBeNull();
  });
});

describe("bottom navigation", () => {
  it("has the five tabs and marks the current one", () => {
    const { container } = renderAt("/calendar", "ar", <BottomNav />);
    const tabs = Array.from(container.querySelectorAll("[data-nav]")).map((e) => e.getAttribute("data-nav"));
    expect(tabs).toEqual(["home", "tools", "favorites", "appointments", "settings"]);
    expect(container.querySelector('[data-nav="appointments"]')!.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector('[data-nav="home"]')!.getAttribute("aria-current")).toBeNull();
  });

  it("pages opened from Services keep the Services tab active", () => {
    const { container } = renderAt("/calculators", "en", <BottomNav />);
    expect(container.querySelector('[data-nav="tools"]')!.getAttribute("aria-current")).toBe("page");
  });
});
