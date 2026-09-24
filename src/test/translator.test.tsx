import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// The screen talks only to /api/translate (src/lib/translation/translateClient.ts). The network
// call is stubbed here; what is proven is how the screen treats each kind of answer. The server
// side and a REAL translation are covered in translateCore.test.ts.
const invoke = vi.fn();
vi.mock("@/lib/translation/translateClient", () => ({ requestTranslation: (...a: unknown[]) => invoke(...a) }));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn(), info: vi.fn() } }));

import { LocaleProvider } from "@/contexts/LocaleContext";
import { TranslatorDialog } from "@/components/islamic/TranslatorDialog";

function renderTranslator() {
  return render(
    <LocaleProvider>
      <TranslatorDialog open onOpenChange={() => undefined} hideTrigger />
    </LocaleProvider>,
  );
}
const selects = () => screen.getAllByRole("combobox") as HTMLSelectElement[];
const typeAndTranslate = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText(/اكتب النص|Enter text/), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /^(ترجمة|Translate)$/ }));
};
const outputText = () => document.body.textContent ?? "";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "ar");
  invoke.mockReset();
  toastError.mockClear();
});
afterEach(() => cleanup());

describe("Translator", () => {
  it("opens as Arabic -> English by default (also when the app is in English)", () => {
    renderTranslator();
    expect(selects()[0].value).toBe("ar");
    expect(selects()[1].value).toBe("en");
    cleanup();
    localStorage.setItem("lang", "en");
    renderTranslator();
    expect(selects()[0].value).toBe("ar");
    expect(selects()[1].value).toBe("en");
  });

  it("success: sends the Arabic text ar -> en and shows the real translation", async () => {
    invoke.mockResolvedValue({ translation: "Welcome" });
    renderTranslator();
    typeAndTranslate("مرحبا بك");
    await waitFor(() => expect(outputText()).toMatch(/Welcome/));
    expect(invoke).toHaveBeenCalledWith({ text: "مرحبا بك", from: "ar", to: "en", imageDataUrl: null });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("service unreachable: a clear error, no output (no fake success)", async () => {
    invoke.mockResolvedValue({ error: "unreachable" });
    renderTranslator();
    typeAndTranslate("مرحبا بك");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/تعذّر الوصول إلى خدمة الترجمة/);
    expect(outputText()).not.toMatch(/Welcome/);
  });

  it("the server's reason (rate limit) is shown instead of a generic failure", async () => {
    invoke.mockResolvedValue({ error: "rate_limit" });
    renderTranslator();
    typeAndTranslate("مرحبا بك");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/طلبات كثيرة/);
  });

  it("no real translation (empty / service error) is a failure, never shown as success", async () => {
    invoke.mockResolvedValue({ error: "service" });
    renderTranslator();
    typeAndTranslate("مرحبا بك");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/فشلت الترجمة/);
  });
});
