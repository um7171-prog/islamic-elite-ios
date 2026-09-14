# UI Declutter & Scanner/QR Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, checkpoint-per-phase) to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up and reorganize the Islamic Elite app's UI (remove dead/redundant surface area, simplify navigation, fix real bugs in the Document Scanner and QR tool), as preparation before starting notification work — without touching notifications, signing, Bundle ID, or Codemagic config.

**Architecture:** Four sequential phases on branch `cleanup/ui-declutter` (off `main`), one commit per phase minimum. Each phase ends in a state that builds and runs. Phase 4 is verification only (typecheck/lint/build/route smoke test), no new changes.

**Tech Stack:** Vite + React 18 + TypeScript + shadcn/Tailwind, React Router, Capacitor (iOS), Supabase.

**Spec:** This plan is derived directly from the user's phased request in-conversation (2026-09-14) plus two investigation passes (route/page/tool inventory; Document Scanner + QR deep-dive) and the user's answers to two clarifying questions. No separate spec doc exists — this plan file is the spec.

## Global Constraints (from the user, verbatim intent)
- Do NOT touch notification code, APNs files, or Local Notifications files in any phase (`src/lib/nativeAthan.ts`, `src/lib/nativeNotify.ts`, `src/lib/athanSettings.ts`, `src/lib/pushDevice.ts`, `src/pages/NotificationDiagnostics.tsx`, `src/components/NativeNotificationRouter.tsx`, anything under `supabase/functions/register-device-token|send-announcement-push`, `ios/App/App/*.entitlements`, `capacitor.config.ts` LocalNotifications block).
- Do NOT change Bundle ID, Codemagic config (`codemagic.yaml`), or any code-signing setting (`project.pbxproj`, `ExportOptions.plist`).
- Do NOT delete any code before confirming zero remaining references/imports to it.
- Do NOT change core app functionality without explaining the change first.
- Final deliverable: a report covering what was removed, what was reorganized, what was fixed in the scanner/QR tools, verification results, and remaining known issues.

---

## Phase 1 — Remove dead/misleading UI, confirm no active TikTok/YouTube tool

Investigation finding: TikTok/YouTube downloading was already removed in a prior audit. There is no active tool to delete. What remains and what to do with it:

- [ ] **Task 1.1 — Fix misleading "video downloads" marketing copy**
  **Files:** Modify `src/pages/Index.tsx:203-206,210`
  Replace the "video downloads" (`تحميل الفيديوهات`) hero copy/badge — which no longer reflects reality (only direct-file-link downloads work now) — with copy describing what the Media/downloader tab actually does today (direct-link file downloads + file conversion). Keep the existing bilingual (en/ar) structure and tone.
  Leave `src/pages/Admin.tsx:371-378,505-509` (historical TikTok/YouTube stat counters) and `src/components/islamic/DownloadManager.tsx:18-22,310-311` (the rejection-message guard) **untouched** — user decision: admin stats stay as historical record; the guard is good UX and stays.

- [ ] **Task 1.2 — Remove the empty "Customization" placeholder section**
  **Files:** Modify `src/pages/Settings.tsx:322-334`
  This section has no interactive controls, only a "coming soon" placeholder sentence. Confirm first (grep) that no other component imports or links to this specific section/anchor before removing the block. Remove the whole non-functional `Section`.

- [ ] **Task 1.3 — Leave `NotificationDiagnostics.tsx` alone**
  No action. It is dead code (unrouted) but it is notification code — explicitly out of scope for this cleanup per the global constraint. Revisit when the notifications phase starts.

- [ ] **Task 1.4 — Commit**
  `git add -A && git commit -m "Phase 1: remove dead UI, fix stale downloader marketing copy"`

---

## Phase 2 — Reorganize & declutter navigation

### Task 2.1 — Collapse the Counters/Islamic/School/National "single occasion" tiles into their "-all" list views

**Investigation finding:** In `src/components/services/ServicesHub.tsx`, `TOOLS` currently exposes 19 single-occasion tiles (`gov-salary`, `private-salary`, `citizen-account`, `social-security`, `retirement-pension`; `school-start`, `autumn-break`, `term1-end`, `midyear-break`, `year-end`, `summer-break`; `ramadan`, `eid-fitr`, `eid-adha`, `arafah`, `ashura`, `hijri-new`) that each render `<SingleCountdown id="..."/>` — a *detailed* view (hours/min/sec grid + weekday/Gregorian/Hijri breakdown) of ONE event. Their respective umbrella tiles (`all-payouts`, `school-all`, `islamic-all`) already list every event in that category via `<EventList/>` in a *compact* row (name, date, days-left, ticking clock), sorted by nearest. This is the main source of the "43 tools" sprawl the user flagged.

**Files:**
- Modify: `src/components/services/Counters.tsx` (the `EventList` function, ~line 129) — make each `CountdownRow` inside `EventList` open the detailed `SingleCountdown` view on tap (reuse the existing `Dialog` pattern already used elsewhere in `ServicesHub.tsx`, or an inline expand/collapse — inline expand is simpler and avoids a dialog-in-dialog).
- Modify: `src/components/services/ServicesHub.tsx` — remove the 16 single-occasion entries listed above from the `TOOLS` array (keep `all-payouts`, `school-all`, `holidays`, `islamic-all`). Keep `retirement` and `custom` (genuinely different tools, not umbrella duplicates) and `national-day`/`founding-day` (only 2 items each — lower clutter payoff, ask user before removing if desired later).

**Interfaces:**
- Consumes: `PAYOUT_EVENTS`, `SCHOOL_COUNTDOWNS`, `ISLAMIC_EVENTS`, `NATIONAL_EVENTS` from `src/lib/dailyTools.ts` (unchanged).
- Produces: `EventList` gains a tap-to-expand row; no external API changes, `SingleCountdown(id)` stays exported and usable (still used by `retirement`-adjacent code if any — verify via grep before assuming safe).

- [ ] **Step 1:** Grep for every remaining usage of `SingleCountdown` and each of the 16 ids being removed from `TOOLS`, across `src/`, to confirm nothing else references these ids directly (e.g. deep links, favorites/recents in `localStorage` keys are just strings and degrade gracefully — a stale favorite id that no longer matches a `TOOLS` entry should be filtered out safely; verify `filtered`/favorites code in `ServicesHub.tsx` doesn't crash on an unknown id).
- [ ] **Step 2:** Add tap-to-expand to `EventList` rows (compact row stays default; tapping reveals the same detail grid `SingleCountdown` shows, inline, without navigating away).
- [ ] **Step 3:** Remove the 16 entries from `TOOLS` in `ServicesHub.tsx`.
- [ ] **Step 4:** Manually verify in the running dev app: `all-payouts`, `school-all`, `islamic-all` open, list all their events, and tapping a row expands full detail with no console error.
- [ ] **Step 5:** Commit: `git commit -am "Phase 2: collapse single-occasion tiles into their umbrella lists"`

### Task 2.2 — Tidy the home page and top-level structure
**Files:** `src/pages/Index.tsx`
- [ ] Confirm the home tab, "My Tools" tab, and Media tab each have a clear single purpose with no repeated content between them (read current structure, note anything shown twice).
- [ ] Ensure "Daily Services Center" (المناسبات/الخدمات) is reachable within 1 tap from the home screen (check current tab depth) — if it already is, no change needed; report either way.
- [ ] Commit any changes: `git commit -am "Phase 2: home page structure pass"`

### Task 2.3 — Design consistency pass
**Files:** components under `src/components/islamic/`, `src/components/services/` touched above
- [ ] Check spacing/heading/button classes for the touched files match the rest of the app's shadcn conventions (no ad-hoc one-off styles introduced by this cleanup).
- [ ] Commit: `git commit -am "Phase 2: spacing/heading consistency in touched components"`

### Task 2.4 — Navigation/back behavior check
- [ ] Manually click through: bottom nav (Home/Tools/Media), side drawer (every item from the earlier inventory), and browser/hardware back from at least 3 nested dialogs (ServicesHub tool dialog, AthkarDialog, QuranDialog). Confirm no hang, no stuck overlay, no back-button loop.
- [ ] Report results in the final report (Phase 4 section).

---

## Phase 3 — Deep-fix Document Scanner and QR tool

All findings below are from direct code investigation (exact file:line references) — not guesses.

### Task 3.1 — Document Scanner fixes
**Files:** Modify `src/components/islamic/DocumentScannerDialog.tsx`

- [ ] **3.1.a (highest priority) — Fix camera-unbound-after-reopen bug.** Root cause: `start()` runs in the same effect tick as `setView("camera")` (`:438-446`), but `<video>` only mounts when `view === "camera"` is committed to the DOM; if the dialog was previously left in `"gallery"`/`"review"` view, `videoRef.current` is stale/null when `start()` assigns `srcObject` (`:414-417`), so the camera stream goes live but is silently never attached — black/frozen preview with `permission: "granted"`. Fix: reset `view` to `"camera"` synchronously on close (in `stop()`/dialog close handler) instead of relying on the open-effect, OR split into two effects — one that sets view, a second (keyed on `view === "camera"`) that calls `start()` only after the video element is confirmed mounted. Repro to verify against: scan → Finish → close (X) → reopen → camera must show a live, bound preview immediately.
- [ ] **3.1.b — Add `onerror` to `loadImage()`** (`:30-36`). On image decode failure, reject the promise (mirror the existing pattern in `src/lib/aiImage.ts:5-19`'s `fileToImage`) and surface a bilingual toast instead of leaving `busy`/`reviewBusy` stuck `true` forever.
- [ ] **3.1.c — Fix contradictory `getUserMedia` constraints** (`:403`). Change `width: { ideal: 3840 }, height: { ideal: 2160 }` to `width: { ideal: 2160 }, height: { ideal: 3840 }` to actually match the stated `aspectRatio: { ideal: 3/4 }` portrait intent.
- [ ] **3.1.d — Fix non-functional canvas overlay color** (`:465-466,472-473`). `ctx.strokeStyle`/`fillStyle` can't resolve `hsl(var(--accent))` (canvas doesn't participate in the CSS cascade) and silently stays black. Read the actual computed accent color at draw time (e.g. `getComputedStyle(canvasEl).getPropertyValue('--accent')` resolved to a real `hsl()` string, or pass a resolved color constant) so the live detection quad is visibly accent-colored, not black.
- [ ] **3.1.e — Wire denied-permission retry to iOS Settings.** On the permission-denied screen (`:797-805`), alongside "Allow camera" (which won't reprompt once iOS has recorded a denial), add a button that calls the existing `openNativeAppSettings()` (`src/lib/nativeAthan.ts:554-561`) so the user has a real recovery path.
- [ ] **3.1.f — Surface an error on `grabFrame()` failure** instead of a silent no-op in `manualCapture`/`captureWithQuad` (`:521-542`) — show a brief bilingual toast ("camera not ready, try again") instead of doing nothing on tap.
- [ ] Commit: `git commit -am "Phase 3: fix Document Scanner camera-rebind, error handling, and constraint bugs"`

### Task 3.2 — QR tool fixes
**Files:** Modify `src/components/islamic/QRScannerDialog.tsx`

- [ ] **3.2.a (highest priority) — Fix empty-string QR result being treated as "no result."** `setResult(res.getText())` (`:91`) can be `""` for a QR encoding empty content; every UI branch (`:146,203,239`) does a plain truthiness check on `result`, so an empty-string scan leaves a dead camera (already stopped) showing stale "point camera at QR" text with the Rescan button unreachable. Fix: track scan state with an explicit `hasScanned: boolean` (set `true` in the decode callback regardless of string content) separate from the `result` string value, and gate all three branches on `hasScanned` instead of `result`'s truthiness.
- [ ] **3.2.b — Add a `navigator.mediaDevices` support pre-check**, mirroring `DocumentScannerDialog.tsx:401`, before calling `getUserMedia` in `start()` (`:59-118`), so unsupported environments get the same bilingual friendly message instead of a raw untranslated `TypeError`.
- [ ] **3.2.c — Wire denied-permission retry to iOS Settings** (same `openNativeAppSettings()` fix as 3.1.e).
- [ ] Commit: `git commit -am "Phase 3: fix QR empty-result bug and permission handling"`

**Explicitly out of scope for this pass** (functional gaps, not bugs — flag in the final report for the user to decide on separately): no QR generator exists; no image-upload QR scanning path exists; non-HTTP QR payloads (`tel:`, `mailto:`, `geo:`, `WIFI:`, vCard) are shown as inert plain text with only Copy.

---

## Phase 4 — Verification (no functional changes)

- [ ] **4.1** Run `npx tsc --noEmit` (or `npm run build` which type-checks as part of Vite/esbuild — confirm project's actual typecheck command from `package.json`) from `qibla-divine-compass-main/`. Record pass/fail and any errors.
- [ ] **4.2** Run `npm run lint`. Record pass/fail and any warnings introduced by this cleanup.
- [ ] **4.3** Run `npm run build`. Confirm it completes and `dist/` is produced.
- [ ] **4.4** Run `npm run test` (Vitest) if any tests touch changed files; otherwise note that no automated tests cover the changed UI.
- [ ] **4.5** Manually visit every route from the Phase-0 inventory in the dev server (`npm run dev`) and confirm each renders without a blank page or console error: `/`, `/tools`, `/calendar`, `/athkar`, `/qibla`, `/quran`, `/tasbeeh`, `/translate`, `/weather`, `/notifications`, `/qr-scanner`, `/document-scanner`, `/media`, `/mushaf`, `/ai`, `/ai/background-remover`, `/ai/image-enhancer`, `/ai/ocr`, `/privacy`, `/terms`, `/contact`, `/about`, `/cookies`, `/disclaimer`, `/faq`, `/saudi-jobs`, `/government-jobs`, `/sitemap`, `/settings`.
- [ ] **4.6** Check browser devtools console for errors/warnings on each visited route; record any found.
- [ ] **4.7** Write the final report (see Global Constraints deliverable list) as `qibla-divine-compass-main/UI_CLEANUP_REPORT_<date>_AR.md`, covering: what was removed, what was reorganized, what was fixed in scanner/QR, verification results, remaining known issues (including the out-of-scope QR/scanner gaps from Phase 3 and the deferred `NotificationDiagnostics.tsx`/national-occasion-tiles decisions).

---

## Self-Review Notes
- Spec coverage: all 4 user-specified phases have tasks; all "do not touch" constraints are threaded through every phase's task list, not just stated once.
- No placeholders: every task names exact files/lines from verified investigation, not "fix bugs in X" generically.
- Open decision carried forward (not silently resolved): whether to also collapse `national-day`/`founding-day` into `national-all` (lower clutter payoff, 2 items only) — left for the user to confirm during Phase 2 review rather than assumed.
