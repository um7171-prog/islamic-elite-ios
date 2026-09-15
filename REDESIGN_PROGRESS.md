# Islamic Elite — Redesign Progress

Branch: `islamic-elite-redesign-2026`
Restore point: tag `pre-redesign-2026-09-15` on `main-current-2026-09-14` (pushed to GitHub)

## Important note on reference images

The request referenced "reference images" for the visual identity, but no
images were actually attached or visible anywhere in this conversation.
Everything below was built from the detailed **text** specification given
(colors, per-page layout description, iOS-quality feel). If you have the
actual reference images, please share them so the palette and layouts can be
checked/refined against them directly — what exists now has not been
compared to any image.

## Phase 0 — Protection (done)

- Created git tag `pre-redesign-2026-09-15` on the pre-redesign commit
  (`89bf4ed`) and pushed it to `origin`, so the exact pre-redesign state is
  always recoverable.
- Created branch `islamic-elite-redesign-2026` off `main-current-2026-09-14`.
  `main` was never touched.
- Recorded the baseline before any redesign changes:
  - `npx tsc --noEmit`: clean, 0 errors.
  - `npm run lint`: 129 problems (90 errors, 39 warnings) — all pre-existing,
    unrelated to this work.
  - `npm run test`: 32/32 passing (9 files).
  - `npm run build`: succeeds.
- No files were deleted in this phase.

## Phase 1 — Design system foundation (done)

**File changed:** `src/index.css` only. No component/page files touched.

The app already had a genuinely centralized, HSL CSS-variable color system
(`:root` for dark, `.light` class for light mode) consumed everywhere via
Tailwind's `bg-background`, `text-foreground`, `text-accent`, etc. — a repo
scan confirmed **zero** files hardcode the old raw HSL values outside
`index.css`, so retuning the token *values* re-skins the whole app safely
without touching a single component.

Changes made, light mode (`.light`) only — dark mode was reviewed and
already matches the spec (pure black background + charcoal cards + emerald
primary + gold accent tokens), so it was left untouched:

| Token | Before | After | Reason |
|---|---|---|---|
| `--background` | `45 40% 97%` (warm cream) | `30 20% 97%` (neutral light gray/white) | Spec: "white and light gray for cards and backgrounds" |
| `--foreground` | `165 40% 10%` (dark teal) | `25 35% 15%` (dark brown) | Spec: "dark brown for headings in light mode" |
| `--card-foreground` | `165 40% 10%` | `25 35% 15%` | Match foreground |
| `--border` | `165 15% 88%` (teal-tinted gray) | `30 12% 88%` (warm-neutral gray) | Remove leftover teal tint from neutrals |
| `--muted-foreground` | `165 15% 40%` | `25 12% 42%` | Same |
| `--glass-border` | `165 30% 25% / 0.10` | `25 25% 25% / 0.10` | Same |
| `html.light` background + body gradient stops | `45 40%`/`45 60%`/`40 30%` (cream) | `30 20%`/`30 25%`/`28 15%` (neutral) | Match new background tone |

`--primary` (emerald, `158 64% 35%` light / `158 64% 42%` dark) and the
`--elite-gold-*` accent tokens were **not** changed — they already matched
the requested emerald/turquoise + calm gold identity.

**Verified, not just claimed:**
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds.
- `npm run test`: 32/32 passing (same as baseline — a pure CSS-variable
  change cannot affect test outcomes, confirmed anyway).
- `npx cap sync ios`: succeeds (`Package.swift` reverted per the known
  Windows-only path-corruption quirk, unrelated to this change).
- **Visual check via a real headless-browser screenshot** (not just build
  success) of the home page in both themes, at iPhone width (390px):
  dark mode unchanged (pure black, white text, emerald/gold accents); light
  mode now shows the intended off-white/light-gray background with
  dark-brown headings and the same emerald/gold accents. Screenshots were
  taken to confirm this and then deleted (not committed).

## What has NOT been done yet

This is a large, multi-phase redesign. Only the protection phase and the
design-token foundation are complete. Still pending, in the order the
request specified:

1. **Home page rebuild** — current-prayer header, large countdown, the
   five-prayer strip, Hijri/Gregorian date, quick-access shortcuts. The
   existing Home page (`src/pages/Index.tsx`, `HeroPrayerCard.tsx`,
   `PrayerStrip.tsx`, `DateHeader.tsx`) already has most of these elements
   functionally; this phase is about restyling them to the new visual
   language, not adding missing features.
2. **Services grid page** — a unified, elegant icon grid. The full audit of
   every existing service is now done (see "Services inventory" below).
   Layout work has not started yet — see the open decision that blocks it.
3. **Athkar page** restyle (tabs, cards, counter, share, audio, RTL/LTR).
4. **Qibla page** restyle (large compass, bearing display, sensor-accuracy
   messaging) — the underlying sensor/accuracy logic was already audited
   and partly fixed in the previous session; this phase is visual only.
5. **Events/Calendar page** restyle (Hijri+Gregorian list, identity-colored
   highlights) — UTC/timezone correctness here was already audited and
   fixed in the previous session.
6. **Ads/subscription placement review** — confirm ads never overlap the
   bottom nav or content, and that Premium/remove-ads logic is untouched
   and simply reskinned.
7. **Centralized key-based translation system** (item 8 of the language
   requirement). The app already satisfies requirements 1–7 of the
   language section today: real device-language detection on first launch
   (`navigator.language` in `LocaleContext.tsx`), a manual language switch
   in Settings, the choice persisted to `localStorage`, and a full RTL/LTR
   flip of `document.documentElement.dir` app-wide. What it does **not**
   have is a centralized key → translation-file lookup — text is passed
   inline as `t("English", "Arabic")` at every call site, which works
   correctly today but isn't "centralized" in the way requested.
   Converting hundreds of these call sites across the whole app to a
   key-based system is a large, mechanical, high-regression-risk refactor
   that deserves its own dedicated, carefully-tested pass rather than being
   rushed alongside visual changes — flagging this rather than guessing at
   a rushed conversion, per the instruction to stop and record rather than
   force an unsafe change.

## Services inventory (full audit, done)

Every service currently reachable in the app was found and checked for real
(not placeholder) logic. **Nothing is broken** — every existing service
works. The problems are entirely about *inconsistent placement*, not dead
code:

- **Home page's "Tools" tab currently stacks three unrelated UI blocks**:
  `QuickServices` (10-item icon grid), `ServicesHub` (18-item searchable
  card grid with categories/favorites), and `EliteTools` (a small 2-card
  section). This is exactly the fragmentation the unified grid is meant to
  fix.
- **Duplicated Quran experience**: `QuranDialog.tsx` (surah list, per-ayah
  text, reciter audio, bookmarks — fully built) is only reachable by typing
  the `/quran` URL directly; the visible "Quran" icon instead navigates to
  the separate Mushaf page-image reader (`/mushaf`). Two non-integrated
  "read Quran" experiences exist side by side.
- **File Converter not shown where it's coded**: `EliteTools.tsx` exports a
  full 16-conversion `FileConverter`, but `EliteTools()` itself never
  renders it — it's only reachable via the dedicated `/convert` route. Not
  a bug (the route works fine), just inconsistent with its own file.
- **Government Jobs and the 3 AI tools** (Background Remover, Image
  Enhancer, OCR) are fully working but live only in the side menu, not in
  any services grid.
- **Dead code found**: `AppointmentsPanel.tsx` (533 lines, a complete
  appointments/calendar feature) is not imported anywhere in the app —
  superseded by `EventsCalendar.tsx`, which is the one users actually see.
  Reporting this, not deleting it, per instructions.
- **"Academic calendar" is labeled/treated as education-adjacent** in
  `ServicesHub` but it is Saudi school-term/holiday dates, not Islamic
  teaching content.

### The four explicitly-requested features — do not exist

A full-repo search found **no implementation anywhere** (not hidden, not
broken — genuinely unwritten) for:

1. **99 Names of Allah (أسماء الله الحسنى)**
2. **Islamic education / learning content** (fiqh, hadith, seerah, etc. —
   the "academic calendar" above is unrelated school dates)
3. **Islamic wallpapers/backgrounds**
4. **A dedicated Ramadan feature/mode** — Ramadan today is only one entry
   in an occasions countdown list, plus an Isha-notification-delay toggle
   in Athan settings; there is no fasting tracker, Suhoor/Iftar timer, or
   Ramadan-specific screen.

**This is the kind of decision point the instructions say to stop at rather
than guess through.** The request describes these as services "موجودة فعليًا
في المشروع" (that actually exist in the project) to include in the grid —
but they don't exist. Building any of them for real (all 99 names with
authentic meanings, actual Islamic educational content, a wallpaper gallery with
properly licensed images, a full Ramadan mode) is new feature development,
not a redesign of an existing feature, and each has its own content-sourcing
and scope questions I should not guess at (what text/translations for the
Names, what educational content and from which source, whose images for
wallpapers and under what license). Flagging for your decision before the
Services grid is built, rather than either silently dropping them from the
grid or inventing placeholder content.

## Issues found, not yet fixed (recorded, not guessed at)

- 3 component files still contain a handful of hardcoded hex colors outside
  the central token system (minor, to be swept during the page-by-page
  restyle rather than as a separate blind pass).
- Quran duplication, File Converter placement, Government Jobs/AI tools
  grid placement, and the dead `AppointmentsPanel.tsx` (all above) are
  product decisions for the Services grid design, not bugs to silently fix.

## Next phase

Phase 2: audit every existing service tile (what's live, what's broken)
before building the unified Services grid, per the request's explicit
"don't delete anything, report broken services' status" instruction.
