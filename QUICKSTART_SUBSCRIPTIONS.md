# ⚡ Quick Start: System Subskrypcji

**Czas: ~20 minut** | **Poziom: Początkujący**

---

## 🎯 Co zrobisz

Po tym przewodniku będziesz miał:
- ✅ Działający system subskrypcji (4 plany)
- ✅ Integrację z Przelewy24 (sandbox)
- ✅ Funkcjonalne limity użycia
- ✅ Automatyczne cron jobs
- ✅ UI do zarządzania subskrypcją

---

## 📋 Wymagania

- [x] Docker Desktop uruchomiony
- [x] Node.js 18+ zainstalowany
- [x] Supabase CLI zainstalowany (`npm install -g supabase`)
- [x] Projekt sklonowany lokalnie

---

## 🚀 3 Kroki do Sukcesu

### KROK 1: Uruchom Bazę Danych (5 min)

```bash
# Otwórz terminal w folderze projektu
cd d:/SimpliSalonCLoud

# Start Docker Desktop (jeśli nie działa)
# Kliknij ikonę Docker Desktop w menu Start

# Start Supabase local
supabase start

# ⏳ Poczekaj ~2 minuty na init...
# ✅ Powinieneś zobaczyć:
#    API URL: http://localhost:54321
#    Studio URL: http://localhost:54323
```

**Weryfikacja**:
```bash
# Sprawdź czy działa
curl http://localhost:54321
# Expected: { "msg": "ok" }
```

---

### KROK 2: Uruchom Migrację (2 min)

```bash
# Push migration do bazy
supabase db push

# ✅ Powinieneś zobaczyć:
#    Applied migration: 20260215000000_add_subscription_system.sql
```

**Co się stało**:
- ✅ Utworzono 5 nowych tabel (subscriptions, invoices, payment_methods, usage_tracking, feature_flags)
- ✅ Zmodyfikowano tabelę salons (dodano trial_ends_at, billing_email, tax_id)
- ✅ Utworzono funkcje SQL i triggery
- ✅ Ustawiono RLS policies

**Weryfikacja**:
```bash
# Otwórz Supabase Studio
open http://localhost:54323

# Idź do: Table Editor
# Powinieneś zobaczyć nowe tabele: subscriptions, invoices, etc.
```

---

### KROK 3: Wygeneruj TypeScript Types (1 min)

```bash
# Generuj typy z bazy
supabase gen types typescript --local > lib/database.types.ts

# ✅ Plik utworzony: lib/database.types.ts
```

**Weryfikacja**:
```bash
# Check TypeScript errors
npx tsc --noEmit

# ✅ Powinno być 0 errorsów (lub tylko warnings)
```

---

## ✅ Gotowe! Teraz przetestuj

### Test 1: Uruchom Dev Server

```bash
npm run dev

# Otwórz: http://localhost:3000
```

### Test 2: Sprawdź Billing Pages

Zaloguj się i idź do:
- **Billing**: `http://localhost:3000/[slug]/billing`
- **Upgrade**: `http://localhost:3000/[slug]/billing/upgrade`

Powinieneś zobaczyć:
- ✅ Obecny plan (Starter - Trial)
- ✅ Usage stats (pracownicy, rezerwacje)
- ✅ 4 plany do wyboru (Starter, Professional, Business, Enterprise)

### Test 3: Sprawdź API

```bash
# Health check
curl http://localhost:3000/api/health | jq

# Expected:
# {
#   "status": "healthy",
#   "checks": {
#     "database": { "status": "ok" }
#   }
# }
```

---

## 🎉 Success!

**Co już działa** (bez Przelewy24):
- ✅ System subskrypcji (tworzenie, upgrade, cancel)
- ✅ Usage limiting (limity pracowników, rezerwacji)
- ✅ Feature gating (dostęp do funkcji wg planu)
- ✅ Cron jobs (sprawdzanie trials, usage reports)
- ✅ UI do zarządzania subskrypcją

**Co wymaga Przelewy24** (opcjonalne na razie):
- ⏳ Przyjmowanie płatności
- ⏳ Webhooks dla aktywacji
- ⏳ Automatyczne faktury

---

## 🔥 Bonus: Dodaj Przelewy24 Sandbox (15 min)

**Jeśli chcesz przetestować płatności**:

### 1. Zarejestruj konto sandbox

```
Idź do: https://sandbox.przelewy24.pl
Zarejestruj się (wymaga email)
```

### 2. Skopiuj credentials

Po rejestracji:
- Dashboard → Ustawienia → API
- Skopiuj:
  - Merchant ID (np. 123456)
  - POS ID (zazwyczaj taki sam)
  - CRC Key (długi string)

### 3. Dodaj do .env.local

```bash
# Dodaj na końcu pliku .env.local:
P24_MERCHANT_ID=123456
P24_POS_ID=123456
P24_CRC=paste_your_crc_here
P24_API_URL=https://sandbox.przelewy24.pl

# Wygeneruj CRON_SECRET
CRON_SECRET=$(openssl rand -hex 32)
# Lub na Windows:
CRON_SECRET=any-random-string-here-min-32-chars
```

### 4. Restart dev server

```bash
# Ctrl+C aby zatrzymać
# Potem:
npm run dev
```

### 5. Test płatności

1. Idź do `/[slug]/billing/upgrade`
2. Wybierz plan (np. Professional)
3. Kliknij "Wybierz Plan"
4. Zostaniesz przekierowany do P24 sandbox
5. Użyj testowej karty: `4444 3333 2222 1111`, CVV `123`
6. Zatwierdź płatność
7. Sprawdź logi w terminalu - webhook powinien otrzymać notyfikację

**Expected**:
```
[P24 WEBHOOK] Received notification: { sessionId: '...', orderId: 123 }
[P24 WEBHOOK] Signature verified ✓
[P24 WEBHOOK] Transaction verified ✓
[P24 WEBHOOK] Payment success handled ✓
```

---

## 🐛 Troubleshooting

### Problem: "Docker daemon not running"
**Rozwiązanie**: Uruchom Docker Desktop z menu Start

### Problem: "Failed to connect to database"
**Rozwiązanie**:
```bash
supabase stop
supabase start
```

### Problem: TypeScript errors o "subscriptions"
**Rozwiązanie**:
```bash
# Upewnij się że migracja została uruchomiona
supabase db push

# Wygeneruj typy ponownie
supabase gen types typescript --local > lib/database.types.ts

# Restart VSCode TypeScript server
# Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

### Problem: "Missing required environment variable: P24_MERCHANT_ID"
**Rozwiązanie**: To normalne - Przelewy24 jest opcjonalne. System działa bez płatności.
Jeśli chcesz testować płatności - zobacz sekcję Bonus powyżej.

---

## 📚 Dalsze Kroki

### Chcesz zobaczyć więcej?

- 📖 **Pełny przewodnik testowania**: [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md)
- 📊 **Wyniki testów**: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)
- ✅ **Co zostało zrobione**: [docs/PHASE_2_COMPLETED.md](docs/PHASE_2_COMPLETED.md)
- 🔧 **Environment setup**: [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md)

### Gotowy do production?

- ⏳ Dodaj email notifications (Resend)
- ⏳ Dodaj PDF generation (faktury)
- ⏳ Napisz testy (60% coverage)
- ⏳ Load testing (100+ concurrent users)
- ⏳ Deploy do Vercel

---

## 🎯 Checklist Sukcesu

Po ukończeniu tego przewodnika:

- [x] ✅ Supabase local działa
- [x] ✅ Migracja uruchomiona
- [x] ✅ TypeScript types wygenerowane
- [x] ✅ Dev server running
- [x] ✅ Billing pages wyświetlają się
- [x] ✅ Health check zwraca "healthy"
- [x] ⏳ Przelewy24 skonfigurowane (opcjonalne)

---

**Gratulacje! System subskrypcji działa! 🎉**

**Pytania?** Sprawdź [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) lub dokumentację poszczególnych komponentów.
