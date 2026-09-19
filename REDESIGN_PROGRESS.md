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

## Next phase

Several things remain open:

1. **The remaining reference-matched page restyles**: Splash screen,
   Quran, Athkar, Qibla, Prayer Times, Hijri/Gregorian Calendar,
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
