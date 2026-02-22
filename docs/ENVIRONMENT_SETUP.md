# Przewodnik Konfiguracji Zmiennych Środowiskowych

## 📋 Spis Treści

1. [Przegląd](#przegląd)
2. [PHASE 1 - Wymagane dla Production](#phase-1---wymagane-dla-production)
   - [Upstash Redis (Rate Limiting)](#1-upstash-redis-rate-limiting)
   - [Sentry (Error Tracking)](#2-sentry-error-tracking)
   - [Production URLs](#3-production-urls)
3. [PHASE 2 - Płatności i Email](#phase-2---płatności-i-email)
   - [Przelewy24 (Payment Gateway)](#4-przelewy24-payment-gateway)
   - [Resend (Email Service)](#5-resend-email-service)
4. [Konfiguracja w Vercel](#konfiguracja-w-vercel)
5. [Weryfikacja Konfiguracji](#weryfikacja-konfiguracji)

---

## Przegląd

SimpliSalonCloud wymaga kilku zewnętrznych serwisów do działania w produkcji. Ten przewodnik pomoże Ci skonfigurować każdy z nich krok po kroku.

**Priorytety:**
- ✅ **PHASE 1** - Wymagane PRZED pierwszym production deployment (Upstash, Sentry)
- 🔜 **PHASE 2** - Wymagane przed akceptowaniem płatności (Przelewy24, Resend)
- 🔧 **Opcjonalne** - Google Calendar, Booksy (można dodać później)

---

## PHASE 1 - Wymagane dla Production

### 1. Upstash Redis (Rate Limiting)

**Dlaczego:** Rate limiting chroni API przed nadużyciami i atakami DDoS.

**Koszt:** Darmowy tier (10,000 requestów/dzień) wystarczy na start.

#### Krok po kroku:

1. **Zarejestruj konto**:
   - Idź do: https://console.upstash.com
   - Kliknij "Sign Up" (możesz użyć GitHub login)

2. **Utwórz bazę Redis**:
   - Po zalogowaniu kliknij "Create Database"
   - **Name**: `simplisalon-ratelimit`
   - **Type**: Wybierz "Regional" (tańsze)
   - **Region**: Wybierz `eu-central-1` (Frankfurt - najbliżej Polski)
   - **Eviction**: Włącz "Enable Eviction" (automatyczne czyszczenie starych kluczy)
   - Kliknij "Create"

3. **Skopiuj credentials**:
   - Po utworzeniu bazy zobaczysz Dashboard
   - Kliknij zakładkę **"REST API"**
   - Skopiuj:
     - `UPSTASH_REDIS_REST_URL` (np. `https://eu1-brief-cod-12345.upstash.io`)
     - `UPSTASH_REDIS_REST_TOKEN` (długi string zaczynający się od `AX...`)

4. **Dodaj do `.env.local`**:
   ```bash
   UPSTASH_REDIS_REST_URL=https://eu1-brief-cod-12345.upstash.io
   UPSTASH_REDIS_REST_TOKEN=AXasdf1234567890...
   ```

5. **Weryfikacja**:
   ```bash
   npm run dev
   ```
   - Sprawdź logi - powinno być: `✅ Rate limiting configured`
   - Przetestuj endpoint: `curl http://localhost:3000/api/public/bookings -X POST`
   - Powinien zwrócić header: `X-RateLimit-Limit: 100`

---

### 2. Sentry (Error Tracking)

**Dlaczego:** Monitoring błędów w production - dowiesz się o problemach zanim użytkownicy narzekają.

**Koszt:** Darmowy tier (5,000 errors/miesiąc).

#### Krok po kroku:

1. **Zarejestruj konto**:
   - Idź do: https://sentry.io/signup/
   - Użyj email lub GitHub

2. **Utwórz projekt**:
   - Po zalogowaniu kliknij "Create Project"
   - **Platform**: Wybierz `Next.js`
   - **Alert frequency**: Default (lub "Alert me on every new issue")
   - **Project name**: `simplisaloncloud`
   - Kliknij "Create Project"

3. **Pobierz DSN**:
   - Po utworzeniu zobaczysz "Configure SDK"
   - Skopiuj `DSN` (wygląda jak: `https://abc123@o456789.ingest.sentry.io/123456`)
   - **WAŻNE**: To jest `NEXT_PUBLIC_SENTRY_DSN`

4. **Utwórz Auth Token** (dla upload source maps):
   - Idź do: https://sentry.io/settings/account/api/auth-tokens/
   - Kliknij "Create New Token"
   - **Name**: `SimpliSalon CI/CD`
   - **Scopes**: Zaznacz:
     - ✅ `project:read`
     - ✅ `project:releases`
     - ✅ `org:read`
   - Kliknij "Create Token"
   - **Skopiuj token** (zaczyna się od `sntrys_...`) - to `SENTRY_AUTH_TOKEN`

5. **Znajdź Organization i Project slug**:
   - Organization slug: Zobacz URL po zalogowaniu do Sentry (np. `https://sentry.io/organizations/your-org-slug/`)
   - Project slug: `simplisaloncloud` (lub jak nazwałeś projekt)

6. **Dodaj do `.env.local`**:
   ```bash
   NEXT_PUBLIC_SENTRY_DSN=https://abc123@o456789.ingest.sentry.io/123456
   SENTRY_AUTH_TOKEN=sntrys_1234567890abcdef...
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=simplisaloncloud
   ```

7. **Inicjalizuj Sentry w projekcie**:
   ```bash
   npx @sentry/wizard@latest -i nextjs
   ```
   - Wybierz opcje:
     - ✅ Yes, create files (sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts)
     - ✅ Yes, add Sentry to middleware
     - ❌ No, skip example (mamy już error handling)

8. **Weryfikacja**:
   - Uruchom dev: `npm run dev`
   - Idź do: http://localhost:3000
   - W browser console wpisz: `throw new Error("Test Sentry");`
   - Sprawdź w Sentry Dashboard (Issues) - error powinien się pojawić w ~30s

---

### 3. Production URLs

**Dlaczego:** CORS i webhooks potrzebują znać production URL.

#### Krok po kroku:

1. **Zarejestruj domenę** (jeśli nie masz):
   - Opcje:
     - **OVH.pl**: ~30 PLN/rok za .pl
     - **Vercel Domains**: ~$15/rok za .com
     - **nazwa.pl**: ~39 PLN/rok za .pl

2. **Dodaj do `.env.local`** (dla development):
   ```bash
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
   ```

3. **Dla Vercel Production** (dodasz w Vercel UI później):
   ```bash
   NEXT_PUBLIC_APP_URL=https://app.simplisalon.pl
   ALLOWED_ORIGINS=https://app.simplisalon.pl,https://www.simplisalon.pl
   ```

---

## PHASE 2 - Płatności i Email

### 4. Przelewy24 (Payment Gateway)

**Dlaczego:** Przyjmowanie płatności od klientów (BLIK, karty, przelewy).

**Koszt:** 1.5% prowizji od transakcji. Bez opłat stałych.

#### Krok po kroku:

1. **Wymagania**:
   - ⚠️ **Potrzebujesz**: NIP firmy (jednoosobowa działalność wystarczy)
   - ⚠️ **Weryfikacja**: 3-5 dni roboczych

2. **Rejestracja**:
   - Idź do: https://www.przelewy24.pl/rejestracja
   - Wypełnij formularz:
     - Dane firmy (NIP, REGON, adres)
     - Dane kontaktowe
     - Rachunek bankowy (do wypłat)
   - Poczekaj na email z potwierdzeniem i danymi dostępowymi

3. **Aktywacja Sandbox** (dla testów):
   - Po rejestracji zaloguj się do panelu
   - Idź do: **Ustawienia** -> **API**
   - Włącz "Środowisko testowe"
   - Skopiuj:
     - `Merchant ID` (np. `12345`)
     - `POS ID` (zazwyczaj taki sam jak Merchant ID)
     - `CRC Key` (klucz szyfrujący)

4. **Dodaj do `.env.local`** (sandbox):
   ```bash
   P24_MERCHANT_ID=12345
   P24_POS_ID=12345
   P24_CRC=your_sandbox_crc_key_here
   P24_API_URL=https://sandbox.przelewy24.pl
   ```

5. **Produkcja** (po testach):
   - W panelu P24 przejdź do trybu produkcyjnego
   - Zmień w Vercel:
     ```bash
     P24_API_URL=https://secure.przelewy24.pl
     ```

6. **Weryfikacja**:
   - Testuj płatności w sandbox z danymi testowymi:
     - **Karta testowa**: `4444 3333 2222 1111`, CVV `123`, data `12/25`
     - **BLIK testowy**: kod `777123`

---

### 5. Resend (Email Service)

**Dlaczego:** Wysyłanie emaili (powitanie, faktury, powiadomienia).

**Koszt:** Darmowy tier (100 emaili/dzień), potem $20/miesiąc (50k emaili).

#### Krok po kroku:

1. **Zarejestruj konto**:
   - Idź do: https://resend.com/signup
   - Użyj email lub GitHub

2. **Dodaj domenę** (opcjonalne, ale zalecane):
   - W Resend Dashboard kliknij "Domains"
   - Kliknij "Add Domain"
   - Wpisz: `simplisalon.pl`
   - Dodaj rekordy DNS (SPF, DKIM) w swojej domenie (OVH/nazwa.pl)
   - Poczekaj na weryfikację (~10-30 min)

3. **Utwórz API Key**:
   - Kliknij "API Keys" w menu
   - Kliknij "Create API Key"
   - **Name**: `SimpliSalon Production`
   - **Permission**: Full Access
   - Kliknij "Create"
   - **Skopiuj klucz** (zaczyna się od `re_...`) - pokażę go tylko raz!

4. **Dodaj do `.env.local`**:
   ```bash
   RESEND_API_KEY=re_1234567890abcdef...
   ```

5. **Weryfikacja**:
   - Testuj wysyłkę:
   ```bash
   curl -X POST https://api.resend.com/emails \
     -H "Authorization: Bearer re_your_key" \
     -H "Content-Type: application/json" \
     -d '{
       "from": "SimpliSalon <noreply@simplisalon.pl>",
       "to": "twoj-email@example.com",
       "subject": "Test email",
       "html": "<p>Działa!</p>"
     }'
   ```

---

## Konfiguracja w Vercel

Po zdobyciu wszystkich kluczy, dodaj je do Vercel:

### Krok po kroku:

1. **Zaloguj się do Vercel**:
   - https://vercel.com

2. **Wybierz projekt**:
   - Kliknij na swój projekt "SimpliSalonCloud"

3. **Idź do Settings**:
   - Kliknij zakładkę "Settings"
   - Z lewego menu wybierz **"Environment Variables"**

4. **Dodaj każdą zmienną**:
   - Dla każdej zmiennej:
     - Kliknij "Add New"
     - **Name**: Nazwa zmiennej (np. `UPSTASH_REDIS_REST_URL`)
     - **Value**: Wartość (skopiowana z serwisu)
     - **Environment**: Zaznacz ✅ Production, ✅ Preview, ✅ Development
     - Kliknij "Save"

5. **Zmienne do dodania w Vercel** (w tej kolejności):

   **PHASE 1 - WYMAGANE:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://ubkueiwelarplnbhqmoa.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[twój obecny klucz]
   SUPABASE_SERVICE_ROLE_KEY=[twój obecny klucz]
   NEXT_PUBLIC_APP_URL=https://app.simplisalon.pl
   ALLOWED_ORIGINS=https://app.simplisalon.pl,https://www.simplisalon.pl
   UPSTASH_REDIS_REST_URL=[z Upstash]
   UPSTASH_REDIS_REST_TOKEN=[z Upstash]
   NEXT_PUBLIC_SENTRY_DSN=[z Sentry]
   SENTRY_AUTH_TOKEN=[z Sentry]
   SENTRY_ORG=[twój org slug]
   SENTRY_PROJECT=simplisaloncloud
   ```

   **PHASE 2 - Dodaj później:**
   ```
   P24_MERCHANT_ID=[z Przelewy24]
   P24_POS_ID=[z Przelewy24]
   P24_CRC=[z Przelewy24]
   P24_API_URL=https://sandbox.przelewy24.pl
   RESEND_API_KEY=[z Resend]
   ```

6. **Redeploy**:
   - Po dodaniu zmiennych, idź do zakładki "Deployments"
   - Kliknij "..." przy ostatnim deployment
   - Kliknij "Redeploy"
   - Zmienne zostaną zastosowane

---

## Weryfikacja Konfiguracji

### 1. Lokalna weryfikacja (development)

Uruchom skrypt walidacji:

```bash
npm run dev
```

Sprawdź logi - powinny być:
```
✅ Environment validation passed
📦 Feature Configuration Status:
  Rate Limiting (Upstash): ✅
  Monitoring (Sentry): ✅
  Payment (Przelewy24): ❌  [ok w Phase 1]
  Email (Resend): ❌  [ok w Phase 1]
```

### 2. Health Check endpoint

Po uruchomieniu, sprawdź:

```bash
curl http://localhost:3000/api/health
```

Powinno zwrócić:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-14T...",
  "version": "0.1.0",
  "checks": {
    "database": { "status": "ok", "responseTime": 123 },
    "redis": { "status": "ok", "responseTime": 45 }
  },
  "uptime": 1234.56
}
```

### 3. Production weryfikacja (Vercel)

Po deployment:

```bash
curl https://app.simplisalon.pl/api/health
```

Powinno zwrócić podobny JSON jak powyżej.

---

## Troubleshooting

### Błąd: "Missing required environment variable: UPSTASH_REDIS_REST_URL"

**Rozwiązanie**: Dodaj zmienne do `.env.local` i zrestartuj `npm run dev`

### Błąd: "Redis connection failed"

**Rozwiązanie**:
1. Sprawdź czy `UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN` są poprawne
2. Upewnij się że URL zaczyna się od `https://`
3. Sprawdź czy baza Redis jest aktywna w Upstash Dashboard

### Błąd: "Sentry DSN is invalid"

**Rozwiązanie**:
1. DSN powinno wyglądać jak: `https://abc@o123.ingest.sentry.io/456`
2. Sprawdź w Sentry: Settings -> Projects -> SimpliSalon -> Client Keys (DSN)

### Vercel: Zmienne nie działają po deployment

**Rozwiązanie**:
1. Upewnij się że zaznaczyłeś ✅ Production environment
2. Po dodaniu zmiennych MUSISZ zrobić redeploy
3. Sprawdź logi deployment w Vercel (Build Logs)

---

## Checklist Konfiguracji

**PHASE 1 (przed pierwszym production deployment):**

- [ ] ✅ Upstash Redis skonfigurowany
  - [ ] Konto utworzone
  - [ ] Baza Redis utworzona (region eu-central-1)
  - [ ] `UPSTASH_REDIS_REST_URL` skopiowany
  - [ ] `UPSTASH_REDIS_REST_TOKEN` skopiowany
  - [ ] Dodane do `.env.local`
  - [ ] Dodane do Vercel Environment Variables

- [ ] ✅ Sentry skonfigurowany
  - [ ] Konto utworzone
  - [ ] Projekt utworzony
  - [ ] `NEXT_PUBLIC_SENTRY_DSN` skopiowany
  - [ ] `SENTRY_AUTH_TOKEN` utworzony
  - [ ] `SENTRY_ORG` i `SENTRY_PROJECT` znane
  - [ ] Dodane do `.env.local`
  - [ ] Dodane do Vercel Environment Variables
  - [ ] `npx @sentry/wizard` uruchomione

- [ ] ✅ Production URLs
  - [ ] Domena zarejestrowana
  - [ ] `NEXT_PUBLIC_APP_URL` ustawione
  - [ ] `ALLOWED_ORIGINS` ustawione
  - [ ] Dodane do Vercel Environment Variables

- [ ] ✅ Weryfikacja
  - [ ] `npm run dev` działa bez błędów
  - [ ] `/api/health` zwraca status "healthy"
  - [ ] Vercel deployment zakończony sukcesem
  - [ ] Production `/api/health` działa

**PHASE 2 (przed akceptowaniem płatności):**

- [ ] 🔜 Przelewy24 skonfigurowany
- [ ] 🔜 Resend skonfigurowany
- [ ] 🔜 Email templates utworzone
- [ ] 🔜 Płatności testowe w sandbox działają

---

**Pytania?** Jeśli coś nie działa, sprawdź logi:
- Development: Terminal gdzie działa `npm run dev`
- Production: Vercel Dashboard -> Deployments -> View Function Logs
