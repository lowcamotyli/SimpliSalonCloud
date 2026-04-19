# Sprint: Mobile Phase 5 — PWA (Progressive Web App)
**Branch:** `feature/pwa`
**Prereq:** Mobile Phase 4 done (UI responsywne)

---

## Cel

Umożliwić użytkownikom instalację aplikacji na iOS i Android jako ikonkę na ekranie głównym — bez App Store / Play Store. Po instalacji app otwiera się bez paska przeglądarki, wygląda jak natywna apka.

---

## Prereq: Ikony (BLOKUJĄCE — zrób przed dispatchem)

PWA wymaga ikon PNG. Potrzebne pliki:
- `public/icons/icon-192x192.png` — 192×192 px
- `public/icons/icon-512x512.png` — 512×512 px
- `public/icons/apple-touch-icon.png` — 180×180 px

**Opcja A (polecana):** Dostarcz logo SimpliSalon jako PNG ≥ 512px → Claude wygeneruje ikony przez skrypt `sharp`.
**Opcja B:** codex-main generuje `app/icon.tsx` (Next.js ImageResponse) — literka "S" na tle koloru marki (#kolor). Next.js serwuje jako `/icon` endpoint, manifest wskazuje na ten URL.

---

## Architektura — dokumenty referencyjne

Brak relevantnych arch docs (PWA to warstwa infrastruktury, nie business logic).

---

## Pliki do stworzenia / zmiany

| Plik | Akcja | Worker |
|------|-------|--------|
| `package.json` | dodaj `@ducanh2912/next-pwa` | Claude (pnpm add) |
| `next.config.js` | wrap z `withPWA` | Claude (edit ~10 linii) |
| `app/manifest.ts` | nowy plik — Next.js native manifest | codex-main |
| `app/layout.tsx` | dodaj viewport + themeColor + apple-touch-icon meta | Claude (edit ~10 linii) |
| `public/icons/` | ikony PNG (patrz prereq wyżej) | prereq |

---

## Graf zależności

```
[prereq] ikony PNG
         ↓
[parallel] pnpm add @ducanh2912/next-pwa
           next.config.js edit
           app/manifest.ts (nowy)
           app/layout.tsx edit
         ↓
[verify] build lokalny → brak TS errors → Lighthouse PWA audit
```

Wszystkie 4 zmiany są niezależne — parallel dispatch.

---

## Acceptance criteria

- [ ] `npx tsc --noEmit` — clean
- [ ] `next build` — brak błędów (withPWA nie łamie buildu)
- [ ] `GET /manifest.webmanifest` → zwraca JSON z `name`, `icons`, `display: standalone`
- [ ] Na Chrome mobile: "Dodaj do ekranu głównego" pojawia się automatycznie (A2HS prompt)
- [ ] Po instalacji: app otwiera się bez paska adresu (standalone mode)
- [ ] iOS Safari: ikona po "Add to Home Screen" wyświetla się poprawnie
- [ ] Podstawowy cache: app ładuje się offline (cached shell)

---

## Verification

```bash
npx tsc --noEmit
pnpm build
# Po deployu na Vercel:
# Chrome DevTools → Application → Manifest → sprawdź ikony i display
# Lighthouse → PWA audit → cel: wszystkie zielone
```

---

## Szczegóły implementacyjne

### `app/manifest.ts` (Next.js 14+ native)
```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SimpliSalon',
    short_name: 'SimpliSalon',
    description: 'System zarządzania salonem',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#[kolor marki]',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
    shortcuts: [
      {
        name: 'Grafik',
        url: '/[slug]/calendar',
        description: 'Otwórz grafik',
      },
    ],
  }
}
```

### `next.config.js` — withPWA wrapper
```js
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
  },
})

// owijasz istniejący nextConfig
module.exports = withSentry(withPWA(nextConfig), ...)
```

### `app/layout.tsx` — dodatkowe meta
```ts
export const viewport: Viewport = {
  themeColor: '#[kolor marki]',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// w metadata:
appleWebApp: {
  capable: true,
  statusBarStyle: 'default',
  title: 'SimpliSalon',
},
```

---

## Work packages

- **pkg-1** | implementation | Claude → `pnpm add @ducanh2912/next-pwa`
- **pkg-2** | implementation | Claude → edit `next.config.js`
- **pkg-3** | implementation | codex-main → nowy `app/manifest.ts`
- **pkg-4** | implementation | Claude → edit `app/layout.tsx`
- **pkg-5** | implementation | prereq → ikony PNG w `public/icons/`

---

## Evidence log

<!-- append-only -->

---

## Decision

Ship: — | Powód: — | Accepted risks: —
