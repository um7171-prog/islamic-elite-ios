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

## Phase 4 — real reference images applied: structure, Home, bottom nav

You shared the actual reference mockups for the first time this phase
(deep Islamic green + gold/cream identity, rounded cards, a 4-tab bottom
bar: Home / Services / Favorites / Settings). Previous phases were built
from your text description alone since no images were visible earlier in
the conversation — this phase re-aligns the work already done against the
real images, starting with the structural pieces you asked to do first.

**Bottom navigation — restructured to match the reference's 4 tabs:**
- `BottomNav.tsx`: `TabKey` is now `"home" | "tools" | "favorites" |
  "settings"` (was `"home" | "convert" | "tools" | "media"`). Labels
  relabeled to match the reference: "الخدمات/Services" (same underlying tab
  as before, just renamed from "أدواتي/My Tools"), a new "المفضلة/Favorites"
  tab, and a new "الإعدادات/Settings" tab.
- **Nothing was deleted** — File Converter and the Media downloader are no
  longer bottom-nav *destinations*, but both are fully reachable: File
  Converter was already a Services-grid tile (Phase 3); Media Downloader is
  now a new tile too (`ServicesHub.tsx`, id `"media"`, hidden on iOS native
  exactly like the old Media tab was). The `/convert` and `/media` pages
  themselves are completely unchanged.
- **Favorites** navigates to a new `/favorites` route that renders the same
  Services grid pre-filtered to the "fav" category (`ServicesHub`'s new
  `initialCategory` prop) — reusing the existing favorites
  add/remove/persist logic from Phase 3 rather than building a second
  favorites system.
- **Settings** navigates to the existing `/settings` page (already had its
  own gear-icon entry point in the header; now also reachable from the
  bottom bar, matching the reference).
- A real bug was caught and fixed during testing, not just claimed working:
  the Favorites tab initially highlighted "Services" instead of "Favorites"
  in the bottom bar (both shared the same internal `tab` state). Fixed by
  computing the bar's active item from the actual URL
  (`location.pathname === "/favorites"`) independently of which content
  section renders.
- `FileConverterPage.tsx`: one line changed (`BottomNav active="convert"` →
  `active="tools"`, since "convert" is no longer a bottom-nav tab) — the
  `<FileConverter />` render itself is untouched; `EliteTools.tsx` (which
  owns the actual conversion logic) has zero diff for this entire phase.

**Home page — hero card now matches the reference's consistent deep green,
not a time-of-day-shifting gradient:**
- Added `--gradient-hero` / `--elite-deep-green-a/b` tokens to `index.css` —
  a deep forest/emerald green sampled from the reference images, distinct
  from `--primary` (the brighter interactive green already used for
  buttons/active states, left unchanged).
- `HeroPrayerCard.tsx`: previously picked one of 5 different gradients
  (fajr/dhuhr/asr/maghrib/isha) depending on the current prayer — every
  reference screenshot instead shows one consistent dark green card
  regardless of time of day, so `gradientFor()` was removed in favor of the
  single `--gradient-hero`. This is a **visual-only** change: the
  underlying current/next-prayer calculation, the countdown logic, and the
  elapsed-time display are all untouched — confirmed the per-prayer
  gradient data (`PrayerEntry.gradient` in `prayer.ts`) was never consumed
  anywhere else in the app before changing this, so nothing else was
  affected. Text inside the card is now hardcoded to light shades
  (`text-white`, was `text-foreground`) since the card's background no
  longer follows the app's light/dark theme — it's always this same deep
  green, and `text-foreground` would otherwise turn dark brown and become
  unreadable there in light mode (a real bug I checked for specifically,
  not just an assumption).

**Verified, not just claimed:**
- Real headless-browser screenshots at iPhone width confirmed: the hero
  card is now solid deep green with gold countdown numbers and white
  labels (matches the reference); the bottom nav shows exactly
  Home/Services/Favorites/Settings; tapping Favorites navigates to
  `/favorites` and shows the correctly-filtered (empty, in a fresh browser)
  grid; tapping Settings performs a real navigation to `/settings`; the
  `/convert` page still renders and functions identically, with only its
  bottom nav's highlighted tab changed. Zero console/page errors in any of
  these checks.
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files, same suite as Phase 3 — no
  test needed new assertions since this phase didn't add new services,
  only restructured navigation and one component's visuals; the existing
  `servicesGrid.test.tsx` continuing to pass confirms the Services grid
  itself, its dialogs, and its routing were not broken by the nav changes).
- `npm run lint`: 129 problems — exact pre-existing baseline, zero new.
- `npm run build`: succeeds.
- `npx cap sync`: succeeds (`Package.swift` reverted per the known
  Windows-only quirk).

**Known limitation, not hidden:** Settings (and other standalone pages
like the AI tools, job boards, etc.) don't render `BottomNav` at all today,
so the bar disappears once you navigate there — the reference shows a
persistent bar on every screen. Fixing this properly means giving those
pages their own `BottomNav` instance (with "other"/appropriate active
state) rather than a quick patch, so it's deferred to a later phase rather
than rushed alongside this one's structural changes.

## Phase 5 — Services page visual polish

Scope for this phase was intentionally narrow, per your instructions:
Services page only, no other phase, no additional agents.

The grid/search/category-chip/favorites system already existed from Phase 3
— this phase confirmed it, then made it look more like the reference's
clean, elevated card style rather than rebuilding it.

**File changed:** `src/components/services/ServicesHub.tsx` only (18 lines).

- Cards: replaced the permanent 2px gold border with a subtle neutral
  border + soft shadow (`shadow-sm`, `hover:shadow-md`) — closer to the
  reference's clean white elevated cards; the gold accent is now carried by
  the icon badge ring (kept) instead of outlining every card at all times.
- More breathing room: grid gap `2.5/3` → `3/4`, card padding `3/3.5` →
  `3.5/4`, icon badge `11×11` → `12×12`, title/description text sizes and
  spacing nudged up slightly for readability.
- Friendlier empty state: the "no services match" message now has a search
  icon above it instead of being bare text.
- Search, category chips (Worship/Tools/Calculators/…), favorites, recents,
  and every existing tool/dialog/route are all untouched — this was a
  styling-only pass, confirmed by the diff (18 lines in one file, no logic
  changed).

**Verified, not just claimed — actually clicked through, not just visually
inspected:**
- Real headless-browser test at 375px width (iPhone SE, the narrowest
  common target) in **both** Arabic (RTL) and English (LTR): zero
  horizontal overflow in either language (`scrollWidth === clientWidth`),
  zero console/page errors.
- **File Converter and Media Downloader cards specifically confirmed**:
  both found in the grid (count 1 each, no duplicates), and each was
  actually clicked — File Converter navigated to `/convert` and rendered
  the real, unchanged converter tool; Media Downloader navigated to
  `/media`. Screenshots taken of both confirm nothing broke.
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files, unchanged suite — continuing
  to pass confirms this visual-only change didn't affect the grid's
  behavior, routing, or dialogs).
- `npm run lint`: 129 problems — exact pre-existing baseline, zero new.
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed. main
was not touched. No other phase was started, and no subagents were used
for this phase.

## Phase 6 — Home page redesign

Scoped strictly to the Home page per instructions (no other phase, no
subagents, Services page untouched).

**Files changed:**
- `HeroPrayerCard.tsx` — redesigned: a "Next Prayer" pill badge with a
  crescent icon, the next prayer's name now shown prominently on its own
  line, the large countdown with a "remaining" label beneath it, and a
  clear divider before the "Since [current prayer]" side panel. The
  underlying current/next-prayer calculation is untouched — this is a
  layout/typography change only.
- `DateHeader.tsx` — fixed a real RTL bug: the Gregorian side used a
  hardcoded `text-right` instead of the logical `text-end`, so it would
  have stayed physically right-aligned even in English/LTR. Added a
  vertical divider between the Hijri and Gregorian sides (both are still
  shown together in the same card, per your request) and a border/shadow
  for visual consistency with the rest of the redesign.
- `PrayerStrip.tsx` — the 5-prayer icon circles used a hardcoded
  `bg-white`, which would look inconsistent with the app's actual card
  color in dark mode; switched to the theme-aware `bg-card` token, plus
  minor spacing improvements.
- `QuickShortcuts.tsx` (**new**) — the reference's 4x2 quick-access icon
  grid, previously entirely missing from the Home page. All 8 tiles
  (Quran, Athkar, Qibla, Calendar, 99 Names, Calculators, File Converter,
  More) navigate to real, already-working routes — reuses the same
  gradient palette as the Services grid for visual consistency, without
  needing any change to `ServicesHub.tsx`.
- `Index.tsx` — one new section rendering `<QuickShortcuts />` between the
  prayer strip and the existing Saudi Jobs promo card.

**Verified, not just claimed:**
- Real headless-browser test at 375px width in both Arabic (RTL) and
  English (LTR): zero horizontal overflow in either
  (`scrollWidth === clientWidth`), zero console errors caused by this
  change (the only console errors observed are pre-existing network
  failures — Supabase realtime websocket and an ipapi.co geolocation call
  — both failing only because this sandboxed test environment has no
  internet access, unrelated to this phase's code).
- Clicked an actual shortcut tile (Qibla) and confirmed it navigated to
  `/qibla` for real.
- Screenshots confirm the Hijri/Gregorian divider renders correctly
  mirrored in both directions (Hijri-then-divider-then-Gregorian in RTL,
  and the same visual order correctly flipped in LTR).
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files, unchanged suite — confirms
  this visual/structural change didn't break routing, the Services grid,
  or the notification/scheduling logic it depends on).
- `npm run lint`: 129 problems — exact pre-existing baseline, zero new.
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed. main
was not touched. Services page (Phase 5) was not modified. No subagents
were used. Phase 7 was not started.

## Phase 7 — Mushaf (Quran reader) i18n + brand polish (done)

Reviewed `Mushaf.tsx` / `MushafReader.tsx` / `MushafBars.tsx` /
`MushafIndexSheet.tsx` / `MushafExtrasSheet.tsx` / `MushafPageView.tsx`
before touching anything. Found the entire Mushaf UI had **zero i18n
support** — every label, toast, and placeholder was hardcoded Arabic —
despite the rest of the app supporting `useLocale()`/English since
Phase 2+. That gap, not a missing visual redesign, was the real blocker
for this phase's requirement to support English LTR in the interface.

**Changed:**
- `MushafBars.tsx` (top + bottom toolbars) — all aria-labels, chip
  labels (Juz/Hizb/surah name), and the 6 bottom-bar action labels now
  go through `t()`; surah name switches between `info.mainSurah.ar`/`en`
  based on `lang`. Fixed a real bug found while doing this: the
  bookmarked/audio-playing icon used the `text-elite-gold` class, which
  is a `background-clip:text` gradient meant for text nodes — applied to
  an SVG icon it makes the icon's `currentColor` stroke/fill fully
  transparent (invisible). Replaced with a direct
  `style={{ color: "hsl(var(--elite-gold-start))" }}`.
- `MushafIndexSheet.tsx` — tabs, search placeholders, and all
  surah/juz/hizb/page/bookmarks list content translated; `s.en` is now
  actually used (the data already existed, just was never displayed).
  `b.label` (bookmark display text) stays Arabic-at-creation-time — a
  pre-existing data-storage choice, out of scope for a UI pass.
- `MushafExtrasSheet.tsx` — sheet titles, display-mode buttons
  (Auto/Day/Night), "Reciter" label, loading/error states translated.
  Reciter proper names (`r.name`) and the translation/tafsir content's
  own `dir` stay as-is (both already correct).
- `MushafReader.tsx` — the 4 toast messages (recitation error, bookmark
  toggle, share link copied, page link copied) translated; the
  share-sheet `title`/`text` now build from the language-aware surah
  name instead of always Arabic.
- `Mushaf.tsx` — found and fixed a real cross-cutting bug: `<SEO lang="ar">`
  was hardcoded, and `SEO.tsx` sets `<html lang dir>` via
  `react-helmet-async`, which **silently overrode the whole document
  back to `dir="rtl"`/`lang="ar"` on every visit to `/mushaf`, even when
  the user had explicitly chosen English** for the rest of the app.
  Confirmed via a real browser test (`document.documentElement.dir`
  stayed `"rtl"` for an English-language session until this fix).
  Now passes `lang={lang}` from `useLocale()`. The Mushaf reader's own
  inner `dir="rtl"` (the page-turn direction) is untouched and correct —
  that is content-driven, not a UI-language concern, per the existing
  `// RTL reading: page N+1 lives to the LEFT of page N` comment.
- Minor visual polish only, no new components: added `border` to the
  index-sheet tab pills, juz/hizb/page-jump grid buttons, the display-mode
  buttons, and the reciter list rows, plus a border on the top-bar chips —
  gives clearer card edges consistent with the rest of the app's design
  system tokens (`border-border/30`, `bg-accent`), without touching
  layout, gestures, or the toolbar's dark-overlay-on-page look (which was
  already consistent with the app's "clean iOS" direction).
- `MushafPageView.tsx` (owns pinch-zoom/pan) — **not touched at all.**

**Verified, not just claimed (real browser via Playwright, 375px):**
- Navigation: deep-linked to `?page=50`, then used the free-text page
  search ("100" → Enter) and confirmed via screenshot it actually
  rendered Quran page 100 content.
- Zoom: simulated wheel-based zoom (the page uses `wheel={{step:0.2}}`,
  not just pinch) — confirmed `scale` went from 1 → 5 (max) and back to
  1, no errors.
- Search: the index sheet's free-text page/verse search navigated
  correctly (see Navigation above).
- Bookmark: toggled on via the top-bar icon, toast confirmed
  ("Page 1 saved" in English / the Arabic equivalent), and the page
  appeared correctly in the index sheet's Favorites tab.
- Arabic RTL / English LTR: confirmed `document.documentElement.dir`
  and `lang` correctly follow the user's chosen language on `/mushaf`
  (`ar`→`rtl`/`ar`, `en`→`ltr`/`en`) after the SEO fix above; all
  toolbar/sheet text renders in the correct language while the physical
  page-turn direction stays RTL as designed.
- 375px width: `document.documentElement.scrollWidth === clientWidth`
  (375 === 375) in every test — no horizontal overflow, in both
  languages, before and after navigation.
- No console errors and no `pageerror`s in any test run.
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files, unchanged suite).
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed.
main was not touched. Home/Services (Phases 5-6) were not modified. No
subagents were used. Phase 8 was not started.

## Phase 8 — Athkar dialog redesign (done)

Reviewed `AthkarDialog.tsx` before touching anything. The "Athkar page"
is actually a Radix Dialog opened from `/athkar` via the same
tool-route-opens-a-dialog pattern as Qibla/the 99 Names (see
`ServicesHub.tsx`'s `PATH_MAP`/`ToolAction` mechanism from earlier
phases) — not a dedicated route component. Content: 4 lists (Morning /
Evening / Sleep / Post-Prayer, all pulled from the Quran/Sunnah, none
removed or altered) with a working per-item tap-to-count counter,
persisted to `localStorage` per list per day (already fixed in an
earlier pass — see the code comment on `todayKey()`).

**Changed (one file only):**
- Restyled to match the same header/card pattern already established
  in `AsmaAlHusnaDialog.tsx` (Phase 2): `DialogContent` with `p-0
  overflow-hidden`, a padded custom header with an icon next to the
  gold title text — the icon gets its gold color via a direct
  `style={{ color: "hsl(var(--elite-gold-start))" }}` rather than the
  `text-elite-gold` class, avoiding the same invisible-SVG-icon bug
  identified and fixed in Phase 7.
- Each of the 4 tabs now has its own icon (Sunrise/Sunset/BedDouble/
  CheckCircle2) stacked above a short label, instead of text-only tabs.
- Each dhikr card now shows a numbered circular badge that turns into a
  green checkmark once its tally reaches the target count, and the
  counter is now a colored pill (green when done, gold/accent
  otherwise) instead of plain small text — makes the existing
  completion state and counter actually easy to read at a glance.
- Fixed `text-right` hardcoded on the card button (wrong in English/LTR)
  → logical `text-start`.
- **Found and fixed a real bug while testing at 375px**: the 4-column
  tab grid and the card content were rendering ~30-70px wider than the
  dialog and getting silently cropped by `overflow-hidden` — a classic
  CSS grid/flex "automatic minimum size" blowout, where a nested grid
  item's intrinsic (unwrapped) content width forces its ancestor grid
  tracks wider than the container. This did **not** show up in the
  `document.documentElement.scrollWidth === clientWidth` check (stayed
  375 === 375 throughout, because the dialog is `position: fixed` and
  clips internally) — it was only caught by actually looking at the
  screenshots, where "Post-Prayer" was visibly cut to "Post-Pr" and the
  Arabic dhikr text was cropped on both edges. Fixed with `min-w-0` on
  the `Tabs` root, the tab-list grid, and each `TabsTrigger`, plus
  `truncate` on the tab labels. Take-away for later phases: the
  scrollWidth check catches page-level overflow but not overflow
  clipped inside a `fixed`/`overflow-hidden` element — a real
  screenshot is still required, exactly as the verification checklist
  already asks for.
- No new features added: there is no favorites/bookmark mechanism for
  Athkar in the existing code, so none was added, per the "no
  unnecessary new functions" instruction.

**Verified, not just claimed (real browser via Playwright, 375px):**
- Opened `/athkar` for real, in both languages.
- Tapped an actual dhikr (Ayat al-Kursi, target count 1) → counter
  correctly reads "1 / 1" and the badge turns into a green checkmark.
- Tapped the 100x tasbih item 3 times → counter reads "3 / 100" and
  correctly stays "not done" (no premature completion).
- Switched tabs (Morning → Evening) → confirmed the Evening list is
  independent state (its own "0 / 1" on Ayat al-Kursi, unaffected by
  Morning's progress).
- Reloaded the page → both tallies ("1 / 1" and "3 / 100") persisted
  correctly, confirming the existing save-progress behavior still
  works after the visual rewrite.
- No favorites feature exists in this component, so none was tested
  (nothing to test — not a regression).
- Arabic RTL / English LTR: `document.documentElement.dir`/`lang`
  correctly follow the chosen language; all labels translate; screenshots
  confirm no visual cropping in either direction after the min-w-0 fix.
- 375px width: confirmed via `document.documentElement.scrollWidth ===
  clientWidth` (375 === 375) **and** by visually inspecting screenshots
  before and after the grid-blowout fix (see above — the numeric check
  alone was not sufficient here).
- No console errors or `pageerror`s caused by this change (only the
  same pre-existing Supabase-realtime/ipapi.co network failures seen in
  every prior phase's tests, due to this sandbox having no internet
  access — unrelated to this code).
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files, unchanged suite).
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed.
main was not touched. Home/Services/Quran (Phases 5-7) were not
modified. No subagents were used. Phase 9 was not started.

## Phase 9 — Qibla page: brand colors, panning fix, tab icons (done)

Explicit instruction this phase: do **not** redesign the Qibla page —
keep its existing structure/compass/functions and only recolor it, fix
the horizontal-panning bug, and make the 4 header tabs actually do
something. Reviewed `QiblaDialog.tsx`, `useQiblaCompass.ts`, and
`lib/qibla.ts` first; the compass math/hooks were not touched at all.

**Changed (2 files):**
- `src/index.css` — the `--qibla-*` tokens (both dark and light mode)
  drove a blue/orange scheme left over from before the brand identity
  was established in Phases 4-8. Recolored (values only, same variable
  names, same usage sites): header bands, the compass ring glow, the
  location pill, the "Enable compass" button, the compass-rose diamonds,
  the degree ticks, and the pivot ring now use the app's `--primary`
  emerald green and `--elite-gold-*` gold — the same tokens Home/
  Services/Mushaf/Athkar already use. Also fixed a real pre-existing
  inconsistency: light mode's "aligned" status text was still blue
  (`198 85% 45%`) while dark mode's was already green (`158 70% 50%`) —
  unified to green. Left neutral surfaces (cards, needle, page
  background, decorative outer-ring text) unchanged, as instructed.
- `src/components/islamic/QiblaDialog.tsx`:
  - **Horizontal panning bug — found the cause**: `QiblaDialog` renders
    as a Radix Dialog, which portals directly to `<body>`, *outside*
    the app's `#app-scroll` container. The rest of the app is protected
    from sideways swipe-panning by `touch-action: pan-y` +
    `overflow-x: hidden` set on `.app-scroll` (see `index.css`) — but
    since this dialog's DOM subtree is a sibling of `#app-scroll`, not
    a descendant, it never inherited that protection. Fixed by adding
    the identical `touch-action: pan-y`, `overflow-x: hidden`, and
    `overscroll-behavior-x: none` directly to the `.qibla-fullscreen`
    class already used only by this dialog.
  - **Tab icons investigated and fixed**: the 4 header tabs (Compass /
    Map / AR / Sun & Moon) were plain `<div>`s with no `onClick`
    whatsoever — literally inert, exactly matching the user's report.
    Searched the codebase for any existing Map, AR, or Sun/Moon
    Qibla-finding feature to link to: **none exists** — no map or AR
    library is installed (`package.json` has neither), and there is no
    sun/moon-based Qibla method anywhere in the code (the only
    "moon phase" code in the project is `lib/desert.ts`'s unrelated
    Desert-Mode weather panel — wrong feature, wrong purpose, not
    reused). Rather than inventing a fake screen for any of them, each
    tab is now a real `<button>`: **Compass** gives a haptic tick (it's
    already the view being shown, so nothing to navigate to); **Map**,
    **AR**, and **Sun & Moon** each give a haptic tick plus an honest
    `toast` saying that view isn't available yet. Same 4 icons, same
    order, same visual appearance as before (including AR's pre-existing
    small lock badge, which already signaled "not available") — only
    real tap behavior was added where there was none.

**Verified, not just claimed (real browser via Playwright, 375px):**
- Opened `/qibla` for real in both languages — screenshots confirm the
  new green/gold palette renders correctly (header bands, ring, rose,
  ticks, pivot) with the same layout/structure as before.
- Tapped **all 4 tabs** for real and read the actual on-screen result
  (not just checking a handler exists): Compass → no toast (already
  active); Map → toast "عرض الخريطة غير متاح حاليًا." / "Map view isn't
  available yet."; AR → "الواقع المعزز غير متاح حاليًا." / "...AR...";
  Sun & Moon → "عرض الشمس والقمر غير متاح حاليًا." / "...Sun & Moon...".
  Confirmed the dialog stayed open and undisturbed after every tap.
- Horizontal panning: confirmed `getComputedStyle(...).touchAction ===
  "pan-y"` on `.qibla-fullscreen`, then dispatched a real synthetic
  horizontal touch-drag (touchstart/touchmove ×10/touchend) over the
  compass area — the dialog's `x` position and `window.scrollX` stayed
  at `0` before and after, with no overflow
  (`scrollWidth === clientWidth === 375`).
- Vertical gestures still work: dispatched the same kind of touch-drag
  vertically from the grab-handle area — `transform: translateY(80px)`
  appeared during the drag and correctly settled back to
  `translateY(0px)` on release without crossing the close threshold,
  confirming the pre-existing drag-to-close logic is unaffected by the
  `touch-action: pan-y` change.
- Compass/location data still computes correctly and unchanged: bearing
  "219°", distance "689 KM", coordinates all rendered from the same
  `useQiblaCompass`/`lib/qibla.ts` code, which was never touched.
- Arabic RTL / English LTR: confirmed via `document.documentElement.dir`
  /`lang` and screenshots — tab order visually reads
  Compass→Map→AR→Sun & Moon in natural reading direction in both modes
  (right-to-left in Arabic, left-to-right in English), matching the
  reference order.
- 375px width: `scrollWidth === clientWidth` (375 === 375), verified
  both before and after the panning-gesture simulation.
- No console errors or `pageerror`s caused by this change.
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files, unchanged suite,
  including `useQiblaCompass.test.ts` — confirms the compass hook logic
  is untouched).
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed.
main was not touched. Home/Services/Quran/Athkar (Phases 5-8) were not
modified. No subagents were used. Phase 10 was not started.

## Phase 9 (continued) — real location-permission gate (done)

Follow-up instruction on the same phase: stop silently falling back to
the selected city's coordinates when GPS isn't available, and give
location a proper request/denied/recheck flow instead. `useUserLocation`
(the hook doing the actual `navigator.geolocation` calls) and the
bearing/distance math in `lib/qibla.ts` were not touched — only how
`QiblaDialog.tsx` reacts to the hook's existing states, plus one
one-line fix inside the hook's error mapping (below).

**Changed (2 files):**
- `src/components/islamic/QiblaDialog.tsx` — the compass now only
  renders once a real GPS fix exists (`coords != null`). Three screens,
  derived from state the hook already exposed:
  - Brief loading spinner while the very first check is in flight
    (avoids flashing a wrong bearing before we know the real location).
  - A full "enable location" screen for denied/unavailable/error, with
    the requested copy exactly ("نحتاج إلى موقعك لتحديد اتجاه القبلة
    بدقة.") and one clear "تفعيل الموقع" / "Enable Location" button.
    This replaces the old small dismissible panel that said "...using
    your selected city instead" while quietly showing the compass with
    city coordinates anyway.
  - The existing compass/distance/bearing UI, once a fix exists —
    unchanged.
  - Button behavior is platform-correct, not a blind retry: for a plain
    error/timeout it calls `requestLocation()` directly; for a denied
    or service-off permission it calls the existing `openSettings()`
    (opens native Settings via the already-existing
    `openNativeAppSettings()` on native, or shows the existing
    browser-settings toast on web) — retrying a *denied* permission via
    `getCurrentPosition()` again would silently fail a second time on
    every mainstream browser, so that path goes straight to the one
    action that can actually fix it.
  - A `visibilitychange`/`focus` listener rechecks location once,
    automatically, when the user returns to the app while the gate is
    showing — this is what makes "grant permission in Settings, come
    back, and you're on the compass" work with no extra tap.
  - Tapping the Compass tab while the gate is showing now also retries
    the location check (previously a pure no-op, same as the other 3
    tabs before this phase).
  - The compass-sensor-only problem panel (denied/unsupported/error for
    the device-orientation sensor, a separate concern from GPS) and the
    existing "Enable compass" iOS-permission button are unchanged and
    still appear exactly as before once a location fix exists.
- `src/hooks/useQiblaCompass.ts` — `useUserLocation`'s geolocation error
  handler collapsed every non-"denied" failure into one generic "error"
  status, even though the hook's own `LocationStatus` type already had
  a distinct `"unavailable"` value that nothing ever set from a real
  geolocation error. Mapped `error.code === 2` (`POSITION_UNAVAILABLE`
  — permission granted, but the device's location service produced no
  fix) to `"unavailable"` specifically, so "permission denied" and
  "location service is off" now show their own distinct, correct
  messages instead of being indistinguishable.

**Verified, not just claimed (real browser via Playwright, 375px):**
- **Granted + working** (`context` with `geolocation` + `permissions:
  ['geolocation']` set to real coordinates, no mocking of the app's own
  code): the gate never appears; the compass renders directly with the
  granted coordinates converted correctly to D°M'S, a real computed
  distance (339 km from Madinah's coordinates — correct), and a real
  computed bearing (176°) — confirms `coords` really drives the existing
  untouched bearing/distance functions.
- **Denied** (no permission granted at all — Chromium headless reports
  `PERMISSION_DENIED` exactly like a real user denial, no mocking): gate
  appears with "الموقع مطلوب" / "Location needed" and the
  denied-specific message; the old "...using your selected city
  instead" text is confirmed gone from the page; tapping "تفعيل الموقع"
  correctly calls `openSettings()` and shows the real browser-settings
  toast (verified this is a genuinely different code path from the
  error-state retry, not the same button doing one generic thing).
- **Service off / unavailable** (mocked at the `navigator.geolocation`
  boundary only, to produce a real `code: 2`, since no headless browser
  can simulate an actual OS-level GPS-off state): shows the distinct
  "يبدو أن خدمة الموقع متوقفة..." message, confirming the new status
  mapping and its UI branch both work.
- **Generic error → recovered** (mocked to fail once with `code: 3`
  then succeed): gate shows the generic retry message first; tapping
  "Enable Location" calls `requestLocation()` directly, which succeeds,
  and the gate is replaced by the compass automatically — computed
  distance came out as 0 km for coordinates set to the Kaaba itself,
  confirming the real (untouched) distance formula ran on the real
  returned coordinates.
- **Auto-return without any button tap**: denied first, then simulated
  the app regaining focus (`visibilitychange`→visible, no click)
  with the mock now returning success — confirmed the app landed back
  on the compass view on its own, exactly the "grant it in Settings,
  come back" flow from the spec.
- Re-verified after all of the above that nothing else regressed: the
  4 header tabs behave exactly as in the first half of this phase
  (Map/AR/Sun & Moon give honest "not available yet" toasts), the
  existing "Enable compass" iOS-permission button still appears
  unmodified once past the gate, `touch-action: pan-y` is still applied
  and a simulated horizontal drag still leaves the dialog position and
  `scrollX` at 0, and the vertical drag-to-close gesture still animates
  (`translateY(60px)` mid-drag) exactly as before.
- Arabic RTL / English LTR: confirmed via `document.documentElement.dir`
  and full-page screenshots of the gate screen in both languages — all
  text, including the exact requested Arabic copy, renders correctly.
- 375px width: `scrollWidth === clientWidth` (375 === 375) checked on
  the granted, denied, and post-drag states.
- No console errors or `pageerror`s caused by this change in any test.
- `npx tsc --noEmit`: clean.
- `npm run test`: **50/50 passing** (11 files, unchanged suite).
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed.
main was not touched. Home/Services/Quran/Athkar (Phases 5-8) were not
modified. No subagents were used. Phase 10 was not started.

## Cleanup & merge pass — dedupe + Home/Qibla trims (done)

Not a redesign phase — a cleanup request to remove duplication and a
couple of unwanted elements, then merge things into the right single
place. Four independent changes, all on top of Phase 9:

1. **Qibla — old "Enable compass" button removed for good.** It was a
   separate button whose only job was giving iOS the user-gesture
   context `DeviceOrientationEvent.requestPermission()` requires.
   Moved that into the Compass tab's own tap handler (already a real
   click, always visible in the header) instead, so the button could
   be deleted without losing the ability to grant compass access.
   Verified live in three states (granted location, denied location,
   and after tapping the Compass tab) that no trace of the old button
   or its label remains anywhere on the page.
2. **Notifications — deduplicated.** The Services grid's "Notifications"
   tile opened `NotificationsDialog`, which did nothing but re-render
   the exact same `AthanSettingsCard` Settings already shows directly —
   a genuine duplicate. Removed the tile and deleted the now-fully-unused
   `NotificationsDialog.tsx`. The `/notifications` URL (still linked
   from an SEO nav list and the sitemap) now redirects to `/settings`
   instead of silently dead-ending. Settings' own Athan Notifications
   section is untouched and confirmed still fully functional.
3. **Home — "Saudi Jobs" promo card removed.** It was a separate
   section below the QuickShortcuts grid, not part of the grid itself
   (QuickShortcuts never had a Saudi Jobs tile, so nothing needed
   rebalancing there — confirmed the grid still shows all 8 of its
   original tiles). The feature itself is untouched: still a full tile
   in Services (`id: "jobs"`) and its own `/saudi-jobs` route.
4. **Settings — reorganized, not rebuilt.** Added three small uppercase
   group labels (General / Prayer & Reminders / Support) above the
   existing sections, matching the same style already used for
   "Quick Access" on Home — a purely visual grouping pass. No reference
   image was provided for this cleanup request (consistent with every
   earlier phase in this file), so no new settings were invented; all
   existing settings (language, theme, city, madhab, Athan
   notifications, Athkar reminders, contact channels, advanced
   diagnostics) were confirmed still present and working, unchanged.

**Important verification finding, disclosed here for accuracy:** the
bare `npx tsc --noEmit` command used to verify every phase up to this
one has been checking **zero files** this whole time — this project's
root `tsconfig.json` is a solution-style file (`"files": []` with
`references` to `tsconfig.app.json`/`tsconfig.node.json`), which only
actually type-checks anything under `tsc --build`. Discovered while
debugging why an excess-prop TypeScript error didn't show up after
trimming `ServicesHub`'s props. The correct command is
`npx tsc --noEmit -p tsconfig.app.json`; re-running it against the
pre-redesign baseline commit (`89bf4ed`) confirmed 3 errors that are
**pre-existing and unrelated to any redesign work** (byte-identical
files: `nativeAthanSchedulerPermissionGate.test.tsx`,
`nativeStatus.test.ts`, `useQiblaCompass.test.ts`) — left alone as out
of scope for this cleanup phase. This phase's own two real errors
(excess `athanSettings`/etc. props left over in `Index.tsx` and
`servicesGrid.test.tsx` after trimming `ServicesHub`'s API) were found
and fixed using the correct command.

**Verified, not just claimed (real browser via Playwright, 375px):**
- Qibla: granted-location and denied-location states both confirmed,
  via full-text DOM scan of `.qibla-fullscreen`, to contain no trace of
  "Enable compass" / "تفعيل البوصلة" in either language; tapping the
  Compass tab does not crash the dialog; the compass still renders with
  correct distance/bearing when location is granted.
- Services: DOM-level check (not just visual) that zero `<button>`
  elements in the grid contain "الإشعارات" text, while confirming
  Athkar/Qibla/Weather/Saudi-Jobs tiles are all still present; opened
  the Athkar tile for real and confirmed its dialog actually opens;
  visited `/notifications` directly and confirmed it lands on
  `/settings` with the Settings heading visible.
- Settings: confirmed all pre-existing sections and their real controls
  (language toggle, theme switch, city selector, madhab picker, Athan
  card, Athkar reminders, contact links, advanced diagnostics) are
  still present and rendered in both languages; confirmed the 3 new
  group labels render (case-insensitive check needed in English since
  they're visually uppercased via CSS `text-transform`, same as Home's
  existing label style); no fake/non-functional buttons were added.
- Home: confirmed via DOM text search that "Saudi Jobs"/"وظائف السعودية"
  and its "Browse jobs" button are both gone in Arabic and English;
  confirmed QuickShortcuts still renders all 8 of its tiles; screenshot
  confirms the page now ends cleanly right after the shortcuts grid
  with no gap or leftover spacing.
- 375px width: `scrollWidth === clientWidth` (375 === 375) on Qibla,
  Home, and Settings, in both languages.
- Arabic RTL / English LTR: `document.documentElement.dir` correct on
  every page tested; screenshots confirm no visual breakage in either
  direction.
- No console errors or `pageerror`s caused by any of these changes.
- `npx tsc --noEmit -p tsconfig.app.json`: only the 3 pre-existing,
  unrelated errors described above remain.
- `npm run test`: **50/50 passing** (11 files — `servicesGrid.test.tsx`
  updated to match the trimmed `ServicesHub` API and the removed
  "alerts" dialog id, still 14/14 passing).
- `npm run build`: succeeds (the sitemap prebuild step regenerated
  `public/sitemap.xml` without `/notifications`, as expected).

Committed locally only on `islamic-elite-redesign-2026` — not pushed.
main was not touched. Quran/Athkar were not modified. No subagents were
used. Phase 10 was not started.

## Phase 10 — final UI integration: dedupe Qibla naming, rebuild Settings (done)

**Services — investigated the reported Qibla duplication first, before
touching anything.** The claim was that "القبلة" and "اتجاه القبلة"
both show up as duplicates. Checked `ServicesHub.tsx`'s `TOOLS` array
directly: only one `id: "qibla"` entry exists — no duplicate tile
inside the Services grid itself. Confirmed live via a DOM search on the
rendered `/tools` page (`button` elements containing "قبلة") that
exactly one match exists. The real issue was a **cross-surface naming
mismatch**: Home's `QuickShortcuts.tsx` tile for this same feature
(same `/qibla` target) already said "القبلة", while the Services tile
said "اتجاه القبلة" — same dialog, same route, two different Arabic
labels depending on which part of the app you were looking at. Fixed
by renaming the Services tile's Arabic label to "القبلة" (keeping "اتجاه
القبلة" in its search keywords so it's still found either way). Scanned
the rest of `TOOLS` for the same class of issue (same route, same
rendered dialog/component, or two ids doing the same job under
different names) — found none; every other tool id maps to a distinct
route or dialog.

**Settings — a real reorganization, not just group labels this time.**
The previous cleanup pass only added 3 uppercase group headers over the
existing sections without moving anything. This pass actually
restructures into the 5 requested groups, moving pre-existing sections
to where their function belongs rather than rewriting their logic:
- **General (عام)**: Account & App (language, theme — unchanged) + a
  **newly split-out** Location section. Previously "Location" and
  "Madhab" were bundled into one "Prayer & Times" section; Location is
  now its own card here since it's a general app-wide setting (also
  used for Qibla), not prayer-specific.
- **Prayer (الصلاة)**: a renamed "Calculation Method" section holding
  just the Madhab/Asr-method picker (unchanged logic, `usePrayerCalc`),
  plus Athan Notifications (`AthanSettingsCard` — unchanged, still has
  its full per-prayer toggles, sound pickers, offset adjusters, and the
  "auto-update city / Arabic city names / show sunrise" extra toggles
  inside it, all confirmed still present).
- **Athkar (الأذكار)**: Athkar Reminders (`AthkarRemindersCard` —
  unchanged).
- **App (التطبيق)**: the App Announcements push toggle — native-only,
  so on web this entire group (header included) is skipped rather than
  showing an empty section with nothing under it.
- **Support & Info (الدعم والمعلومات)**: Contact Us channels +
  the collapsible Advanced Settings/diagnostics panel (version info,
  notification test, diagnostics link) — both unchanged.

No setting was removed. No toggle was invented — every control in the
new layout is the exact same pre-existing component, hook, or handler
as before, just relocated to the group its function actually belongs
to. No second Settings page exists; this is still the one and only
`/settings` route.

**Home / Qibla — reviewed, no changes needed.** Saudi Jobs remains
absent from Home (confirmed again this pass, not re-added). Qibla's own
`QiblaDialog.tsx` was **not touched** in this phase — the working
location-gate flow and the tab-tap compass activation from the earlier
cleanup pass are the reference behavior and were only re-verified, not
modified.

**Verified, not just claimed (real browser via Playwright, 375px):**
- Services: live DOM search confirms exactly one Qibla-labelled button
  on `/tools`; clicking it opens the real `QiblaDialog` (URL stays
  `/tools`, confirming it's the dialog action, not a route nav);
  closing it and opening Athkar afterward confirms the dialog system
  and navigation weren't disturbed by the rename.
- Settings: confirmed via `innerText` that all 5 group labels render
  (English ones case-insensitively, since they're visually uppercased
  via CSS same as before) and that the old combined "Location and
  calculation method" subtitle is gone (proving an actual restructure
  happened, not just new headers on old markup). Exercised each control
  for real: language toggle flips `document.documentElement.dir` both
  ways; theme toggle actually adds/removes the `.light` class on
  `<html>` for Day vs Night; Madhab picker's checkmark actually moves
  to the tapped option and back; screenshots down the full scroll
  confirm Athan Notifications' entire feature set (per-prayer switches,
  calculation method list, per-prayer minute offsets, per-prayer athan
  sound pickers, the 3 extra display toggles), Athkar Reminders,
  Contact Us channels, and the Advanced Settings collapsible (confirmed
  it actually opens — `data-state` flips to `open` on click) are all
  still present and rendered.
- Home: confirmed absence of "وظائف السعودية"/"Saudi Jobs" in both
  languages, and exactly one Qibla-labelled button (the QuickShortcuts
  tile) — no duplicate service surfaced on Home either.
- Qibla: confirmed live, in both a granted-location and a
  general re-check, that "تفعيل البوصلة"/"Enable compass" do not appear
  anywhere on the page and that the compass/distance/bearing cards
  still render correctly from a real granted location.
- 375px width: `scrollWidth === clientWidth` (375 === 375) on Services,
  Settings, Home, and Qibla.
- Arabic RTL / English LTR: `document.documentElement.dir` correct on
  every page tested.
- No console errors or `pageerror`s caused by any of these changes.
- `npx tsc --noEmit -p tsconfig.app.json`: only the same 3 pre-existing
  baseline errors remain (confirmed unrelated to this phase — not
  touched, per instruction).
- `npm run test`: **50/50 passing** (11 files — `servicesGrid.test.tsx`
  updated for the unified Qibla label, still 14/14).
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed.
main was not touched. File Converter was not modified. IPA/native build
was not started. No subagents were used. Phase 11 was not started.

## Phase 11 — Calendar, appointments & reminders (done)

**Investigated before touching anything**, per the explicit instruction
not to assume file names match feature names. Searched the whole repo
for Calendar/Appointments/reminder/notification-scheduling code and
read it fully:
- `src/components/islamic/EventsCalendar.tsx` (461 lines) — the entire
  UI: month calendar with Hijri digits under each Gregorian day,
  selected-day event list (with delete), an "Upcoming" list, and the
  add-event dialog (title, date, time, repeat, reminder-before-minutes,
  reminder sound with preview).
- `src/lib/events.ts` — the data model (`CalEvent`), persisted in
  `localStorage` under `elite.calendar.events.v1`, plus
  `syncEventNotifications()` which builds native notification
  payloads in a dedicated, collision-free id range (20000-29999,
  separate from prayer's 10000-19999).
- `src/lib/nativeNotificationCoordinator.ts` + `NativeAthanScheduler.tsx`
  — a pub/sub coordinator that serializes rebuilding event **and**
  Athkar notifications together through the one shared native pipeline,
  triggered whenever `EventsCalendar` saves. This is already exactly
  the "one source for notifications" the phase asked to preserve.
- Confirmed via a repo-wide search that there is **no separate
  "Appointments" page/dialog anywhere** — `EventsCalendar.tsx` titles
  itself "Calendar & Events" / "التقويم والمواعيد" and already is the
  one unified feature for both. The old `AppointmentsPanel.tsx` was
  already deleted in an earlier phase (Phase 2) and nothing recreated
  it.
- Also confirmed only one usage site of `EventsCalendar` exists
  (`Index.tsx`, the "tools" tab, reached via `/calendar`) — no second
  calendar implementation anywhere in the app.

**Given all of that was already correct and unduplicated, the only
real, verified gap found:** the shadcn `Calendar` (a `react-day-picker`
wrapper) was never given a `locale`, so it always rendered its month
caption and weekday headers in English ("September 2026", "Sa Fr Th We
Tu Mo Su") even inside the Arabic UI. Fixed with a single `locale`
prop (`date-fns/locale`'s `ar`/`enUS`, `date-fns` already a direct
dependency) — translates display text only; the Hijri conversion
(`hijri-converter`), event storage, reminder scheduling, and month/day
navigation logic were already correct and were not touched.

**Verified, not just claimed (real browser via Playwright, 375px):**
- Calendar: opened `/calendar` for real; confirmed both Gregorian and
  Hijri dates render clearly together (small Gregorian number + large
  gold Hijri number per day cell, plus a combined date bar below the
  grid). Clicked the real next/previous-month buttons and confirmed via
  screenshots the caption actually changed "سبتمبر 2026" →
  "أكتوبر 2026" → back → "أغسطس 2026" (one month net back from a
  next+prev+prev sequence) — real navigation, not just a checked DOM
  attribute.
- Appointments — add flow tested for real: opened the add dialog,
  filled a title, tomorrow's date, a time, and a "10 min before"
  reminder, saved it. Confirmed via `localStorage.getItem
  ('elite.calendar.events.v1')` (not just the UI) that a real record was
  written with the exact fields entered. Confirmed the app auto-selects
  the new event's day and the event appears immediately in that day's
  list with the correct time and reminder tag.
- Persistence — did a real `page.reload()` (fresh page load, not an SPA
  navigation) and confirmed the exact same `localStorage` record was
  still present afterward, and the UI still showed it once that day was
  selected again. This is genuine `localStorage` persistence, not
  in-memory React state.
- Delete — clicked the event's own trash icon and confirmed via
  `localStorage` (not just the UI list) that the record was actually
  removed (`[]` afterward), so no test data was left behind. No edit
  function exists in this component (add + delete only) — not invented,
  since the add/delete flow is already complete without it.
- Reminder/notification scheduling — **honestly could not be verified
  end-to-end**, and is reported as such rather than claimed: this is a
  web browser test environment, and `scheduleNativeGroup()` in
  `lib/nativeNotify.ts` checks `isNativeApp()` first and returns
  `{ reason: "not-native" }` immediately on web, by design, before ever
  touching a native plugin — there is no iOS runtime available here to
  actually schedule or observe a real local notification. What **was**
  verified: the reminder-minutes choice is saved correctly into the
  event record (confirmed in the `localStorage` dump above,
  `"remindMinutesBefore":10`), and the full save → coordinator →
  rebuild code path runs end-to-end with zero console/page errors on
  web, meaning the appointment-reminder wiring is sound up to the
  native boundary — but the actual native scheduling itself is
  unverified here and would need a real device/iOS build to confirm.
- Arabic RTL / English LTR: confirmed both the calendar grid and the
  add-event dialog render correctly in each direction/language, with
  the expected locale-appropriate week-start (Saturday-first in Arabic
  via the `ar` locale, Sunday-first in English via `enUS` — both
  correct per their own convention, not a bug).
- 375px width: `scrollWidth === clientWidth` (375 === 375) on the
  calendar page and with the add-event dialog open, in both languages.
- No console errors or `pageerror`s in any test, across the full
  add → persist → reload → delete cycle.
- One cosmetic, non-app-controllable observation: the native
  `<input type="date">`/`<input type="time">` widgets displayed
  Arabic-Indic digits even in the English-language screenshot — this is
  the browser's own native form-control rendering (locale-driven by the
  browser/OS, not by this page's `lang`/CSS), not something the app's
  code can override, and unrelated to any change made this phase.
- `npx tsc --noEmit -p tsconfig.app.json`: only the same 3 pre-existing
  baseline errors remain (not touched, per instruction).
- `npm run test`: **50/50 passing** (11 files, including the existing
  `nativeAthanSchedulerPermissionGate.test.tsx` which directly covers
  the events+Athkar sync gate — untouched and still passing).
- `npm run build`: succeeds.

Committed locally only on `islamic-elite-redesign-2026` — not pushed.
main was not touched. File Converter was not modified. NativeAthanScheduler/
AthanSettingsCard were not modified (no bug was found that originated
from the appointments system). No subagents were used. Phase 12 was not
started.

## Phase 12 — functional audit of remaining tools (done, no code changes)

Not a design phase — a real functional audit of every tool not yet
covered by an earlier phase, specifically to chase down a prior report
that Document Scanner didn't work. **No bugs were found**, so **no code
was changed** this phase (per the explicit instruction: don't touch a
tool that already works). Every tool below was opened and actually
interacted with — not just checked for a route that resolves.

**PASS — opened, interacted with, and produced a correct real result:**
- **Document Scanner** (highest priority — previously reported broken):
  read the full 1123-line implementation end to end first. It uses
  plain `getUserMedia` (a real web camera API, not Capacitor-native-only
  — works in ordinary browsers, Safari included), a real-time
  perspective-quad edge detector drawn on a canvas overlay, a
  draggable-corner crop editor, real image filters (enhance/gray/B&W
  via canvas pixel manipulation, not presets), and `jsPDF` export.
  Tested live with Chromium's fake camera device
  (`--use-fake-device-for-media-stream`): the camera stream actually
  attached (`video.videoWidth` = 2160, matching the requested
  constraint) and rendered on screen (screenshot confirms Chromium's
  fake test pattern visibly playing); tapped the real shutter button
  (`aria-label="التقاط"`) and reached the crop/review screen with
  working draggable corner handles (screenshot confirms); tapped
  "اعتماد المسح" (confirm) and reached the gallery view showing "تم مسح
  صفحة واحدة" with the processed page image and per-page
  crop/rotate/delete controls (screenshot confirms); tapped "حفظ"
  (Save) and captured a **real download event** — `scan-<ts>.pdf`,
  60,920 bytes, with the "PDF downloaded" success toast shown. This is
  a genuine, working, non-trivial feature end to end on web. Could not
  reproduce whatever the original report described — if it's an
  iOS-native-specific issue (real device camera permission flow, actual
  Share Sheet), that needs a real device test this environment cannot
  provide (see NATIVE below).
- **File Converter** (`EliteTools.tsx`'s `FileConverter`, 16 conversion
  types, all client-side via Canvas/`jsPDF`/`pdf-lib`/`pdfjs-dist`/
  `mammoth` — genuinely implemented, not stubs). Tested 2 representative
  conversions end to end with real files and real downloads: **Text →
  PDF** (uploaded a real `.txt`, converted, downloaded a real 3501-byte
  `test-sample.pdf`) and **PNG → JPG** (uploaded a real 78-byte PNG,
  converted, downloaded a real 778-byte JPG). Both showed the correct
  "N file(s) ready" success state and had no errors. The other 14
  conversion types share the same now-proven helper functions
  (`downloadBlob`/`canvasToBlob`/`fileToImage`) but were not each
  individually clicked through — not claimed as tested.
- **Zakat calculator**: entered 100,000 SAR cash → result showed
  "2,500.00 ر.س." (exactly 2.5%) — mathematically verified correct.
- **Age calculator**: entered birth date 1990-05-15 → result showed
  "36 سنة 4 شهر 4 يوم" plus total days/weeks/hours and next birthday —
  checked the arithmetic against the app's current simulated date
  (19/09/2026) and it is correct.
- **Unit converter**: 10 mm → "1 سنتيمتر" — correct.
- **Hijri converter**: today's Gregorian date → "8 ربيع الآخر 1448 هـ"
  — matches the Hijri date shown consistently elsewhere in the app
  (Calendar page, Phase 11) all session.
- **Inheritance calculator**: dialog opens with a complete, sensible
  input form (spouse/sons/daughters/siblings/parents-alive); the
  calculation algorithm itself is already covered by 4 passing unit
  tests (`mirath.test.ts` — wife+2sons+2daughters, awl, radd, umariyya
  scenarios) that were not touched, so its correctness is independently
  verified without redoing that work by hand.
- **QR Scanner**: same real camera pipeline as Document Scanner,
  confirmed the live camera stream opens correctly (`video.videoWidth`
  populated) with no errors. The actual decode-on-scan logic (pointing
  a real QR code at the camera) was **not** exercised — noted, not
  claimed as tested.

**EXTERNAL — implemented correctly, but the live network call could
not be verified in this sandboxed, offline test environment (same
pre-existing limitation seen in every earlier phase — Supabase
realtime, ipapi.co, etc. all fail here for the same reason):**
- **Currency converter**: calls `api.frankfurter.app` (a real, free
  exchange-rate API); the UI correctly showed a graceful Arabic error
  message ("تعذّر جلب أسعار الصرف") with a retry button instead of
  crashing or inventing a fake rate — this is the correct behavior, not
  a bug.
- **Weather**: investigated carefully since the on-screen result looked
  like it could be "fake" data — it is not. `WeatherDialog` →
  `DesertModePanel` calls a real `fetchLiveWeather()` against
  `api.open-meteo.com` for the user's actual selected city, and only
  merges in a deterministic Al-Qassim seasonal-climatology fallback
  for whichever fields the live call didn't return; a `● live` badge is
  shown only when the live fetch actually succeeded, so the UI already
  distinguishes real vs. estimated data honestly. In this offline
  sandbox the live fetch fails, so the fallback estimate is what was
  seen on screen — expected, not a defect. The "radar" tab embeds a
  real `windy.com` iframe.
- **Saudi Jobs**: search correctly called a real Supabase edge function
  (`search-saudi-jobs`), which failed to reach the network in this
  sandbox; the UI showed an honest "تعذر جلب الوظائف حالياً" error with
  a retry button — no fake job listings were fabricated.
- **Media Downloader**: page loads correctly with a real
  paste-a-link-to-download flow; extracting/downloading from an actual
  pasted URL needs real internet access to a real target link, which
  this sandbox cannot provide — not exercised beyond confirming the
  page and its input UI load without errors.

**NATIVE — genuinely needs a real iOS device/build, not reproducible
here:** the Share Sheet path in both Document Scanner's `savePdf()`/
`sharePdf()` and File Converter's `saveOrShareBlob()` (both explicitly
branch on `isIOSNativeApp()` to use `navigator.share` with a `File`
instead of `<a download>`, since a plain download link is a silent
no-op inside a Capacitor WKWebView) — the code path exists and reads
correctly, but actually exercising it requires a real native build.

**No BLOCKED items** — every tool in the inventory was at least opened
and interacted with to some degree; nothing was skipped without a
concrete, stated reason.

**Verified, not just claimed:**
- 375px width: `scrollWidth === clientWidth` (375 === 375) on every
  page/dialog tested (Document Scanner, File Converter, all
  calculators, Weather, Media, Saudi Jobs).
- No console errors or `pageerror`s in any of the above tests.
- `npx tsc --noEmit -p tsconfig.app.json`: only the same 3 pre-existing
  baseline errors remain (not touched, per instruction — no new errors
  were introduced since no code was changed).
- `npm run test`: **50/50 passing** (11 files, unchanged suite).
- `npm run build`: succeeds.
- No commit was created this phase — `git status` stayed clean
  throughout, since no bug was found that required a code fix.

main was not touched. No subagents were used. Phase 13 was not started.

## Next phase

Several things remain open:

1. **The remaining reference-matched page restyles**: Splash screen,
   Prayer Times, Hijri/Gregorian Calendar,
   Appointments-with-notifications, File Converter (**visual framing
   only, e.g. header/back-button style — the converter UI itself stays
   untouched**), Calculators, Settings, Notifications.
2. **Persistent bottom nav on every page** (see Phase 4 limitation above).
3. **Islamic education content and Islamic wallpapers** — both still need
   your input before real work can start: what educational content and
   from which source for the former; whose images and under what license
   for the latter. Still not fabricated.
4. **A dedicated Ramadan mode** — still needs a scope decision (fasting
   tracker? Suhoor/Iftar timers? a Ramadan-specific home screen?) before
   implementation.
