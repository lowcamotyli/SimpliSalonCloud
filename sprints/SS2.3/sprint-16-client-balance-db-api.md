# Sprint SS2.2-16 — Client Balance & Prepayments: DB + API

## Cel
(P0) Zaprojektować i wdrożyć model salda klienta:
- przedpłata przypisana do klienta (nie do konkretnej wizyty),
- historia transakcji (wpłata, pobranie, zwrot),
- aktualne saldo dostępne z API.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. TASK: Describe booking_payments table structure, how payment amounts are stored, and whether there is any client credit/balance concept. FORMAT: Bulleted list. LIMIT: Max 20 lines.' bash ~/.claude/scripts/dad-exec.sh
```

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/multi-tenant-architecture.md. TASK: List RLS policy patterns for tables that are client-scoped (per salon + per client). FORMAT: Bulleted list. LIMIT: Max 15 lines.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Model płatności, relacje z klientami |
| `docs/architecture/multi-tenant-architecture.md` | RLS dla tabeli per-salon per-klient |
| `docs/architecture/security-model.md` | Zasady dostępu do danych finansowych |

**Kluczowe constraints:**
- Tabela `client_balance_transactions` musi mieć `salon_id` (multi-tenant)
- RLS: pracownik widzi saldo klientów swojego salonu (nie innych salonów)
- Saldo jest sumą transakcji — brak kolumny `balance` jako denormalizacji (wyliczaj z historii lub VIEW)
- Model operacyjny (nie księgowy): nie wymaga double-entry, wystarczy append-only log transakcji

## Otwarte pytania (rozstrzygnij przed dispatchem)
- Czy saldo może być ujemne? → Rekomendacja: NIE (walidacja przy debit)
- Czy Przelewy24 ma automatycznie zasilać saldo, czy tylko ręcznie recepcja dopisuje? → Etap 1: tylko ręcznie
- Czy zwrot to: zwrot na saldo (credit) czy zwrot na kartę (Przelewy24 refund)? → Etap 1: tylko zwrot na saldo

## Zakres tego sprintu

### SQL Migration
- [ ] Tabela `client_balance_transactions`:
  - `id UUID PK`
  - `salon_id UUID NOT NULL` (RLS + CASCADE)
  - `client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE`
  - `amount NUMERIC(10,2) NOT NULL` — dodatnie dla credit, ujemne dla debit/refund
  - `type TEXT NOT NULL CHECK(type IN ('deposit', 'debit', 'refund'))`
  - `booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL` — nullable
  - `description TEXT`
  - `created_by UUID REFERENCES employees(id)` — kto wykonał operację
  - `created_at TIMESTAMPTZ DEFAULT now()`
- [ ] VIEW `client_balance_summary(client_id, salon_id, balance)` — suma amount per client
- [ ] RLS: SELECT/INSERT = salon_id = get_user_salon_id(), DELETE = owner only

### API Endpoints
- [ ] `GET /api/clients/[id]/balance` — saldo + ostatnie 20 transakcji
- [ ] `POST /api/clients/[id]/balance/deposit` — body: `{ amount, description }`
- [ ] `POST /api/clients/[id]/balance/debit` — body: `{ amount, booking_id?, description }`
  - Walidacja: amount ≤ aktualne saldo (brak ujemnego salda)
- [ ] `POST /api/clients/[id]/balance/refund` — body: `{ amount, description }`

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_client_balance.sql` | CREATE | codex-dad |
| `app/api/clients/[id]/balance/route.ts` | CREATE (GET) | codex-main |
| `app/api/clients/[id]/balance/deposit/route.ts` | CREATE (POST) | codex-dad |
| `app/api/clients/[id]/balance/debit/route.ts` | CREATE (POST) | codex-dad |
| `app/api/clients/[id]/balance/refund/route.ts` | CREATE (POST) | codex-dad |

## Zależności
- **Wymaga:** nic (nowe tabele, niezależny moduł)
- **Blokuje:** sprint-17 (UI salda klienta), sprint-15 (możliwość rozliczenia przy edycji wizyty)

---

## Prompt — codex-dad (SQL migration)

```bash
DAD_PROMPT='Generate SQL migration for SimpliSalonCloud (Supabase/PostgreSQL).

Create table client_balance_transactions:
- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE
- amount NUMERIC(10,2) NOT NULL
- type TEXT NOT NULL CHECK (type IN ('"'"'deposit'"'"', '"'"'debit'"'"', '"'"'refund'"'"'))
- booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL
- description TEXT
- created_by UUID REFERENCES employees(id) ON DELETE SET NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Create view client_balance_summary AS:
  SELECT client_id, salon_id, SUM(amount) AS balance
  FROM client_balance_transactions
  GROUP BY client_id, salon_id

Enable RLS on client_balance_transactions.
Policies using get_user_salon_id():
- SELECT: salon_id = get_user_salon_id()
- INSERT: salon_id = get_user_salon_id()
- DELETE: salon_id = get_user_salon_id() (owner-only via has_salon_role in app layer)

Add indexes: (salon_id, client_id), (salon_id, created_at DESC).
Write to /mnt/d/SimpliSalonCLoud/supabase/migrations/20260410000001_client_balance.sql. Pure SQL only.' bash ~/.claude/scripts/dad-exec.sh
```

---

## Prompt — codex-main (GET balance endpoint)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox 'Read app/api/clients/route.ts and lib/supabase/get-auth-context.ts for context. Do NOT use Gemini — write directly.
Goal: Create GET /api/clients/[id]/balance — returns client balance and recent transactions.
File: app/api/clients/[id]/balance/route.ts

Steps:
1. getAuthContext() — get supabase, user, salonId
2. Verify client belongs to salonId (SELECT id FROM clients WHERE id=$1 AND salon_id=$2)
3. Query client_balance_summary view for current balance (or calculate inline if view not available)
4. Query last 20 transactions from client_balance_transactions WHERE client_id=$1 AND salon_id=$2 ORDER BY created_at DESC
5. Return { balance: number, transactions: Transaction[] }

Done when: tsc clean, returns correct data'
```

---

## Prompt — codex-dad (deposit/debit/refund endpoints)

```bash
DAD_PROMPT='Read app/api/clients/[id]/balance/route.ts (after codex-main creates it) and lib/supabase/get-auth-context.ts.
Goal: Create 3 POST endpoints for client balance operations.

Files:
- /mnt/d/SimpliSalonCLoud/app/api/clients/[id]/balance/deposit/route.ts — add credit
- /mnt/d/SimpliSalonCLoud/app/api/clients/[id]/balance/debit/route.ts — use credit  
- /mnt/d/SimpliSalonCLoud/app/api/clients/[id]/balance/refund/route.ts — return to balance

Each endpoint:
1. getAuthContext() — salonId
2. Verify client belongs to salonId
3. Validate amount > 0
4. For debit: also verify current balance >= amount (query client_balance_summary or SUM)
5. Insert into client_balance_transactions with correct type and sign:
   - deposit: amount as positive
   - debit: amount as negative
   - refund: amount as positive
6. Return { success: true, new_balance: number }

All: require auth, require salon_id isolation. Done when: tsc clean' bash ~/.claude/scripts/dad-exec.sh
```

---

## Po migracji — OBOWIĄZKOWE
```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```
