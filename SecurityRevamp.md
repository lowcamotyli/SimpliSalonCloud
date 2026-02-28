Plan naprawczy - Audyt Security SimpliSalonCloud
SPRINT 1 — KRYTYCZNE (Tydzień 1)
S1.1 — Salon Isolation w endpoint GET/PATCH/DELETE (Gemini CLI)

Pliki: app/api/clients/[id]/route.ts, app/api/employees/[id]/route.ts, app/api/bookings/[id]/route.ts
Problem: Brak weryfikacji salon_id — dowolny zalogowany użytkownik może pobierać/modyfikować dane innych salonów przez zgadywanie UUID
Fix: Po pobraniu rekordu sprawdzić record.salon_id === userSalonId, inaczej 403
S1.2 — Autoryzacja endpointów CRON (krótkie, Claude)

Plik: vercel.json + każdy app/api/cron/*/route.ts
Problem: Cron joby dostępne publicznie — każdy może je wywołać
Fix: Dodać CRON_SECRET header w vercel.json + sprawdzać go w lib/middleware/cron-auth.ts
S1.3 — Timing-safe comparison w Przelewy24 (Claude — ~10 linii)

Plik: lib/payments/przelewy24-client.ts
Problem: expectedSign === notification.sign — timing attack na weryfikację płatności
Fix: crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
SPRINT 2 — WYSOKIE (Tydzień 2)
S2.1 — Rate limiting na głównych endpointach API (Gemini CLI)

Pliki: app/api/bookings/route.ts, app/api/clients/route.ts, app/api/employees/route.ts
Problem: Brak rate limiting — podatne na enumeration/scraping
Fix: Dodać middleware rate-limit do każdego z tych route'ów
S2.2 — Persistent replay protection dla SMSAPI webhook (Gemini CLI)

Plik: app/api/webhooks/smsapi/route.ts
Problem: replayCache = new Map() — ginie po restarcie serwera
Fix: Przenieść cache do Supabase (tabela webhook_replay_cache, TTL 5 min) lub Redis
S2.3 — Feature gate fail-secure (Claude — ~5 linii)

Plik: lib/middleware/feature-gate.ts
Problem: Gdy zapytanie do DB się nie powiedzie → allowed: true (domyślnie otwarte)
Fix: Zmienić domyślny fallback na allowed: false
S2.4 — Race condition w tworzeniu bookings (Gemini CLI)

Plik: app/api/bookings/route.ts
Problem: Check-then-insert bez transakcji → możliwy double-booking
Fix: Przenieść logikę do Supabase RPC/stored function z SELECT FOR UPDATE
SPRINT 3 — ŚREDNIE (Tydzień 3)
S3.1 — Settings endpoint nie może zwracać zaszyfrowanych sekretów (Gemini CLI)

Plik: app/api/settings/route.ts
Problem: SELECT * zwraca zaszyfrowane klucze API (resend, smsapi, p24) do frontendu
Fix: Whitelist kolumn w SELECT (tylko publiczne pola), osobny endpoint admin-only do odczytu kluczy
S3.2 — CORS hardening (Claude — ~5 linii)

Plik: lib/middleware/cors.ts
Problem: Ryzyko włączenia localhost originsów w produkcji jeśli NODE_ENV źle ustawiony
Fix: Explicit allowlist z env var ALLOWED_ORIGINS, nigdy nie polegać na NODE_ENV
S3.3 — Error messages nie mogą ujawniać detali implementacji (Gemini CLI)

Pliki: app/api/subscriptions/, app/api/employees/, app/api/bookings/
Problem: error.message przekazywany do klienta — leak internal DB errors
Fix: Zamienić na generyczne komunikaty, logować szczegóły tylko server-side
S3.4 — Sanityzacja parametru search w klientach (Claude — ~3 linie)

Plik: app/api/clients/route.ts
Problem: search wstawiony bezpośrednio do .or() query string
Fix: Sanitize/escape % i _ w search param przed przekazaniem do ilike
SPRINT 4 — NISKIE / DŁUG TECHNICZNY (Tydzień 4)
S4.1 — Env var validation na starcie aplikacji (Gemini CLI)

Nowy plik: lib/config/env-validation.ts + import w app/layout.tsx
Problem: Brakujące env zmienne powodują runtime 500, a nie fail-fast przy starcie
Fix: Zod schema dla wymaganych env vars, throw na brakujące w production
S4.2 — Usunięcie console.log z sensitive paths (Gemini CLI)

Pliki: app/api/public/bookings/route.ts, lib/booksy/processor.ts
Problem: Logowanie danych wrażliwych (dane klientów, tokeny) w produkcji
Fix: Zamienić na strukturalny logger z redakcją pól PII
S4.3 — PUBLIC_API_KEY guard (Claude — 1 plik)

Plik: app/api/public/bookings/route.ts
Problem: Development-only klucz może działać w produkcji
Fix: Walidacja że PUBLIC_API_KEY !== undefined + warning log jeśli wartość jest domyślna
Priorytety wdrożenia
Sprint	Czas	Ryzyko blokowane
S1	Tydzień 1	Kradzież danych między salonami, fałszywe płatności, triggering cronów
S2	Tydzień 2	Scraping, double-bookings, SMS replay
S3	Tydzień 3	Ekspozycja kluczy API, enumeration
S4	Tydzień 4	Dług techniczny, compliance
