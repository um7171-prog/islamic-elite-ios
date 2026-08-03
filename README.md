# النخبة الإسلامية — Islamic Elite

Progressive web app for prayer times, Qibla, Mushaf reader, Athkar, AI tools and a smart media downloader.
Built with **React 18 + Vite 5 + TypeScript + Tailwind CSS + shadcn/ui**, with a Supabase backend and
**Capacitor** support for publishing to the App Store and Google Play.

---

## 1. Requirements

- **Node.js 18+** (Node 20 LTS recommended)
- **npm 9+**
- For mobile builds: **Xcode 15+** (iOS, macOS only) and/or **Android Studio** (Android)

## 2. Installation

```bash
npm install
cp .env.example .env   # then fill in your backend values
npm run dev
```

The dev server runs at **http://localhost:8080**.

## 3. Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (regenerates the sitemap first) |
| `npm run build` | Production build into `dist/` |
| `npm run build:dev` | Build with development mode settings |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the Vitest test suite |

## 4. Environment variables

All variables live in `.env` (see `.env.example`):

- `VITE_SUPABASE_URL` — backend API URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — public anon key (safe in the client)
- `VITE_SUPABASE_PROJECT_ID` — backend project reference

Server-side secrets (AI keys, VAPID push keys, service role key) are **never** stored in this repo —
they are configured as secrets on the backend edge functions.

## 5. Project structure

```
public/            static assets, manifest.json, sw.js, robots.txt, sitemap.xml
scripts/           build-time helpers (sitemap generator)
src/
  assets/          images and media imported by components
  components/      UI + feature components
    ai/            AI tool pages (background remover, enhancer, OCR)
    islamic/       prayer, qibla, athkar, media, tools
    mushaf/        full-screen Quran Mushaf reader
    ui/            shadcn/ui primitives
  contexts/        Theme, Locale, City, PrayerCalc providers
  hooks/           reusable React hooks
  integrations/    backend client + generated types
  lib/             domain logic (prayer, qibla, athan, mushaf, utils)
  pages/           route-level pages
supabase/
  functions/       edge functions (push, translate, OCR, media extract)
ios/               native Swift helpers for athan scheduling
capacitor.config.ts
vite.config.ts
tailwind.config.ts
```

## 6. Building for production

```bash
npm run build
npm run preview
```

Output is a fully static bundle in `dist/` — deployable to any static host or CDN.

## 7. Capacitor — iOS & Android

The project is already Capacitor-ready (`capacitor.config.ts`, `@capacitor/core`, `ios`, `android`, `haptics`).

```bash
npm install
npm run build

npx cap add ios          # first time only
npx cap add android      # first time only

npx cap sync             # after every web build or native plugin change

npx cap run ios          # requires macOS + Xcode
npx cap run android      # requires Android Studio
```

**Before shipping to the stores**, remove the live-reload block from `capacitor.config.ts` so the app
loads the bundled `dist/` build instead of the remote preview URL:

```ts
// delete or comment out for store builds
server: {
  url: 'https://...lovableproject.com?forceHideBadge=true',
  cleartext: true,
},
```

Then set your own `appId` (reverse-domain, e.g. `com.techsnds.islamicelite`) and `appName`,
run `npm run build && npx cap sync`, and archive from Xcode / Android Studio.

## 8. Backend (optional)

Edge functions in `supabase/functions/` handle push notifications, translation, OCR and media
extraction. Deploy them to your own Supabase project and set the matching secrets
(`LOVABLE_API_KEY` or your AI provider key, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
The app degrades gracefully when they are not deployed — prayer times, Qibla, Mushaf and the
client-side AI tools all work offline of the backend.

## 9. Notes

- Web push requires HTTPS on a real domain; it is disabled inside preview iframes.
- The Mushaf reader streams page images from a public CDN, so a network connection is needed on first read.
- Light and dark themes follow the system setting by default and can be overridden in Settings.

## License

Private project. All rights reserved.
