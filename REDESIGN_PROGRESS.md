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

## Phase 2 — decisions on the audit findings, and a first new feature (done)

You were asked two direct questions about the audit findings above, and
answered:

1. **The 4 missing features (99 Names, Islamic education, Islamic
   wallpapers, Ramadan mode): start building one or more now.** Built the
   most self-contained and lowest-risk of the four first — **99 Names of
   Allah** — since it needed no external content sourcing/licensing
   decisions (education content and wallpaper images both raise sourcing
   questions that still need your input; a Ramadan mode is a larger,
   multi-part feature). Islamic education content, Islamic wallpapers, and
   a Ramadan mode remain **not started** — see "Next phase."
2. **Dead code / duplication**: delete `AppointmentsPanel.tsx` only; leave
   the Quran duplication (`QuranDialog.tsx` vs. the Mushaf reader) exactly
   as it is for now. Done — see below.

**Files changed:**
- Deleted `src/components/islamic/AppointmentsPanel.tsx` (confirmed zero
  imports anywhere in the app before deleting).
- Added `src/lib/asmaAlHusna.ts` — the 99 Names of Allah as structured data
  (Arabic name, transliteration, English meaning gloss using the standard,
  widely-published renderings — not a machine translation), plus a
  `stripTashkeel()` helper.
- Added `src/components/islamic/AsmaAlHusnaDialog.tsx` — a searchable list
  dialog matching the app's existing dialog visual language (uses the
  redesigned color tokens: gold gradient number badges, card list, RTL/LTR
  aware).
- Wired it in as a new tile in `QuickServices.tsx` (the home Tools grid),
  a route (`/asma-al-husna`) in `App.tsx` + `Index.tsx`'s `PATH_MAP` for a
  proper SEO-friendly URL matching every other tool, and a side-menu entry
  in `SideMenu.tsx`.

**A real bug was found and fixed during testing, not just claimed working:**
searching "نور" initially returned "no results" even though "النُّور" (An-Nur)
is in the list — the stored names are fully vocalized with Arabic
diacritics (tashkeel), and the diacritic characters sitting between letters
broke a plain substring match. Fixed by stripping tashkeel from both the
query and the stored name before comparing, added `stripTashkeel()` in
`asmaAlHusna.ts`, and added a regression test for it.

**Verified, not just claimed:**
- Screenshot-tested in a real headless browser at iPhone width: the tile
  opens, the full list renders, search works in Arabic (after the fix) and
  in English, and English mode correctly flips the dialog to LTR with
  "transliteration — meaning" on one line while Arabic mode keeps the
  meaning as a separate end-aligned column.
- No console errors traced to the new feature (two unrelated pre-existing
  CORS warnings from an IP-geolocation analytics call were observed and are
  not part of this change).
- `npx tsc --noEmit`: clean.
- `npm run test`: **36/36 passing** (10 files) — 4 new tests: diacritic
  stripping, a real fully-vocalized name matching a plain query, and a
  data-integrity check that all 99 entries are present, sequentially
  numbered 1–99 with no gaps or duplicates, and none has an empty field.
- `npm run lint`: 129 problems — back to the exact pre-existing baseline
  (moving the search helper into the data file rather than the component
  file avoided introducing a new `react-refresh/only-export-components`
  warning).
- `npm run build`: succeeds.
- `npx cap sync ios`: succeeds (`Package.swift` reverted per the known
  Windows-only quirk).

## Issues found, not yet fixed (recorded, not guessed at)

- 3 component files still contain a handful of hardcoded hex colors outside
  the central token system (minor, to be swept during the page-by-page
  restyle rather than as a separate blind pass).
- Quran duplication, File Converter placement, and Government Jobs/AI
  tools grid placement remain product decisions for the Services grid
  design, not bugs to silently fix.

## Phase 3 — Unified Services Grid (done, on this branch only, not pushed)

Replaced the three-block stack on the Home "Tools" tab (QuickServices +
ServicesHub + EliteTools) with **one** unified, searchable, category-
filterable grid, by extending the existing `ServicesHub.tsx` (which already
had solid search/favorites/recents/category machinery for its 18 calculator
tools) rather than writing a second, parallel grid component from scratch.

**Design decisions made along the way, and why:**
- Reused every existing dialog component as-is (`AthkarDialog`, `QiblaDialog`,
  `TranslatorDialog`, `WeatherDialog`, `NotificationsDialog`,
  `QRScannerDialog`, `DocumentScannerDialog`, `AsmaAlHusnaDialog`,
  `TasbeehWidget`) — zero duplicated dialog logic. A tile's tap behavior is
  one of three kinds: `"inline"` (opens ServicesHub's own shared dialog with
  calculator/counter content, unchanged from before), `"dialog"` (opens one
  of the self-contained dialogs above), or `"route"` (navigates to a real
  page).
- **Quran stayed exactly as it was**, per your explicit answer to the Phase 2
  question: the tile navigates to the Mushaf reader (`/mushaf`); the direct
  `/quran` URL still opens `QuranDialog` (via `initialOpen`, not the tile).
- **"Prayer Times"** tile navigates to `/` (home) — there is no separate
  prayer-times page; the home screen already is that experience.
- **"Calendar"** tile navigates to `/calendar`, which shows the Tools tab
  including the still-embedded `EventsCalendar` widget (kept as its own
  section below the grid, not a tile, since it's a live calendar view, not a
  single launchable tool — a tile that just reopened the same page would be
  circular).
- **"Islamic occasions"** tile is what surfaces Ramadan (alongside Eid,
  Arafah, Ashura, Hijri new year) — there is still no separate "Ramadan
  mode" page, and none was fabricated, per instruction #12 of this phase.
- **No tile added for Islamic education or Islamic wallpapers** — neither
  exists yet (confirmed in Phase 2), and instruction #12 explicitly says not
  to start that content before checking back with you. A test
  (`servicesGrid.test.tsx`) asserts no such tile is ever silently added.
- Saudi Jobs and Government Jobs (previously in QuickServices/SideMenu only)
  are now in the unified grid too, under the new "Tools" category, since
  they're confirmed-working existing features the request said to carry
  forward ("any other confirmed tools from the project audit").
- Translations: this app has no separate per-language JSON files — its real,
  working translation system is the inline `t(english, arabic)` call used at
  every single UI string site (device-language detection, persisted choice,
  and full RTL/LTR flip all already work through it, confirmed in Phase 1).
  Every new string this phase introduces goes through that same mechanism,
  with matching Arabic/English pairs — "the required language files" for
  this codebase's actual architecture.

**Files changed:**
- `src/components/services/ServicesHub.tsx` — extended with 16 new tool
  entries (Quran, Athkar, Qibla, Prayer Times, Calendar, 99 Names, Tasbeeh,
  Translate, Weather, Notifications, QR Scanner, Document Scanner, File
  Converter, Saudi Jobs, Government Jobs) alongside the 18 pre-existing
  calculator/counter tools, two new category chips ("Worship"/العبادات,
  "Tools"/أدوات), and the three self-contained dialogs plus route navigation
  needed to open them.
- `src/pages/Index.tsx` — removed the `QuickServices` and `EliteTools`
  render calls and their now-unneeded imports; the Tools tab now renders
  `<ServicesHub .../>` once, followed by the still-separate `EventsCalendar`
  section; added the two new routes to the SEO internal-link list.
- Deleted `src/components/islamic/QuickServices.tsx` — confirmed zero
  remaining references anywhere in the app before deleting.
- `EliteTools.tsx` was **not edited or deleted** — it still exports
  `FileConverter`, used by the protected `FileConverterPage.tsx`. Only its
  render call in `Index.tsx` was removed; the file itself is untouched.
- Added `src/test/servicesGrid.test.tsx` — 14 new tests.

**Verified, not just claimed:**
- Real headless-browser screenshots at iPhone width (390px) confirmed: the
  grid renders with the new visual identity (gold-ringed circular icons,
  white cards on the light-gray background), category filtering works,
  tapping Qibla opens the real, unmodified `QiblaDialog`, search/favorites
  persist, and English mode correctly flips the whole grid to LTR — no
  visual regressions, no console errors.
- **No horizontal overflow**, checked programmatically in the same browser
  session (`document.documentElement.scrollWidth === clientWidth`, both
  390px, in Arabic and English) — jsdom-based unit tests cannot verify real
  CSS layout, so this specific requirement was verified in an actual browser
  engine, not asserted in vitest.
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files) — the 14 new tests cover:
  every explicitly-requested confirmed-working service actually renders; no
  tile exists for the two not-yet-built features; every route-kind tile
  navigates to its real, correct path (checked against every path actually
  registered in `App.tsx`, so a typo'd route would fail the test, not just
  look fine visually); the Quran dual-behavior is preserved exactly; Arabic
  ⇄ English toggling changes every visible label and flips `dir`; and every
  "dialog"-kind tile id has a corresponding rendered dialog.
- `npm run lint`: 129 problems — the exact pre-existing baseline, no new
  issues.
- `npm run build` (**substituted for the requested `npx expo export
  --platform web`** — this project has no Expo dependency anywhere; it's a
  Vite project, and `vite build` via `npm run build` is its real, actual web
  export command): succeeds.
- `npx cap sync`: succeeds (`Package.swift` reverted per the known
  Windows-only quirk, unrelated to this change).

**Committed locally only, on `islamic-elite-redesign-2026` — not pushed to
remote**, per this phase's explicit instruction.

## Next phase

Two things remain open, both explicitly held for your decision per
instruction #12 of this phase — no placeholder/fabricated content was
created for either:

1. **Islamic education content and Islamic wallpapers** — both need your
   input before real work can start: what educational content and from
   which source for the former; whose images and under what license for
   the latter.
2. **A dedicated Ramadan mode** — needs a scope decision (fasting
   tracker? Suhoor/Iftar timers? a Ramadan-specific home screen?) before
   implementation.
