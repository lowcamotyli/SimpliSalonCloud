# Sprint 01 – Infrastruktura Płatnicza (Przelewy24 + Portmonetka SMS)

> **Typ:** Backend + DB + Minimal Frontend  
> **Wymaga:** Sprint 00 ukończony  
> **Szacowany czas:** 2–3 tygodnie  
> **Trudność:** 5/10  
> **Priorytet:** 🔴 Krytyczny – bez cyklicznych płatności nie ma SaaS

---

## 📎 Pliki do kontekstu Gemini

> Plik sprintu + Sprint-00 + poniższe pliki = kompletny kontekst.

**Istniejące pliki do MODYFIKACJI:**
- `lib/payments/przelewy24-client.ts` – już istnieje! Sprawdź co jest zaimplementowane, dostosuj/rozszerz zamiast pisać od nowa
- `lib/payments/subscription-manager.ts` – istnieje, zawiera logikę subskrypcji; to tu prawdopodobnie dociągniesz dunning
- `app/(dashboard)/[slug]/billing/page.tsx` – istniejący UI billing (30 KB), rozszerz o faktury i portmonetkę SMS
- `app/api/payments/create-checkout/route.ts` – istniejący checkout
- `app/api/payments/cancel/route.ts` – istniejące anulowanie
- `app/api/payments/status/route.ts` – istniejący status
- `app/api/webhooks/przelewy24/route.ts` – istniejący webhook, tu dodajesz logikę dunning
- `app/api/subscriptions/[slug]/route.ts` – istniejące API subskrypcji
- `app/api/cron/process-subscriptions/route.ts` – istniejący CRON subskrypcji

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `app/api/billing/sms-topup/route.ts` ← nowy endpoint doładowania SMS
- `app/api/billing/invoices/route.ts` ← nowy endpoint faktur

**Wzorcowe pliki (tylko do odczytu, nie modyfikuj):**
- `lib/supabase/server.ts` – jak tworzyć klienta Supabase po stronie serwera
- `lib/supabase/admin.ts` – klient admin (do operacji bez RLS, np. CRON)

---

## Cel sprintu

Wdrożenie automatycznych płatności cyklicznych za subskrypcję SimpliSalon oraz portmonetki SMS (przedpłaconej). Efektem jest bezobsługowy billing: nowy salon płaci przez Przelewy24, token karty jest zapisywany, kolejne miesiące pobierane automatycznie z dunningiem (ponowne próby przy odrzuceniu karty).

---

## 1.1 Migracja bazy danych

> Plik: `supabase/migrations/20260303_billing.sql`

```sql
-- Plany subskrypcyjne (statyczne, bez tabeli)
-- basic | pro | enterprise – definiowane w kodzie jako stała

-- Subskrypcje salonów
CREATE TABLE subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id             UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  plan                 TEXT NOT NULL DEFAULT 'basic'
                         CHECK (plan IN ('basic', 'pro', 'enterprise')),
  status               TEXT NOT NULL DEFAULT 'trialing'
                         CHECK (status IN ('trialing','active','past_due','canceled')),
  p24_token            TEXT,          -- tokenizowany identyfikator karty
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  trial_ends_at        TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  dunning_attempt      INT DEFAULT 0, -- liczba nieudanych prób pobrania (maks. 3)
  next_retry_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (salon_id)
);

-- Historia faktur
CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id         UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  subscription_id  UUID REFERENCES subscriptions(id),
  amount_pln       NUMERIC(10,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed')),
  p24_order_id     TEXT,
  p24_session_id   TEXT,
  invoice_pdf_url  TEXT,
  period_start     TIMESTAMPTZ,
  period_end       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Portmonetka SMS (1:1 z salonem)
CREATE TABLE sms_wallet (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id   UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE UNIQUE,
  balance    INT  NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_wallet     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_subscription" ON subscriptions
  FOR SELECT USING (salon_id = (
    SELECT salon_id FROM employees WHERE user_id = auth.uid() 
      AND role IN ('owner','manager') LIMIT 1
  ));

CREATE POLICY "owner_read_invoices" ON invoices
  FOR SELECT USING (salon_id = (
    SELECT salon_id FROM employees WHERE user_id = auth.uid()
      AND role IN ('owner','manager') LIMIT 1
  ));

CREATE POLICY "owner_read_sms_wallet" ON sms_wallet
  FOR SELECT USING (salon_id = (
    SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1
  ));
```

---

## 1.2 Adapter Przelewy24

> Plik: `src/lib/billing/przelewy24.ts`

```typescript
const P24_BASE = process.env.P24_SANDBOX === 'true'
  ? 'https://sandbox.przelewy24.pl'
  : 'https://secure.przelewy24.pl';

export async function createP24Order(params: {
  sessionId: string;
  amount: number;        // w groszach (PLN * 100)
  description: string;
  email: string;
  urlReturn: string;
  urlStatus: string;
}): Promise<{ token: string; redirectUrl: string }> { ... }

export async function verifyP24Transaction(params: {
  sessionId: string;
  orderId: number;
  amount: number;
  currency: string;
}): Promise<boolean> { ... }

export async function tokenizeCard(sessionId: string): Promise<string> {
  // Zwraca p24Token do przyszłych obciążeń cyklicznych
  ...
}
```

---

## 1.3 API Routes

### POST `/api/billing/subscribe`

**Cel:** Inicjuje subskrypcję dla nowego salonu – tworzy rekord w `subscriptions` i przekierowuje do Przelewy24.

```typescript
// Wejście
{ plan: 'basic' | 'pro' | 'enterprise' }

// Logika:
// 1. Sprawdź czy salon ma już subscriptions (UNIQUE constraint)
// 2. Utwórz subscriptions ze status='trialing'
// 3. Wygeneruj sessionId = `sub_${salonId}_${Date.now()}`
// 4. Wywołaj createP24Order() z urlStatus='/api/billing/webhook'
// 5. Zwróć { redirectUrl }
```

---

### POST `/api/billing/webhook`

**Cel:** Obsługuje powiadomienia Przelewy24 (IPN). **Musi być publiczny (bez auth).**

```typescript
// Weryfikacja podpisu P24 przed jakąkolwiek logiką
// Przy sukcesie:
//   - Zmień invoices.status = 'paid'
//   - Zmień subscriptions.status = 'active'
//   - Zapisz p24Token (do cyklicznych obciążeń)
// Przy błędzie:
//   - invoices.status = 'failed'
//   - Uruchom dunning (dunning_attempt++, next_retry_at = now() + 3 days)
```

---

### GET `/api/billing/invoices`

```typescript
// Auth: wymagane (owner / manager)
// Zwraca listę faktur dla salon_id z sesji
// Sortowanie: created_at DESC
```

---

### POST `/api/billing/sms-topup`

```typescript
// Wejście: { packageSize: 100 | 500 | 1000 }
// Logika: 
//   Ceny: 100 SMS = 15 PLN, 500 SMS = 65 PLN, 1000 SMS = 120 PLN
//   Stwórz invoice, redirect do P24
//   Webhook przy sukcesie → sms_wallet.balance += packageSize
```

---

### POST `/api/billing/cancel`

```typescript
// Zmień subscriptions.status = 'canceled'
// current_period_end pozostaje – dostęp do końca okresu
// Brak zwrotu środków (polityka SaaS)
```

---

### CRON `/api/cron/billing-dunning`

> Dodaj do `vercel.json`: `"schedule": "0 6 * * *"` (codziennie o 6:00)

```typescript
// Pobierz wszystkie subscriptions WHERE status = 'past_due' AND next_retry_at <= now()
// Dla każdej:
//   Jeśli dunning_attempt < 3 → spróbuj obciążyć kartę p24Token (cykliczne)
//     Sukces → status = 'active', dunning_attempt = 0
//     Błąd   → dunning_attempt++, next_retry_at = now() + 3 days
//   Jeśli dunning_attempt >= 3 → status = 'canceled'
//     Wyślij email z informacją o anulowaniu
```

---

## 1.4 Maszyna stanów subskrypcji

```
trialing ──────────────────────→ active
    │                              │
    │ (brak tokenizacji)           │ (nieudana płatność)
    ↓                              ↓
  canceled               past_due (dunning 3×3dni)
                              │
                    ┌─────────┴──────────┐
                    ↓                    ↓
                  active             canceled
               (retry sukces)    (retry wyczerpany)
```

---

## 1.5 Frontend – strona `/settings/billing`

**Komponenty do stworzenia:**

| Komponent | Opis |
|---|---|
| `<SubscriptionCard>` | Aktualny plan, status (badge), daty okresu |
| `<InvoiceTable>` | Lista faktur z linkami PDF |
| `<SmsWalletCard>` | Saldo SMS, przycisk doładowania |
| `<PlanSelector>` | Modal zmiany planu (basic/pro/enterprise) |
| `<DunningBanner>` | Globalny banner przy status=`past_due` |

**`DunningBanner`** – wstrzyknąć do `src/app/(dashboard)/layout.tsx`:

```typescript
// Pokaż jeśli subscriptions.status === 'past_due'
<DunningBanner daysLeft={X} updatePaymentUrl="/settings/billing" />
```

---

## 1.6 Testowanie

### Testy jednostkowe

```typescript
// src/lib/billing/__tests__/dunning.test.ts
describe('dunning logic', () => {
  it('increments attempt and sets next_retry_at + 3 days on failure')
  it('sets status=canceled after 3 failed attempts')
  it('resets dunning_attempt to 0 on success')
  it('does not retry if status != past_due')
})
```

### Testy integracyjne (Przelewy24 Sandbox)

```bash
# Uruchom lokalnie z ngrok (webhook musi być dostępny publicznie)
ngrok http 3000

# Podstaw URL ngrok jako urlStatus w .env.local
P24_WEBHOOK_URL=https://xxxx.ngrok.io/api/billing/webhook
```

Scenariusze:
1. ✅ Płatność sukces → `invoice.status = paid`, `subscription.status = active`
2. ❌ Płatność odrzucona → `invoice.status = failed`, `dunning_attempt = 1`
3. 🔄 Ponowna próba po 3 dniach → sukces → `status = active`
4. 💳 Doładowanie SMS → `sms_wallet.balance += N`

### Manualny

- [ ] Stripe-like UI: przejść przez cały flow od rejestracji do aktywnej subskrypcji
- [ ] PDF faktury poprawnie generowany i dostępny do pobrania
- [ ] Banner `past_due` pojawia się na każdej stronie dashboardu
- [ ] Anulowanie – dostęp do końca okresu, brak dostępu po

---

## Checklist weryfikacyjna

- [ ] `subscriptions`, `invoices`, `sms_wallet` – tabele istnieją w Supabase
- [ ] RLS włączone na wszystkich nowych tabelach
- [ ] Webhook Przelewy24 weryfikuje podpis CRC przed logiką
- [ ] Dunning CRON dodany do `vercel.json` i przetestowany lokalnie
- [ ] Saldo SMS nie może spaść poniżej 0 (`CHECK balance >= 0`)
- [ ] Feature flag `billing: true` aktywowany na salonach testowych
- [ ] `npm run build` bez błędów

---

## Poprzedni / Następny sprint

⬅️ [Sprint 00 – Fundamenty](./Sprint-00-Fundamenty-i-Srodowisko.md)  
➡️ [Sprint 02 – Rezerwacja Sprzętu – Schemat DB](./Sprint-02-Equipment-DB.md)
