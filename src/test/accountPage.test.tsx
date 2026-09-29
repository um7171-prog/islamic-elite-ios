import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { CityProvider } from "@/contexts/CityContext";
import { PrayerCalcProvider } from "@/contexts/PrayerCalcContext";

/** The account screen: email code sign-in, session restore, sign-out through the coordinator. No sync. */

const h = vi.hoisted(() => {
  const listeners: (() => void)[] = [];
  return {
    listeners,
    configured: true,
    session: null as { userId: string; sessionId: string } | null,
    auth: {
      getCurrentSession: vi.fn(),
      getCurrentUser: vi.fn(),
      sendEmailOtp: vi.fn(),
      verifyEmailOtp: vi.fn(),
      signOut: vi.fn(),
      deleteAccount: vi.fn(),
    },
    coordinator: { signOut: vi.fn(), syncNow: vi.fn(), inspect: vi.fn() },
    client: {
      auth: {
        onAuthStateChange: vi.fn((cb: () => void) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    },
  };
});

vi.mock("@/lib/account/accountAuth", async (orig) => ({ ...(await orig<typeof import("@/lib/account/accountAuth")>()), accountAuth: h.auth }));
vi.mock("@/lib/account/client", () => ({ getAccountsClient: () => (h.configured ? h.client : null) }));
vi.mock("@/lib/accountSync/accountSyncCoordinator", () => ({ createDefaultAccountSyncCoordinator: () => h.coordinator }));

import AccountPage from "@/pages/AccountPage";
import MorePage from "@/pages/MorePage";

const USER = { userId: "aaaaaaaa-1111-4111-8111-111111111111", sessionId: "s-1" };

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <LocaleProvider>
            <CityProvider>
              <PrayerCalcProvider>
                <Routes>
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="/more" element={<MorePage />} />
                </Routes>
              </PrayerCalcProvider>
            </CityProvider>
          </LocaleProvider>
        </ThemeProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}
const stateOf = () => document.querySelector("[data-account-state]")?.getAttribute("data-account-state");
const emailInput = () => screen.getByLabelText("البريد الإلكتروني") as HTMLInputElement;
const codeInput = () => screen.getByLabelText("الرمز") as HTMLInputElement;

async function toCodeStep(email = "user@example.com") {
  renderAt("/account");
  await waitFor(() => expect(stateOf()).toBe("signed-out"));
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "أرسل الرمز" }));
  await screen.findByLabelText("الرمز");
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "ar");
  h.configured = true;
  h.session = null;
  h.listeners.length = 0;
  for (const f of Object.values(h.auth)) f.mockReset();
  for (const f of Object.values(h.coordinator)) f.mockReset();
  h.auth.getCurrentSession.mockImplementation(async () => h.session);
  h.auth.getCurrentUser.mockImplementation(async () => (h.session ? { id: h.session.userId, email: "user@example.com" } : null));
  h.auth.sendEmailOtp.mockResolvedValue({ ok: true, value: undefined });
  h.coordinator.signOut.mockImplementation(async () => { h.session = null; return { status: "signed-out", detached: true }; });
});
afterEach(() => cleanup());

describe("More -> Account", () => {
  it("the More page has an «الحساب» row that opens /account", () => {
    renderAt("/more");
    const row = document.querySelector('[data-more="account"]') as HTMLAnchorElement;
    expect(row.textContent).toContain("الحساب");
    expect(row.getAttribute("href")).toBe("/account");
  });
});

describe("opening the screen", () => {
  it("signed out: the email step", async () => {
    renderAt("/account");
    expect(stateOf()).toBe("loading");
    await waitFor(() => expect(stateOf()).toBe("signed-out"));
    expect(emailInput()).toBeTruthy();
  });
  it("a valid stored session is restored: signed in straight away (app reopened)", async () => {
    h.session = USER;
    renderAt("/account");
    await waitFor(() => expect(stateOf()).toBe("signed-in"));
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(h.auth.sendEmailOtp).not.toHaveBeenCalled();
  });
  it("accounts not configured: a plain notice, no request", async () => {
    h.configured = false;
    renderAt("/account");
    await waitFor(() => expect(stateOf()).toBe("not-configured"));
    expect(screen.getByText("الحساب غير متاح حاليًا.")).toBeTruthy();
    expect(h.auth.getCurrentSession).not.toHaveBeenCalled();
  });
  it("follows sign-in / sign-out events from the accounts client", async () => {
    renderAt("/account");
    await waitFor(() => expect(stateOf()).toBe("signed-out"));
    h.session = USER;
    act(() => { for (const cb of h.listeners) cb(); });
    await waitFor(() => expect(stateOf()).toBe("signed-in"));
  });
});

describe("sending the code", () => {
  it("sends through accountAuth.sendEmailOtp, then asks for the code", async () => {
    await toCodeStep("User@Example.com ");
    // The field's own value is passed as typed (accountAuth trims and lower-cases it).
    expect(h.auth.sendEmailOtp).toHaveBeenCalledWith(expect.stringMatching(/^User@Example.coms*$/));
    expect(document.querySelector('[data-account="code-sent"]')?.textContent).toContain("User@Example.com");
  });
  it("an email with no account gets exactly the same answer (the screen never reveals it)", async () => {
    await toCodeStep();
    const registered = document.querySelector('[data-account="code-sent"]')?.textContent;
    cleanup();
    h.auth.sendEmailOtp.mockResolvedValue({ ok: false, error: "rejected" });
    await toCodeStep();
    expect(document.querySelector('[data-account="code-sent"]')?.textContent).toBe(registered);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("invalid email, too many attempts, offline: an error, still on the email step", async () => {
    for (const [error, text] of [["invalid-email", "أدخل بريدًا إلكترونيًا صحيحًا."], ["rate-limited", "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة."], ["network", "تعذّر الاتصال بالخادم. تحقّق من الإنترنت."]] as const) {
      h.auth.sendEmailOtp.mockResolvedValue({ ok: false, error });
      renderAt("/account");
      await waitFor(() => expect(stateOf()).toBe("signed-out"));
      fireEvent.change(emailInput(), { target: { value: "x@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "أرسل الرمز" }));
      expect((await screen.findByRole("alert")).textContent).toBe(text);
      expect(document.querySelector('[data-account-step="email"]')).toBeTruthy();
      cleanup();
    }
  });
  it("shows a loading state while sending (button disabled)", async () => {
    let done!: (v: unknown) => void;
    h.auth.sendEmailOtp.mockReturnValue(new Promise((r) => { done = r; }));
    renderAt("/account");
    await waitFor(() => expect(stateOf()).toBe("signed-out"));
    fireEvent.change(emailInput(), { target: { value: "x@example.com" } });
    const btn = screen.getByRole("button", { name: "أرسل الرمز" }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));
    await act(async () => { done({ ok: true, value: undefined }); });
    await screen.findByLabelText("الرمز");
  });
  it("resend waits 60 seconds, then sends again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await toCodeStep();
      const resend = document.querySelector('[data-account="resend"]') as HTMLButtonElement;
      expect(resend.disabled).toBe(true);
      for (let i = 0; i < 61; i++) await act(async () => { vi.advanceTimersByTime(1000); });
      await waitFor(() => expect(resend.disabled).toBe(false));
      fireEvent.click(resend);
      await waitFor(() => expect(h.auth.sendEmailOtp).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("verifying the code", () => {
  it("only 6 digits are accepted in the field; the button waits for all 6", async () => {
    await toCodeStep();
    fireEvent.change(codeInput(), { target: { value: "12a 3-45" } });
    expect(codeInput().value).toBe("12345");
    expect((screen.getByRole("button", { name: "تحقّق" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(codeInput(), { target: { value: "1234567" } });
    expect(codeInput().value).toBe("123456");
    expect((screen.getByRole("button", { name: "تحقّق" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("a wrong or expired code: an error, still on the code step", async () => {
    h.auth.verifyEmailOtp.mockResolvedValue({ ok: false, error: "invalid-code" });
    await toCodeStep();
    fireEvent.change(codeInput(), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect((await screen.findByRole("alert")).textContent).toBe("الرمز غير صحيح أو انتهت صلاحيته.");
    expect(document.querySelector('[data-account-step="code"]')).toBeTruthy();
  });
  it("the right code: verified through accountAuth.verifyEmailOtp, then signed in", async () => {
    h.auth.verifyEmailOtp.mockImplementation(async () => { h.session = USER; return { ok: true, value: { id: USER.userId, email: "user@example.com" } }; });
    await toCodeStep();
    fireEvent.change(codeInput(), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await waitFor(() => expect(stateOf()).toBe("signed-in"));
    expect(h.auth.verifyEmailOtp).toHaveBeenCalledWith("user@example.com", "123456");
    expect(screen.getByText("user@example.com")).toBeTruthy();
  });
  it("change email goes back to the email step", async () => {
    await toCodeStep();
    fireEvent.click(document.querySelector('[data-account="change-email"]') as HTMLElement);
    expect(document.querySelector('[data-account-step="email"]')).toBeTruthy();
  });
});

describe("signing out", () => {
  it("goes through coordinator.signOut (never accountAuth.signOut) and returns to the email step", async () => {
    h.session = USER;
    renderAt("/account");
    await waitFor(() => expect(stateOf()).toBe("signed-in"));
    fireEvent.click(document.querySelector('[data-account="sign-out"]') as HTMLElement);
    await waitFor(() => expect(stateOf()).toBe("signed-out"));
    expect(h.coordinator.signOut).toHaveBeenCalledOnce();
    expect(h.auth.signOut).not.toHaveBeenCalled();
  });
  it("a failed sign-out is reported and the screen follows the real session", async () => {
    h.session = USER;
    h.coordinator.signOut.mockResolvedValue({ status: "failed", detached: true });
    renderAt("/account");
    await waitFor(() => expect(stateOf()).toBe("signed-in"));
    fireEvent.click(document.querySelector('[data-account="sign-out"]') as HTMLElement);
    await waitFor(() => expect(h.coordinator.signOut).toHaveBeenCalledOnce());
    expect(stateOf()).toBe("signed-in"); // the session is still there
  });
});

describe("scope", () => {
  it("no sync, no account deletion, no sign-up from this screen", async () => {
    h.session = USER;
    renderAt("/account");
    await waitFor(() => expect(stateOf()).toBe("signed-in"));
    fireEvent.click(document.querySelector('[data-account="sign-out"]') as HTMLElement);
    await waitFor(() => expect(stateOf()).toBe("signed-out"));
    expect(h.coordinator.syncNow).not.toHaveBeenCalled();
    expect(h.auth.deleteAccount).not.toHaveBeenCalled();
    const { ALLOW_NEW_ACCOUNTS } = await import("@/lib/account/accountAuth");
    expect(ALLOW_NEW_ACCOUNTS).toBe(false);
  });
});
