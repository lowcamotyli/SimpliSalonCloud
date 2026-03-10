# AGENT CODE REVIEW — SimpliSalonCloud
# Wdrożenie produkcyjne: nowa klientka (Marzec 2026)
#
# Cel: Wykonaj kompletne code review przed deployem.
# Raport zapisz do: review/AGENT_REVIEW_REPORT.md
# Format raportu: zdefiniowany na końcu tego pliku.
#
# WAŻNE: To jest review (czytaj + analizuj). NIE modyfikuj żadnych plików produkcyjnych.
# Jedyny plik który możesz stworzyć/nadpisać: review/AGENT_REVIEW_REPORT.md

---

## KONTEKST PROJEKTU

**Aplikacja:** SimpliSalonCloud — cloud SaaS do zarządzania salonem urody
**Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + Auth + RLS), Vercel
**Architektura:** Multi-tenant (wiele salonów, izolacja przez `salon_id` + RLS)
**Kluczowe lib:** `lib/supabase/`, `lib/middleware/`, `lib/rbac/`, `lib/messaging/`, `lib/payments/`

**Ostatnie review (07.03.2026):** Znaleziono 11 problemów (sprint-A, B, C w katalogu review/).
Żaden z nich nie jest odhaczony jako naprawiony. Sprawdź ich aktualny stan.

---

## KROK 1 — WERYFIKACJA ZNANYCH PROBLEMÓW (Sprint A/B/C)

Przeczytaj wszystkie trzy pliki:
- `review/sprint-A-security.md`
- `review/sprint-B-reliability.md`
- `review/sprint-C-quality.md`

Dla każdego z 11 zadań (A1, A2, A3, B1–B5, C1–C6) sprawdź aktualny stan kodu i odpowiedz:
- **FIXED** — problem został naprawiony (opisz jak)
- **OPEN** — problem nadal istnieje (potwierdź diagnozę)
- **PARTIAL** — częściowo naprawiony (opisz co zostało, co nie)

### Weryfikacje do wykonania:

**A1** — Przeczytaj `app/api/integrations/route.ts`. Czy jest `supabase.auth.getUser()` na początku handlera?

**A2** — Przeczytaj `proxy.ts` linia ~101. Czy uprawnienie to `settings:view` czy `settings:manage`?

**A3** — Przeczytaj `app/api/reports/top-employees/route.ts`. Czy jest wywołanie `supabase.rpc('get_top_employees')`?
Następnie uruchom: `npx tsc --noEmit 2>&1 | head -50` — zapisz wynik.

**B1** — Przeczytaj `lib/middleware/rate-limit.ts`. Czy używa Upstash/Redis czy `new Map()` w pamięci?
Sprawdź też `lib/redis.ts` — czy istnieje i jest prawidłowo skonfigurowany?

**B2** — Sprawdź 3 wybrane routes z listy B2 (np. `app/api/reports/revenue/route.ts`, `app/api/crm/quick-send/route.ts`, `app/api/billing/subscribe/route.ts`). Czy mają `applyRateLimit`?

**B3** — Uruchom: `grep -rn "console\." app/api/ --include="*.ts" | wc -l`. Zapisz liczbę.

**B4** — Sprawdź czy plik `lib/cron/guard.ts` istnieje.

**B5** — Przeczytaj `proxy.ts` linie 25–45. Czy jest blok z `Strict-Transport-Security`?

**C1** — Uruchom: `grep -rn "as any" app/api/ --include="*.ts" | wc -l`. Zapisz liczbę. Porównaj z 246.

**C4** — Sprawdź czy istnieją pliki: `app/api/crm/test-sms/route.ts`, `app/api/test-db-fundamentals/route.ts`. Czy mają guarda środowiskowego?

---

## KROK 2 — NOWE OBSZARY REVIEW

Wykonaj review w poniższej kolejności. Dla każdego obszaru czytaj wskazane pliki i dokumentuj znaleziska.

---

### 2A — IZOLACJA MULTI-TENANT (KRYTYCZNE przed wdrożeniem)

To jest najważniejszy obszar. Nowa klientka = nowy tenant. Wyciek danych między salonami to katastrofa.

**Przeczytaj i zweryfikuj:**

1. `app/api/bookings/route.ts` (GET handler)
   - Czy zapytanie SELECT filtruje przez `salon_id`?
   - Skąd pochodzi `salon_id` — z sesji/profilu użytkownika czy z parametru URL/body?
   - Czy user mógłby spreparować request i dostać bookings innego salonu?

2. `app/api/clients/route.ts` (GET handler)
   - Identyczne pytania jak wyżej.

3. `app/api/employees/route.ts` (GET handler)
   - Identyczne pytania jak wyżej.

4. `app/api/services/route.ts` (GET handler)
   - Identyczne pytania jak wyżej.

5. `lib/supabase/get-auth-context.ts` — czy plik istnieje?
   - Jeśli tak: czy zwraca `salonId` z profilu usera (z DB), nie z requestu?
   - Jeśli nie: jak różne routes pozyskują salon_id?

6. Supabase RLS — przeczytaj (nie uruchamiaj):
   Sprawdź `supabase/migrations/20250128000002_rls_clients.sql` i `20250128000003_rls_bookings.sql`.
   Czy policies używają funkcji pomocniczych jak `get_user_salon_id()` lub `auth.uid()`?
   Czy RLS jest ostatnią linią obrony (nawet gdyby kod API był błędny)?

7. Sprawdź `supabase/migrations/20260214195500_fix_clients_rls_isolation.sql` — co naprawiała ta migracja?
   Czy analogiczny problem może istnieć w innych tabelach?

**Wynik:** Lista tabel/endpointów z ryzykiem wycieku danych (jeśli istnieje).

---

### 2B — AUTENTYKACJA I AUTORYZACJA

1. `middleware.ts` lub `proxy.ts` — które chroni trasy dashboardu?
   - Czy `/[slug]/calendar`, `/[slug]/bookings`, `/[slug]/clients` wymagają zalogowania?
   - Czy istnieje ścieżka umożliwiająca dostęp do danych bez sesji?

2. `lib/rbac/role-maps.ts`
   - Jakie role istnieją? (owner, manager, employee?)
   - Czy employee ma ograniczony dostęp (np. widzi tylko swoje wizyty)?
   - Czy `components/auth/permission-guard.tsx` jest używany w krytycznych miejscach?

3. Publiczne API (`app/api/public/`):
   - Przeczytaj `lib/middleware/api-key-auth.ts` — jak weryfikuje klucz?
   - Sprawdź `app/api/public/availability/route.ts` — czy przyjmuje `salon_id` z zewnątrz? Czy to jest bezpieczne?
   - Sprawdź `app/api/public/bookings/route.ts` — czy POST tworzy booking dla właściwego salonu?
   - Czy istnieje ryzyko IDOR (Insecure Direct Object Reference) przez publiczne endpointy?

4. Webhook security:
   - Przeczytaj `app/api/webhooks/booksy/route.ts` — czy weryfikuje podpis webhooka?
   - Przeczytaj `app/api/billing/webhook/route.ts` — czy weryfikuje podpis?
   - Sprawdź `lib/messaging/webhook-signature.ts` — jak działa weryfikacja?

---

### 2C — KRYTYCZNA LOGIKA BIZNESOWA

1. **Double-booking prevention:**
   - Sprawdź `supabase/migrations/20260228130000_create_booking_atomic.sql`
   - Czy istnieje funkcja SQL lub constraint zapobiegający podwójnej rezerwacji tego samego slotu?
   - Sprawdź `app/api/bookings/check-availability/route.ts` — czy sprawdza slot atomowo?
   - Sprawdź `app/api/public/bookings/route.ts` — identycznie.

2. **Obliczenia finansowe (payroll):**
   - Przeczytaj `lib/payroll/period.ts` — jak obliczane są okresy rozliczeniowe?
   - Sprawdź `app/api/payroll/route.ts` — czy `commission_rate` pochodzi z DB, nie z requestu?
   - Czy `base_price`, `surcharge`, `total_price` są poprawnie zsumowane?

3. **Subskrypcje i billing:**
   - Sprawdź `lib/payments/subscription-manager.ts` — czy sprawdza aktualny plan przed wykonaniem akcji?
   - Sprawdź `lib/middleware/feature-gate.ts` — czy blokuje dostęp do funkcji premium?
   - Sprawdź `lib/middleware/usage-limiter.ts` — czy limity SMS/kampanii są egzekwowane per-salon?

4. **Timezone:**
   - Przeszukaj `lib/utils/date.ts` — czy operacje na datach uwzględniają timezone?
   - Sprawdź `app/api/bookings/route.ts` — czy daty są zapisywane z timezone info?
   - Sprawdź `app/api/public/availability/route.ts` — czy zwracane sloty są w poprawnej strefie czasowej?
   - UWAGA: Koniec marca = zmiana czasu (28.03.2026 w Polsce). Czy jest to obsłużone?

---

### 2D — BEZPIECZEŃSTWO DANYCH I API

1. **Walidacja inputu:**
   - Przeczytaj `lib/validators/booking.validators.ts` i `lib/validators/public-booking.validators.ts`
   - Czy pola wymagane są egzekwowane? (brak telefonu, zbyt długie pole, znaki specjalne)
   - Czy daty są walidowane (nie w przeszłości, rozsądny zakres)?

2. **SQL injection:**
   - Sprawdź czy są wywołania `.rpc()` z interpolowanymi stringami (szukaj backtick template literals przy rpc).
   - Sprawdź `app/api/bookings/import/route.ts` — import CSV to szczególnie ryzykowny obszar.

3. **Dane wrażliwe w logach:**
   - Przeczytaj `lib/logger.ts` — czy loguje dane osobowe (telefon, imię klienta)?
   - Sprawdź `app/api/clients/route.ts` — czy error handling loguje dane klienta?

4. **CORS:**
   - Przeczytaj `lib/middleware/cors.ts`
   - Czy `ALLOWED_ORIGINS` env var jest używany?
   - Czy publiczne API (`/api/public/*`) ma właściwy CORS policy?

5. **Zmienne środowiskowe:**
   - Sprawdź `lib/config/validate-env.ts` — które zmienne są walidowane?
   - Czy aplikacja crashuje przy starcie z brakiem krytycznej zmiennej, czy cicho failuje w runtime?
   - Porównaj z `.env.example` — czy wszystkie zmienne oznaczone jako REQUIRED są walidowane?

---

### 2E — OBSŁUGA BŁĘDÓW I MONITORING

1. **Error handling:**
   - Przeczytaj `lib/error-handler.ts` i `lib/errors.ts`
   - Czy `withErrorHandling` jest używany konsekwentnie we wszystkich API routes?
   - Sprawdź 3 losowe routes — czy wszystkie mają try/catch lub `withErrorHandling`?
   - Czy błędy 500 wyciekają stack trace do klienta?

2. **Sentry:**
   - Sprawdź `sentry.server.config.ts` i `sentry.client.config.ts`
   - Czy DSN jest skonfigurowany (nie placeholder)?
   - Czy `app/error.tsx` i `app/global-error.tsx` przechwytują błędy do Sentry?

3. **Health check:**
   - Przeczytaj `app/api/health/route.ts`
   - Co sprawdza? Czy testuje połączenie z DB?

4. **Cron jobs:**
   - Sprawdź `vercel.json` — czy crony są skonfigurowane?
   - Sprawdź `lib/middleware/cron-auth.ts` — jak weryfikuje autentyczność requesta?
   - Sprawdź `app/api/cron/reminders/route.ts` — czy filtruje reminders per-salon?

---

### 2F — JAKOŚĆ I KONFIGURACJA DEPLOYMENTU

1. **TypeScript:**
   Uruchom: `npx tsc --noEmit 2>&1 | tail -20`
   Zapisz liczbę błędów i ich typy.

2. **Build:**
   Uruchom: `npm run build 2>&1 | tail -30`
   Czy build przechodzi? Zapisz błędy/ostrzeżenia.

3. **Testy:**
   Uruchom: `npx vitest run 2>&1 | tail -20`
   Ile testów przechodzi/failuje?

4. **Vercel config:**
   Przeczytaj `vercel.json` — czy security headers są kompletne?
   Czy cron jobs mają właściwe endpointy i harmonogram?
   Czy `functions` timeout jest rozsądny dla ciężkich operacji?

5. **Dane testowe w produkcji:**
   Uruchom: `grep -rn "77777777-7777" app/ lib/ --include="*.ts" --include="*.tsx"`
   Czy UUID testowego salonu jest hardcoded poza plikami `.env`?

6. **Testowe endpointy:**
   Sprawdź czy istnieją i nie mają guarda środowiskowego:
   - `app/api/test-db-fundamentals/route.ts`
   - `app/api/webhooks/booksy/test/route.ts`

---

### 2G — ONBOARDING NOWEJ KLIENTKI

Zweryfikuj że następujące elementy działają dla nowego tenanta:

1. **Inicjalizacja salonu:**
   Sprawdź `app/(auth)/register/route.ts` lub signup flow.
   Czy po rejestracji tworzony jest rekord w `salons`?
   Czy `slug` salonu jest generowany poprawnie?
   Czy właściciel dostaje rolę `owner` w `profiles`?

2. **Zaproszenie pracownika:**
   Sprawdź `app/(auth)/invite/page.tsx` i powiązane API.
   Czy zaproszenie linkuje nowego użytkownika do właściwego `salon_id`?
   Czy rola jest przypisywana poprawnie?

3. **Pierwsze dane:**
   Jak właściciel dodaje usługi? Czy `services` POST w `app/api/services/route.ts` przypisuje właściwy `salon_id`?
   Jak dodaje pracownika? Sprawdź `app/api/employees/route.ts` POST.

4. **Plan subskrypcji:**
   Jaki plan dostaje nowy tenant po rejestracji?
   Sprawdź `supabase/migrations/20260215000001_fix_salons_subscription_default.sql`
   Czy domyślny plan ma rozsądne limity dla testowania?

---

## KROK 3 — SMOKE TEST (uruchom jeśli `npm run dev` działa)

```bash
# Test 1: Health check
curl -s http://localhost:3000/api/health | jq .

# Test 2: Publiczne API bez klucza — oczekiwane: 401
curl -s http://localhost:3000/api/public/services | jq .status

# Test 3: Publiczne API z błędnym kluczem — oczekiwane: 401
curl -s -H "x-api-key: wrong-key" http://localhost:3000/api/public/services | jq .status

# Test 4: Chroniony endpoint bez sesji — oczekiwane: 401
curl -s http://localhost:3000/api/bookings | jq .status

# Test 5: Integrations endpoint bez sesji — oczekiwane: 401 (test A1!)
curl -s "http://localhost:3000/api/integrations?salonId=00000000-0000-0000-0000-000000000000" | jq .status
```

---

## FORMAT RAPORTU WYNIKOWEGO

Zapisz raport w `review/AGENT_REVIEW_REPORT.md`:

```markdown
# AGENT REVIEW REPORT
Wygenerowany: [data i czas]
Reviewer: Claude Code (automatyczny)

---

## PODSUMOWANIE WYKONAWCZE

**Status wdrożenia:** [ZIELONY / ŻÓŁTY / CZERWONY]
**Blokery krytyczne (nie wdrażaj bez naprawy):** [liczba]
**Problemy wysokiego ryzyka:** [liczba]
**Problemy średniego ryzyka:** [liczba]
**Znane problemy z poprzedniego review (07.03.2026):** [X/11 naprawionych]

---

## SEKCJA 1 — STATUS ZNANYCH PROBLEMÓW

| ID | Problem | Status | Weryfikacja |
|----|---------|--------|-------------|
| A1 | /api/integrations — brak auth | FIXED/OPEN/PARTIAL | [jak sprawdzone] |
| A2 | settings:manage → settings:view | FIXED/OPEN/PARTIAL | [jak sprawdzone] |
| A3 | get_top_employees RPC nieistniejące | FIXED/OPEN/PARTIAL | [jak sprawdzone] |
| B1 | Rate limiting in-memory vs Redis | FIXED/OPEN/PARTIAL | [jak sprawdzone] |
| B2 | Brak rate limitingu w routes | FIXED/OPEN/PARTIAL | [jak sprawdzone] |
| B3 | console.* zamiast logger | FIXED/OPEN/PARTIAL | [liczba konsol w API] |
| B4 | lib/cron/guard.ts dead code | FIXED/OPEN/PARTIAL | [jak sprawdzone] |
| B5 | Security headers zdublowane | FIXED/OPEN/PARTIAL | [jak sprawdzone] |
| C1 | 246x as any | FIXED/OPEN/PARTIAL | [aktualna liczba] |
| C4 | Testowe endpointy w produkcji | FIXED/OPEN/PARTIAL | [jak sprawdzone] |

---

## SEKCJA 2 — NOWE ZNALEZISKA

### KRYTYCZNE — blokery wdrożenia

**[AREA-N] Tytuł**
- Plik: `ścieżka/do/pliku.ts` linia X
- Opis: Co jest nie tak
- Ryzyko: Co może się stać w produkcji
- Rekomendacja: Co konkretnie zmienić

### WYSOKIE — naprawić w tym sprincie

(analogiczny format)

### ŚREDNIE — naprawić w następnym sprincie

(analogiczny format)

### INFORMACYJNE

(analogiczny format)

---

## SEKCJA 3 — WYNIKI KOMEND

### TypeScript (npx tsc --noEmit)
[wynik]

### Build (npm run build — ostatnie 30 linii)
[wynik]

### Testy (npx vitest run — podsumowanie)
[wynik]

### console.* w app/api/
Znaleziono: X wystąpień

### as any w app/api/
Znaleziono: X wystąpień (poprzednio: 246)

### Hardcoded test UUID (poza .env)
[wynik grep]

### Smoke tests
Test 1 (health):                [wynik]
Test 2 (public/no-key):         [wynik]
Test 3 (public/bad-key):        [wynik]
Test 4 (bookings/no-session):   [wynik]
Test 5 (integrations/no-session): [wynik — TEST A1]

---

## SEKCJA 4 — CHECKLIST WDROŻENIOWA

### Blokery — MUSI być naprawione PRZED wdrożeniem:
- [ ] [lista]

### Wysoki priorytet — naprawić w ciągu 24h PO wdrożeniu:
- [ ] [lista]

### Dług techniczny — do zaplanowania:
- [ ] [lista]

### Gotowe — potwierdzone:
- [ ] TypeScript: 0 błędów
- [ ] Build: przechodzi
- [ ] Testy: X/Y przechodzi
- [ ] Izolacja multi-tenant: zweryfikowana
- [ ] Publiczne API: chronione kluczem
- [ ] Auth: działa dla nowego tenanta
- [ ] Dane testowe: brak hardcoded UUID w kodzie
```

---

## INSTRUKCJE DLA AGENTA

1. Zacznij od **Kroku 1** (weryfikacja znanych problemów) — szybkie i krytyczne.
2. **Krok 2A** (izolacja) wykonaj jako drugi — wyciek danych między salonami to bloker absolutny.
3. **Krok 2B** (auth) jako trzeci.
4. Pozostałe kroki możesz wykonywać równolegle.
5. **Jeśli znajdziesz bloker krytyczny** — zaznacz go wyraźnie w raporcie.
6. **Nie modyfikuj żadnego pliku produkcyjnego** — jedynie `review/AGENT_REVIEW_REPORT.md`.
7. **Bądź konkretny** — "plik X linia Y zawiera Z" zamiast "może być problem".

---

*Prompt wygenerowany: 2026-03-08*
*Bazuje na strukturze projektu i poprzednim review z 2026-03-07*
*Projekt: D:\SimpliSalonCLoud*
