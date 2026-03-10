# Sprint B — Niezawodność (WYSOKIE)

**Szacowany czas:** ~4h
**Priorytet:** Ten tydzień
**Status:** [ ] Do zrobienia
**Zależność:** Sprint A musi być zakończony

---

## B1 — Rate limiting in-memory → Redis (Upstash)

**Plik:** `lib/middleware/rate-limit.ts`
**Problem:** Aktualny rate limiter używa `new Map<string, number[]>()` w pamięci procesu. Na Vercel Serverless:
- Każda invocacja może trafić do innej instancji (cold start = reset mapy)
- Concurrent requests trafiają do różnych instancji
- Efekt: rate limiting jest **nieaktywny w production**

**Stan gotowości:** Projekt już ma zainstalowane `@upstash/ratelimit` i `@upstash/redis` w `package.json` — wystarczy tylko użyć.

**Wymagane zmienne środowiskowe** (dodać do `.env.local` i Vercel):
```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

**Plan implementacji:**

1. Zainicjalizować Redis client w `lib/redis.ts`:
```typescript
import { Redis } from '@upstash/redis'
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
```

2. Zastąpić `lib/middleware/rate-limit.ts` implementacją Upstash:
```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1m'),
  analytics: true,
})
// Zachować tę samą sygnaturę publiczną: applyRateLimit(request, opts?)
```

3. Fallback dla dev (gdy brak Upstash env): zachować in-memory jako dev fallback z ostrzeżeniem w logach.

**Uwaga:** Upstash ma darmowy tier (10k requests/day) — wystarczy dla MVP.

---

## B2 — Brak rate limitingu w kluczowych API routes

**Problem:** `applyRateLimit` jest tylko w `bookings`, `clients`, `employees`. Reszta jest bez ochrony.

**Routes do objęcia rate limitingiem:**

| Route | Zalecany limit | Uzasadnienie |
|-------|---------------|--------------|
| `POST /api/services` | 30/min | Tworzenie usług |
| `PATCH /api/services/[id]` | 30/min | Edycja usług |
| `GET /api/reports/*` | 20/min | Generowanie raportów (ciężkie query) |
| `POST /api/crm/quick-send` | 10/min | Wysyłanie SMS/email |
| `POST /api/crm/campaigns` | 10/min | Tworzenie kampanii |
| `GET /api/payroll` | 20/min | Obliczenia payroll |
| `POST /api/billing/subscribe` | 5/min | Subskrypcje |
| `POST /api/billing/sms-topup` | 5/min | Doładowania SMS |
| `GET /api/settings` | 30/min | Odczyt ustawień |
| `POST /api/settings` | 15/min | Zapis ustawień |

**Pattern do zastosowania** (po implementacji B1):
```typescript
export const POST = withErrorHandling(async (request: NextRequest) => {
  const rl = await applyRateLimit(request, { limit: 30 })
  if (rl) return rl
  // ... reszta handlera
})
```

---

## B3 — `console.*` → structured logger

**Problem:** Kilka routes używa `console.error/log` zamiast `logger` z `lib/logger.ts`. Logi nie mają struktury (brak kontekstu) i nie integrują się poprawnie z Sentry.

**Pliki do poprawy:**

| Plik | Linia | Zmiana |
|------|-------|--------|
| `app/api/reports/top-employees/route.ts` | ~38, ~55 | `console.error` → `logger.error` |
| `app/api/billing/cancel/route.ts` | sprawdzić | `console.*` → `logger.*` |
| `app/api/billing/subscribe/route.ts` | sprawdzić | `console.*` → `logger.*` |
| `app/api/billing/sms-topup/route.ts` | sprawdzić | `console.*` → `logger.*` |

**Wzorzec:**
```typescript
// PRZED:
console.error('Error fetching top employees via RPC, attempting fallback logic...', error)

// PO:
import { logger } from '@/lib/logger'
logger.error('get_top_employees RPC failed, using fallback', error, {
  endpoint: 'GET /api/reports/top-employees',
})
```

**Szybka weryfikacja** — liste plików z console.*:
```bash
grep -rn "console\." app/api/ --include="*.ts" | grep -v "node_modules"
```

---

## B4 — Usunąć `lib/cron/guard.ts` (dead code)

**Plik:** `lib/cron/guard.ts`
**Problem:** Jest to tylko re-export alias stworzony "dla Sprint 00 compatibility". Sprint 00 jest dawno zamknięty. Jedyne użycie to `app/api/cron/blacklist-scoring/route.ts`.

**Wymagane zmiany:**

1. W `app/api/cron/blacklist-scoring/route.ts` zamień import:
```typescript
// PRZED:
import { validateCronRequest } from '@/lib/cron/guard'

// PO:
import { validateCronSecret as validateCronRequest } from '@/lib/middleware/cron-auth'
// lub prościej:
import { validateCronSecret } from '@/lib/middleware/cron-auth'
// i używaj validateCronSecret zamiast validateCronRequest
```

2. Usuń plik `lib/cron/guard.ts`

3. Sprawdź czy `lib/cron/` jest teraz pusty — jeśli tak, usuń katalog.

---

## B5 — Security headers — usunąć duplikację z `proxy.ts`

**Problem:** Security headers są definiowane w dwóch miejscach:
- `vercel.json` — globalnie dla wszystkich zasobów (statyczne, API, strony)
- `proxy.ts:29-38` — tylko w middleware, tylko w production, tylko dla dynamicznych tras

`vercel.json` jest source of truth — pokrywa więcej przypadków. Middleware-version jest redundantna i może powodować podwójne nagłówki w niektórych scenariuszach.

**Wymagana zmiana** w `proxy.ts` — usunąć blok:
```typescript
// USUNĄĆ ten cały blok (linie 28-38):
if (process.env.NODE_ENV === 'production') {
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}
```

**Uwaga:** Upewnij się że `vercel.json` ma kompletne security headers przed usunięciem (ma — sprawdzone podczas review).

**Wyjątek:** Jeśli zdecydujesz się na CSP (Content-Security-Policy) per-route (np. nonces dla inline scripts), to middleware może być właściwym miejscem. Na razie CSP jest w vercel.json statycznie — ok dla MVP.

---

## Checklist Sprint B

- [ ] B1: Stworzyć konto Upstash + env vars
- [ ] B1: Zaimplementować `lib/redis.ts`
- [ ] B1: Przepisać `lib/middleware/rate-limit.ts` na Upstash + dev fallback
- [ ] B2: Dodać `applyRateLimit` do 10 routes (services, reports, crm, billing, settings)
- [ ] B3: Zamienić `console.*` na `logger.*` we wszystkich API routes
- [ ] B4: Zaktualizować import w `blacklist-scoring/route.ts`
- [ ] B4: Usunąć `lib/cron/guard.ts`
- [ ] B5: Usunąć duplicate security headers z `proxy.ts`
- [ ] Uruchomić `npx tsc --noEmit` → 0 errors
- [ ] Manualny test CRON endpoint po usunięciu guard.ts
