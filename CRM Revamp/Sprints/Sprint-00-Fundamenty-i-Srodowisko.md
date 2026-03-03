# Sprint 00 – Fundamenty, Środowisko i Konwencje

> **Typ:** Setup / Infrastruktura  
> **Blokuje:** Wszystkie kolejne sprinty  
> **Szacowany czas:** 2–3 dni  
> **Trudność:** 2/10

---

## 📎 Pliki do kontekstu Gemini

> Wklej te pliki do kontekstu **przed** opisaniem zadania. Sprint-00 jest bazą – zawsze dołączaj go do kolejnych sprintów.

**Konfiguracja projektu:**
- `vercel.json` – tu dodajesz wpisy CRON
- `middleware.ts` – tu możesz obsłużyć feature flags per request
- `.env.example` – referencja do zmiennych środowiskowych

**Supabase klienty (wzorzec dla wszystkich nowych API routes):**
- `lib/supabase/server.ts`
- `lib/supabase/client.ts`
- `lib/supabase/admin.ts`

**Istniejące migracje (żeby nie zduplikować tabel):**
- `supabase/migrations/` – przejrzyj listę plików, dołącz ostatnią migrację

**Nie istnieją jeszcze – stworzysz je w tym sprincie:**
- `src/lib/features.ts` ← nowy plik
- `src/lib/cron/guard.ts` ← nowy plik

---

## Cel sprintu

Przygotowanie stabilnego fundamentu: konwencje kodu, zmienne środowiskowe, schemat uprawnień w Supabase, feature flags i struktura folderów. Bez tego każdy kolejny sprint ryzykuje regresją z powodu niespójności konfiguracji.

---

## 0.1 Struktura folderów (konwencja)

Wszystkie nowe moduły CRM Revamp tworzyć wg poniższego wzorca:

```
src/
├── app/
│   ├── api/
│   │   ├── billing/
│   │   ├── equipment/
│   │   ├── forms/
│   │   ├── sms/
│   │   ├── cron/
│   │   └── reports/
│   ├── (dashboard)/
│   │   ├── settings/
│   │   │   ├── billing/
│   │   │   ├── equipment/
│   │   │   ├── forms/
│   │   │   └── sms/
│   │   └── clients/
│   │       └── [id]/
└── lib/
    ├── supabase/         ← klienty (server / client / admin)
    ├── features.ts       ← feature flags
    ├── sms/              ← adapter SMS (SMSAPI / BulkGate)
    ├── billing/          ← adapter Przelewy24
    └── cron/             ← helpery dla zadań cyklicznych
```

---

## 0.2 Zmienne środowiskowe – kompletna lista

Dodać do `.env.local` (dev) i Vercel Dashboard (prod) PRZED startem kolejnych sprintów:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Przelewy24
P24_MERCHANT_ID=
P24_POS_ID=
P24_CRC_KEY=
P24_SECRET=
P24_SANDBOX=true          # false na produkcji

# SMS
SMS_PROVIDER=smsapi       # smsapi | bulkgate
SMSAPI_TOKEN=
BULKGATE_APP_ID=
BULKGATE_APP_TOKEN=
SMS_SENDER_NAME=          # pole "Od" w wiadomości

# Aplikacja
APP_URL=https://your-domain.vercel.app
CRON_SECRET=              # losowy token zabezpieczający endpointy /api/cron/*
JWT_SECRET=               # do tokenów formularzy i linków potwierdzających

# Sentry (opcjonalne, zalecane)
SENTRY_DSN=
```

---

## 0.3 Migracja DB – Feature Flags i rozszerzenia

Uruchomić przez `supabase db push` lub bezpośrednio w SQL Editor Supabase:

```sql
-- Rozszerzenie do wykluczeń czasowych (Sprint 02)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Feature flags per salon
ALTER TABLE salons 
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}';

-- Przykładowe flagi (domyślnie wyłączone):
-- { "billing": false, "equipment": false, "medical_forms": false,
--   "sms_chat": false, "blacklist": false, "surveys": false }

COMMENT ON COLUMN salons.features IS 
  'Feature flags: billing, equipment, medical_forms, sms_chat, blacklist, surveys';
```

---

## 0.4 Helper – Feature Flags (TypeScript)

Utworzyć plik `src/lib/features.ts`:

```typescript
export type FeatureFlag =
  | 'billing'
  | 'equipment'
  | 'medical_forms'
  | 'sms_chat'
  | 'blacklist'
  | 'surveys';

export function hasFeature(
  salonFeatures: Record<string, boolean> | null | undefined,
  feature: FeatureFlag
): boolean {
  return salonFeatures?.[feature] === true;
}

// Aktywacja flagi (wywołać z panelu super-admina lub migracji)
// UPDATE salons SET features = features || '{"billing": true}' WHERE id = $salonId;
```

---

## 0.5 Zabezpieczenie endpointów CRON

Każdy endpoint `/api/cron/*` musi weryfikować nagłówek:

```typescript
// src/lib/cron/guard.ts
import { NextRequest } from 'next/server';

export function validateCronRequest(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret');
  return secret === process.env.CRON_SECRET;
}

// Użycie w handlerze:
// if (!validateCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

Konfiguracja w `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/reminders",        "schedule": "*/15 * * * *" },
    { "path": "/api/cron/blacklist-scoring", "schedule": "0 2 * * *" },
    { "path": "/api/cron/surveys",           "schedule": "*/30 * * * *" }
  ]
}
```

---

## 0.6 Supabase RLS – polityki dla nowych tabel

Wzorzec RLS do stosowania we wszystkich nowych tabelach (przykład):

```sql
-- Włącz RLS
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Odczyt tylko dla pracowników danego salonu
CREATE POLICY "salon_members_read" ON equipment
  FOR SELECT USING (
    salon_id = (
      SELECT salon_id FROM employees WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Zapis tylko dla właścicieli i managerów
CREATE POLICY "salon_owners_write" ON equipment
  FOR ALL USING (
    salon_id = (
      SELECT salon_id FROM employees 
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
      LIMIT 1
    )
  );
```

> Ten wzorzec powtarzać dla każdej nowej tabeli w kolejnych sprintach.

---

## 0.7 Sentry – inicjalizacja

Jeśli Sentry nie jest skonfigurowany, uruchomić:

```bash
npx @sentry/wizard@latest -i nextjs
```

Każdy nowy handler API powinien zawierać:

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  // logika
} catch (err) {
  Sentry.captureException(err, { extra: { salonId, context: 'billing/subscribe' } });
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
```

---

## Checklist weryfikacyjna sprintu

- [ ] Wszystkie zmienne środowiskowe dodane do Vercel i `.env.local`
- [ ] `btree_gist` aktywne w Supabase (`SELECT * FROM pg_extension WHERE extname = 'btree_gist'`)
- [ ] Kolumna `features JSONB` istnieje w tabeli `salons`
- [ ] Plik `src/lib/features.ts` stworzony i zaimportowany w `src/middleware.ts` (opcjonalnie)
- [ ] Plik `vercel.json` z definicją CRON jobs
- [ ] `validateCronRequest` stworzone i przetestowane lokalnie (`curl -H "x-cron-secret: ..." /api/cron/reminders`)
- [ ] `npm run build` bez błędów TypeScript
- [ ] Sentry DSN skonfigurowany i testowy błąd widoczny w dashboardzie

---

## Następny sprint

➡️ [Sprint 01 – Infrastruktura Płatnicza Przelewy24](./Sprint-01-Billing-Przelewy24.md)
