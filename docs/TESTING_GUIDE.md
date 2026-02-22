# 🧪 Testing Guide - System Subskrypcji

## Status Testowania

### ✅ Co działa (bez migracji):
- ✅ Kod kompiluje się z małymi błędami TypeScript (oczekiwane - brakuje typów z bazy)
- ✅ Wszystkie pliki utworzone poprawnie
- ✅ Struktura projektu zachowana
- ✅ Middleware i business logic gotowe

### ⏳ Co wymaga migracji bazy:
- ⏳ TypeScript types dla nowych tabel (subscriptions, invoices, etc.)
- ⏳ API endpoints (potrzebują tabel w bazie)
- ⏳ UI pages (potrzebują danych z API)
- ⏳ Cron jobs (potrzebują tabel w bazie)

---

## 📋 Krok po Kroku: Pełne Testowanie

### KROK 1: Uruchom Supabase Lokalnie

```bash
# Sprawdź czy Docker Desktop jest uruchomiony
docker --version

# Jeśli nie działa - uruchom Docker Desktop

# Start Supabase local
supabase start
```

**Oczekiwany output**:
```
Started supabase local development setup.

         API URL: http://localhost:54321
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
        anon key: eyJh...
service_role key: eyJh...
```

---

### KROK 2: Uruchom Migrację

```bash
# Push migration do local database
supabase db push
```

**Co się stanie**:
- ✅ Utworzy 5 nowych tabel (subscriptions, invoices, payment_methods, usage_tracking, feature_flags)
- ✅ Zmodyfikuje tabelę salons (dodadzą się kolumny: trial_ends_at, billing_email, tax_id)
- ✅ Utworzy funkcje SQL (generate_invoice_number, calculate_vat)
- ✅ Ustawi RLS policies
- ✅ Utworzy triggery

**Weryfikacja**:
```bash
# Sprawdź czy tabele istnieją
supabase db diff --schema public

# Lub w Supabase Studio:
# Otwórz http://localhost:54323
# Idź do Table Editor - powinieneś zobaczyć nowe tabele
```

---

### KROK 3: Wygeneruj TypeScript Types

```bash
# Generuj typy z bazy danych
supabase gen types typescript --local > lib/database.types.ts
```

**Co to zrobi**:
- ✅ Wygeneruje TypeScript definitions dla wszystkich tabel
- ✅ Naprawi większość błędów TypeScript
- ✅ Umożliwi type-safe queries

---

### KROK 4: Sprawdź TypeScript Compilation

```bash
# Sprawdź błędy TypeScript
npx tsc --noEmit

# Jeśli OK - powinno być zero errorsów (lub tylko warning)
```

---

### KROK 5: Uruchom Dev Server

```bash
npm run dev
```

**Dostępne strony**:
- http://localhost:3000/[slug]/billing - Strona billing
- http://localhost:3000/[slug]/billing/upgrade - Wybór planu

---

### KROK 6: Test API Endpoints (Lokalnie)

#### 6.1 Health Check
```bash
curl http://localhost:3000/api/health | jq
```

**Oczekiwany response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-15T...",
  "version": "0.1.0",
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 123
    },
    "redis": {
      "status": "ok",
      "responseTime": 45
    }
  },
  "uptime": 1234.56
}
```

#### 6.2 Usage Report (wymaga auth)
```bash
# Najpierw zaloguj się w przeglądarce, skopiuj cookie
curl http://localhost:3000/api/subscriptions/usage \
  -H "Cookie: sb-access-token=..." | jq
```

---

### KROK 7: Test Przelewy24 Integration (Sandbox)

#### 7.1 Zarejestruj konto sandbox
- Idź do: https://sandbox.przelewy24.pl
- Zarejestruj testowe konto
- Skopiuj credentials (Merchant ID, POS ID, CRC)

#### 7.2 Dodaj do .env.local
```bash
P24_MERCHANT_ID=123456
P24_POS_ID=123456
P24_CRC=xxxxxxxxxxxx
P24_API_URL=https://sandbox.przelewy24.pl
```

#### 7.3 Test Connection
Utwórz testowy endpoint:
```typescript
// app/api/test-p24/route.ts
import { NextResponse } from 'next/server'
import { createPrzelewy24Client } from '@/lib/payments/przelewy24-client'

export async function GET() {
  const p24 = createPrzelewy24Client()
  const isConnected = await p24.testConnection()

  return NextResponse.json({ connected: isConnected })
}
```

```bash
curl http://localhost:3000/api/test-p24
# Expected: { "connected": true }
```

---

### KROK 8: Test Checkout Flow (End-to-End)

#### 8.1 Przygotuj środowisko
1. ✅ Zaloguj się do aplikacji
2. ✅ Upewnij się że salon ma status "trialing"
3. ✅ Idź do `/[slug]/billing/upgrade`

#### 8.2 Wybierz plan
1. Kliknij przycisk "Wybierz Plan" np. dla Professional
2. Sprawdź Network tab w DevTools
3. Powinieneś zobaczyć:
   - POST request do `/api/payments/create-checkout`
   - Response z `paymentUrl`
   - Redirect do Przelewy24 sandbox

#### 8.3 Testowa płatność
W sandbox Przelewy24 użyj testowych danych:
- **Karta testowa**: `4444 3333 2222 1111`
- **CVV**: `123`
- **Data**: `12/25`
- **BLIK testowy**: `777123`

#### 8.4 Webhook verification (lokalnie z ngrok)

**Setup ngrok**:
```bash
# Zainstaluj ngrok (jeśli nie masz)
# https://ngrok.com/download

# Uruchom tunnel
ngrok http 3000

# Skopiuj URL (np. https://abc123.ngrok.io)
```

**Skonfiguruj webhook w P24**:
1. Idź do P24 Dashboard → Ustawienia → Webhooks
2. URL Status: `https://abc123.ngrok.io/api/webhooks/przelewy24`
3. Zapisz

**Test płatności**:
1. Wykonaj testową płatność
2. Sprawdź logi w terminalu
3. Powinieneś zobaczyć:
   ```
   [P24 WEBHOOK] Received notification: { sessionId: '...', orderId: 123 }
   [P24 WEBHOOK] Signature verified ✓
   [P24 WEBHOOK] Transaction verified ✓
   [P24 WEBHOOK] Payment success handled ✓
   ```

---

### KROK 9: Test Cron Jobs (Ręcznie)

#### 9.1 Process Subscriptions
```bash
# Dodaj CRON_SECRET do .env.local
CRON_SECRET=test-secret-123

# Test endpoint
curl http://localhost:3000/api/cron/process-subscriptions \
  -H "Authorization: Bearer test-secret-123" | jq
```

**Oczekiwany response**:
```json
{
  "success": true,
  "results": {
    "processed": 0,
    "expired": 0,
    "pastDue": 0,
    "downgraded": 0,
    "errors": []
  },
  "duration": 234
}
```

#### 9.2 Check Trial Expirations
```bash
curl http://localhost:3000/api/cron/check-trial-expirations \
  -H "Authorization: Bearer test-secret-123" | jq
```

---

### KROK 10: Test Usage Limiter

#### 10.1 Utwórz testowy salon ze Starter plan
```sql
-- W Supabase Studio → SQL Editor
UPDATE salons
SET subscription_plan = 'starter',
    subscription_status = 'trialing'
WHERE slug = 'your-salon-slug';

-- Dodaj feature flags
INSERT INTO feature_flags (salon_id, feature_name, enabled, limit_value)
VALUES
  ((SELECT id FROM salons WHERE slug = 'your-salon-slug'), 'max_employees', true, 2),
  ((SELECT id FROM salons WHERE slug = 'your-salon-slug'), 'max_bookings', true, 100);
```

#### 10.2 Test limitu pracowników
1. Dodaj 2 pracowników przez UI
2. Spróbuj dodać 3. pracownika
3. Powinieneś zobaczyć błąd: "Limit 2 pracowników osiągnięty"

#### 10.3 Sprawdź usage report
```bash
curl http://localhost:3000/api/subscriptions/usage \
  -H "Cookie: sb-access-token=..." | jq
```

**Expected**:
```json
{
  "success": true,
  "plan": "Starter",
  "period": "2026-02",
  "usage": {
    "employees": {
      "current": 2,
      "limit": 2,
      "percentage": 100
    },
    "bookings": {
      "current": 15,
      "limit": 100,
      "percentage": 15
    }
  },
  "exceeded": ["employees"]
}
```

---

## 🐛 Troubleshooting

### Problem: TypeScript errors o brakujących tabelach

**Rozwiązanie**:
```bash
# Upewnij się że migracja została uruchomiona
supabase db push

# Wygeneruj nowe typy
supabase gen types typescript --local > lib/database.types.ts

# Restart TypeScript server w VSCode
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

### Problem: "Missing required environment variable: P24_MERCHANT_ID"

**Rozwiązanie**:
Dodaj do `.env.local`:
```bash
P24_MERCHANT_ID=123456
P24_POS_ID=123456
P24_CRC=your_crc_key
P24_API_URL=https://sandbox.przelewy24.pl
```

### Problem: CORS error w webhook

**Rozwiązanie**:
Webhook endpoint ma `Access-Control-Allow-Origin: *` - powinno działać.
Jeśli nie - sprawdź czy ngrok tunnel działa.

### Problem: "Subscription not found" w webhook

**Rozwiązanie**:
- Sprawdź czy `p24_transaction_id` w tabeli subscriptions zgadza się z `sessionId` z notyfikacji
- Sprawdź logi: `console.log` w webhook handler

### Problem: Cron job zwraca 401 Unauthorized

**Rozwiązanie**:
Sprawdź czy header `Authorization: Bearer <CRON_SECRET>` jest poprawny.

---

## ✅ Checklist Pełnego Testowania

### Przygotowanie:
- [ ] Docker Desktop uruchomiony
- [ ] Supabase local running (`supabase start`)
- [ ] Migracja uruchomiona (`supabase db push`)
- [ ] TypeScript types wygenerowane
- [ ] .env.local skonfigurowany (wszystkie zmienne)
- [ ] Dev server running (`npm run dev`)

### API Endpoints:
- [ ] Health check działa (`/api/health`)
- [ ] Create checkout działa (`/api/payments/create-checkout`)
- [ ] Usage report działa (`/api/subscriptions/usage`)
- [ ] Webhook działa (`/api/webhooks/przelewy24`)

### UI:
- [ ] Billing page wyświetla się (`/[slug]/billing`)
- [ ] Upgrade page wyświetla wszystkie plany (`/[slug]/billing/upgrade`)
- [ ] Checkout redirect do P24 działa

### Przelewy24:
- [ ] Test connection zwraca `true`
- [ ] Testowa płatność przechodzi
- [ ] Webhook otrzymuje notyfikację
- [ ] Signature verification działa
- [ ] Subskrypcja zostaje aktywowana po płatności

### Usage Limiting:
- [ ] Limit employees działa
- [ ] Limit bookings działa (dla Starter)
- [ ] Usage report pokazuje poprawne dane

### Cron Jobs:
- [ ] Process subscriptions można wywołać ręcznie
- [ ] Check trial expirations działa
- [ ] Send usage reports działa

### Database:
- [ ] Wszystkie tabele istnieją
- [ ] RLS policies działają
- [ ] Triggery działają (auto invoice_number, sync status)
- [ ] Feature flags populate się dla nowych salonów

---

## 🚀 Gotowe do Production?

Jeśli **WSZYSTKIE** checkboxy powyżej są zaznaczone:
- ✅ System jest gotowy do testów beta
- ⏳ Przed production trzeba dodać:
  - Email notifications (Resend)
  - PDF generation (faktury)
  - Unit/Integration tests (60% coverage)
  - Load testing (100+ concurrent users)

---

**Happy Testing! 🎉**
