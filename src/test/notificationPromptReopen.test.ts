import { describe, it, expect, vi } from "vitest";

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: { checkPermissions: vi.fn(), requestPermissions: vi.fn() },
}));

import {
  REOPEN_NOTIFICATION_PROMPT_EVENT,
  NOTIFICATION_PERMISSION_ANSWERED_EVENT,
  requestReopenNotificationPrompt,
} from "@/components/islamic/NotificationPermissionPrompt";

describe("Settings 'Enable notifications now' reopen wiring", () => {
  it("requestReopenNotificationPrompt() dispatches the exact event the dialog listens for", () => {
    const seen: string[] = [];
    const handler = (e: Event) => seen.push(e.type);
    window.addEventListener(REOPEN_NOTIFICATION_PROMPT_EVENT, handler);
    try {
      requestReopenNotificationPrompt();
      expect(seen).toEqual([REOPEN_NOTIFICATION_PROMPT_EVENT]);
    } finally {
      window.removeEventListener(REOPEN_NOTIFICATION_PROMPT_EVENT, handler);
    }
  });

  it("repeated reopen requests fire once each — no duplicate events per call", () => {
    let count = 0;
    const handler = () => { count += 1; };
    window.addEventListener(REOPEN_NOTIFICATION_PROMPT_EVENT, handler);
    try {
      requestReopenNotificationPrompt();
      requestReopenNotificationPrompt();
      requestReopenNotificationPrompt();
      expect(count).toBe(3);
    } finally {
      window.removeEventListener(REOPEN_NOTIFICATION_PROMPT_EVENT, handler);
    }
  });

  it("the reopen event and the answered event are distinct names", () => {
    expect(REOPEN_NOTIFICATION_PROMPT_EVENT).not.toBe(NOTIFICATION_PERMISSION_ANSWERED_EVENT);
  });
});
