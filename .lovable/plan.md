## Athan Notification Scheduler — Swift + Web Parity

Deliver a production-grade local notification scheduler for the next prayer (Athan) on iOS using `UNUserNotificationCenter`, plus an equivalent in the web blueprint using the browser Notifications API so the demo mirrors the native behavior.

---

### Part A — Swift (iOS, native blueprint)

New file: `AthanScheduler.swift`

Responsibilities:
- Request authorization (`.alert`, `.sound`, `.badge`, plus `.criticalAlert` opt-in for Athan-style override of silent mode).
- Schedule notifications for **Fajr, Dhuhr, Asr, Maghrib, Isha** for the next **N days** (default 7) using `UNCalendarNotificationTrigger` with `dateMatching` from the Adhan-computed times (offsets applied).
- Optional **15-minute pre-reminder** per prayer (toggleable).
- Custom Athan sound: `UNNotificationSound(named: UNNotificationSoundName("athan_makkah.caf"))` with a fallback to `.default` and a per-prayer override (Fajr can use `athan_fajr.caf`).
- Localized title/body via `NSLocalizedString` (Arabic + English) — e.g. "حان الآن وقت صلاة الفجر" / "It's time for Fajr".
- Per-prayer notification category + actions: **Mark as Prayed**, **Snooze 5 min**, **Mute Today**.
- Identifier scheme: `athan.<yyyyMMdd>.<prayerKey>` so we can deduplicate and cancel selectively.
- `reschedule(from times: [DayPrayerTimes])` — cancels stale identifiers, registers new ones, never exceeds the iOS 64-pending-notification limit (5 prayers × 7 days = 35, safe).
- Hooks: call from `DashboardViewModel.recompute()` `didSet` of `offsets`/`method` so changes immediately resync.
- App-lifecycle: refresh on `scenePhase == .active` and via `BGAppRefreshTask` (registered identifier `com.elite.islamic.athan.refresh`) for silent daily top-ups.

Settings model (Observable):
- `athanEnabled: Bool`
- `preReminderMinutes: Int?` (nil = off; presets 5/10/15/20)
- `soundFajr / soundOther: AthanSound` enum
- `criticalAlertsEnabled: Bool`
- `mutedDates: Set<Date>` (for "Mute Today" action)

UI: small `AthanSettingsView` with toggles + sound picker, wired to existing settings screen.

---

### Part B — Web parity (this React app)

Mirror the same behavior in-browser so the blueprint demonstrates the UX. Two layers:

1. **Permission + scheduling hook** — `src/lib/athan.ts`
   - `requestAthanPermission()` → wraps `Notification.requestPermission()`.
   - `scheduleAthanForToday(entries, settings)` → for each upcoming prayer, compute `delay = time - now`, store `setTimeout` IDs; on fire, dispatch `new Notification(...)` + play `<audio>` Athan clip.
   - Tracks fired prayers in `localStorage` (`athan.fired.<yyyyMMdd>.<key>`) to survive reloads within the day.
   - Auto-reschedules at midnight and whenever `entries` change (offset/method updates).

2. **Settings persistence** — `src/lib/athanSettings.ts`
   - Stored in `localStorage` under `athan.settings`.
   - Shape: `{ enabled, preReminderMinutes, soundFajr, soundOther, mutedDates }`.

3. **UI components**
   - `src/components/islamic/AthanSettingsCard.tsx` — glass card with:
     - Master enable `Switch`
     - Pre-reminder `RadioGroup` (Off / 5 / 10 / 15 / 20 min)
     - Sound `Select` per Fajr / Other
     - "Mute today" `Button` with toast confirmation
     - Permission banner if `Notification.permission !== "granted"`
   - `src/components/islamic/NextAthanBanner.tsx` — slim badge above `HeroPrayerCard` showing "🔔 Athan in 23m · Fajr" when scheduling is active.
   - Bilingual labels via `useLocale().t(en, ar)`; design tokens only (no hardcoded colors); RTL-aware via `dir`.

4. **Hook into existing flow**
   - `Dashboard` (in `src/pages/Index.tsx`) mounts a new `useAthanScheduler(entries, settings)` hook.
   - When `getPrayerTimes` recomputes (date change), the hook resyncs.
   - Slot the new `AthanSettingsCard` into the existing grid section next to `TasbeehWidget`.

5. **Assets**
   - Add `public/sounds/athan_makkah.mp3` and `public/sounds/athan_fajr.mp3` placeholders (short royalty-free clips committed as small files, or referenced via URL fallback).

---

### Technical notes (for devs)

- Browser tab must be open for `setTimeout` to fire; document this limitation in the settings card with a small info icon. Production parity (background firing) requires a Service Worker + Push, which is out of scope here.
- All scheduling math reuses `getPrayerTimes` / `getNextPrayer` from `src/lib/prayer.ts` — no duplicated time logic.
- iOS `UNCalendarNotificationTrigger` is preferred over `UNTimeIntervalNotificationTrigger` so DST and clock changes are handled by the system.
- `criticalAlert` requires Apple entitlement — gate the toggle behind capability check.
- Identifier dedupe avoids the iOS-classic bug of stacking duplicate Adhan alerts after method/offset changes.

---

### Files touched

```text
NEW  AthanScheduler.swift                          (Swift)
NEW  AthanSettings.swift                           (Swift)
NEW  AthanSettingsView.swift                       (Swift)
NEW  src/lib/athan.ts
NEW  src/lib/athanSettings.ts
NEW  src/hooks/useAthanScheduler.ts
NEW  src/components/islamic/AthanSettingsCard.tsx
NEW  src/components/islamic/NextAthanBanner.tsx
NEW  public/sounds/athan_makkah.mp3
NEW  public/sounds/athan_fajr.mp3
EDIT src/pages/Index.tsx                           (mount hook + card + banner)
```

No changes to existing prayer-time logic, design tokens, or `LocaleContext`.