# Sprint S3 — Vouchery

- Status: **TODO**
- Zależności: S2 (`npx tsc --noEmit` zielony)
- Szacowany czas: 2–3 sesje Claude

---

## Cel

1. **Vouchery (Karty Podarunkowe)** — voucher jako odrębna wartość księgowa (nie kod rabatowy). Emisja z datą wygaśnięcia, `partial redemption` (potrącanie ACID), automatyczne wygasanie przez CRON, UI w profilu klienta i podczas rozliczania wizyty.

---

## Co świadomie NIE wchodzi do tego sprintu

- **Przedpłaty / zaliczki / zadatki online** — nie mamy jeszcze wdrożonego systemu przedpłat, więc nie planujemy teraz API, checkoutu ani logiki księgowej dla depositów.
- **Korekta raportowania skarbowego dla przedpłat** — wracamy do tego dopiero po wdrożeniu realnego flow przedpłat.
- **Integracja płatności online** — poza zakresem tego sprintu.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/architecture/adr/004-tenant-isolation.md` | Tabela `vouchers` + `voucher_transactions`: `salon_id` + RLS |
| `docs/architecture/data-architecture.md` | Transakcje ACID w Supabase — wzorzec |
| `docs/architecture/service-architecture.md` | `lib/vouchers/` jako domain module |
| `docs/architecture/event-architecture.md` | CRON mark-before-send pattern |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                                         ← view_range: bookings tabela + clients
app/api/bookings/[id]/route.ts                            ← aktualny PATCH / rozliczanie wizyty
app/(dashboard)/[slug]/clients/[id]/page.tsx              ← view_range: 1-60 — wzorzec zakładek
app/(dashboard)/[slug]/bookings/page.tsx                  ← jeśli tu jest UI rozliczenia
lib/supabase/get-auth-context.ts                          ← sygnatura getAuthContext
```

---

## Scope

### Sesja 1 — Schema DB + Core API Voucherów

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Migracja: `vouchers` + `voucher_transactions` | `supabase/migrations/20260318130000_vouchers.sql` | **Gemini** | ~60 linii SQL |
| Regeneracja typów | `types/supabase.ts` | `supabase gen types` | auto |
| List + Create vouchers | `app/api/vouchers/route.ts` | **codex-main** | ~70 |
| Get + Update single voucher | `app/api/vouchers/[id]/route.ts` | **codex-dad** | ~60 |
| Redeem (ACID potrącenie) | `app/api/vouchers/[id]/redeem/route.ts` | **Gemini** | ~120 |

**Kolejność:**
```
SQL migration (sesja pipeline)
  → gen types
  RÓWNOLEGLE:
    codex-main → vouchers/route.ts (bg)
    codex-dad  → vouchers/[id]/route.ts (bg)
    Gemini     → vouchers/[id]/redeem/route.ts (bg)
  WAIT
  npx tsc --noEmit
```

### Sesja 2 — CRON wygasania + UI w profilu klienta

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| CRON wygasania voucherów | `app/api/cron/expire-vouchers/route.ts` | **codex-main** | ~50 |
| Zakładka "Vouchery" w profilu | `app/(dashboard)/[slug]/clients/[id]/page.tsx` | **codex-dad** | Edit ~40 |

**Kolejność:**
```
RÓWNOLEGLE:
  codex-main → cron/expire-vouchers/route.ts (bg)
  codex-dad  → clients/[id]/page.tsx (bg)
WAIT
npx tsc --noEmit
```

### Sesja 3 — UI emisji + użycie podczas rozliczania wizyty

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Strona zarządzania voucherami | `app/(dashboard)/[slug]/settings/vouchers/page.tsx` | **Gemini** | ~200 linii UI |
| Przycisk "Użyj vouchera" przy rozliczaniu | `app/(dashboard)/[slug]/bookings/page.tsx` lub booking modal | **codex-dad** | Edit ~30 |

---

## Schema SQL

### Gemini → vouchers.sql

```
Generate SQL migration for SimpliSalon (multi-tenant, Supabase).

Tables needed:

1. vouchers
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
   - code TEXT NOT NULL DEFAULT upper(substring(gen_random_uuid()::text, 1, 8))
   - UNIQUE(salon_id, code)
   - initial_value NUMERIC(10,2) NOT NULL CHECK (initial_value > 0)
   - current_balance NUMERIC(10,2) NOT NULL CHECK (current_balance >= 0)
   - buyer_client_id UUID REFERENCES clients(id)
   - beneficiary_client_id UUID REFERENCES clients(id)
   - expires_at TIMESTAMPTZ NOT NULL
   - status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','used','expired'))
   - created_by UUID REFERENCES auth.users(id)
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   - updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

2. voucher_transactions
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT
   - booking_id UUID REFERENCES bookings(id)
   - amount NUMERIC(10,2) NOT NULL  -- negative = deduction, positive = top-up/refund
   - balance_after NUMERIC(10,2) NOT NULL
   - note TEXT
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()

RLS:
- vouchers: SELECT/INSERT/UPDATE WHERE salon_id = get_user_salon_id()
- voucher_transactions: SELECT via voucher's salon_id, INSERT by service role only (ACID fn)
  (no DELETE on either table — append-only transactions)

Index: vouchers(salon_id, status), vouchers(code), vouchers(expires_at, status)

File: supabase/migrations/20260318130000_vouchers.sql
```

---

## Prompty

### codex-main → vouchers/route.ts
```
Read app/api/clients/route.ts for auth pattern. Do NOT use Gemini.
Goal: List and create vouchers for a salon
File: app/api/vouchers/route.ts
Requirements:
- GET: returns vouchers for salonId (query param), filter by status if provided
  Query: SELECT * FROM vouchers WHERE salon_id = salonId ORDER BY created_at DESC
- POST: creates new voucher
  Body: { buyerClientId?, beneficiaryClientId?, initialValue: number, validityDays: number }
  expires_at = now() + validityDays * interval '1 day'
  current_balance = initialValue
- Auth: getAuthContext()
Done when: compiles, GET returns array, POST inserts and returns created voucher
```

### codex-dad → vouchers/[id]/route.ts
```
Read /mnt/d/SimpliSalonCLoud/app/api/vouchers/route.ts for auth pattern.
Goal: Get single voucher with transactions, and update (mark as expired manually)
File: /mnt/d/SimpliSalonCLoud/app/api/vouchers/[id]/route.ts
Requirements:
- GET: return voucher + its voucher_transactions (JOIN), verify salon_id match
- PATCH: only allow updating status to 'expired' (manual invalidation by owner)
- Auth: getAuthContext(); verify voucher.salon_id = salonId
Done when: GET returns voucher with transactions array, PATCH updates status
```

### Gemini → vouchers/[id]/redeem/route.ts
```
Generate a POST route handler for voucher redemption (ACID transaction).
File: app/api/vouchers/[id]/redeem/route.ts

Types needed:
interface VoucherRedeemBody {
  bookingId: string
  amount: number  // amount to deduct (must be > 0)
}

Requirements:
- POST only
- Auth: getAuthContext(); verify voucher.salon_id = salonId
- Validate: voucher must be status='active', expires_at > now(), current_balance >= 0
- If amount > current_balance: deduct current_balance (partial — use all remaining), else deduct amount
- ACID via Supabase RPC or sequential updates wrapped in error handling:
  1. UPDATE vouchers SET current_balance = current_balance - deductedAmount,
     status = CASE WHEN current_balance - deductedAmount <= 0 THEN 'used' ELSE 'active' END
     WHERE id = voucherId AND current_balance >= 0
  2. INSERT INTO voucher_transactions (voucher_id, booking_id, amount, balance_after, note)
     VALUES (id, bookingId, -deductedAmount, newBalance, 'Potrącenie za wizytę')
- Return: { deducted: number, balanceAfter: number, status: string }
- Return 409 if voucher expired/used/balance=0
```

### codex-main → cron/expire-vouchers/route.ts
```
Read app/api/cron/pre-appointment-forms/route.ts for CRON pattern. Do NOT use Gemini.
Goal: CRON job that expires overdue vouchers daily
File: app/api/cron/expire-vouchers/route.ts
Requirements:
- POST handler, verify Upstash CRON authorization header
- Query: UPDATE vouchers SET status = 'expired', current_balance = 0
         WHERE status = 'active' AND expires_at < now()
- Mark BEFORE zeroing balance (idempotent — double run = same result)
- Return: { expired: count }
Done when: compiles, runs without error on empty table
```

### Gemini → settings/vouchers/page.tsx
```
Generate a Next.js 14 'use client' page for voucher management.
File: app/(dashboard)/[slug]/settings/vouchers/page.tsx

Types needed:
interface Voucher {
  id: string
  code: string
  initial_value: number
  current_balance: number
  status: 'active' | 'used' | 'expired'
  expires_at: string
  buyer_client_id: string | null
  beneficiary_client_id: string | null
  created_at: string
}

Requirements:
- List all vouchers (GET /api/vouchers?salonId=...) with columns: code, wartość, saldo, status badge, wygasa
- Filter by status (tabs: Wszystkie / Aktywne / Wykorzystane / Wygasłe)
- "Wystaw voucher" button → modal form: wartość (PLN), ważność (dni, default 90), klient-nabywca (optional)
- Submit → POST /api/vouchers
- Click on voucher → details modal showing voucher_transactions list
- Use shadcn/ui Table, Badge, Dialog, Tabs
```

### codex-dad → clients/[id]/page.tsx (zakładka Vouchery)
```
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/page.tsx view_range 1-80.
Goal: Add "Vouchery" tab to client profile showing vouchers where they are buyer or beneficiary
File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/page.tsx
Constraints: do NOT break existing tabs
- Add tab "Vouchery"
- Fetch GET /api/vouchers?salonId=salonId&clientId=clientId
- List: code, saldo/wartość, status badge, expires_at
Done when: tab visible, shows client's vouchers (or empty state)
```

---

## Weryfikacja po każdej sesji

```bash
# Po sesji 1 (migracja):
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit

# Test redeem (curl lub supabase studio):
# 1. Utwórz voucher z balance=100
# 2. POST /api/vouchers/[id]/redeem { amount: 30 } → balance powinno być 70
# 3. POST ponownie { amount: 80 } → deduct 70 (reszta), status='used'
```

---

## Definition of Done

- [ ] Tabele `vouchers` + `voucher_transactions` z RLS
- [ ] Typy zregenerowane
- [ ] CRUD API voucherów działa (create, get, redeem z ACID)
- [ ] CRON expire-vouchers działa idempotentnie
- [ ] Profil klienta → zakładka "Vouchery"
- [ ] Strona `settings/vouchers` — lista, filtry, modal emisji
- [ ] Rozliczanie wizyty → przycisk "Użyj vouchera" widoczny gdy klient ma aktywny voucher
- [ ] `npx tsc --noEmit` — 0 błędów

---

## Follow-up po S3

- Po wdrożeniu realnych przedpłat wracamy z osobnym sprintem do:
  - logiki deposit / prepayment,
  - wpływu przedpłat na raporty,
  - decyzji księgowych wokół `pending` / `confirmed` / `completed`.
