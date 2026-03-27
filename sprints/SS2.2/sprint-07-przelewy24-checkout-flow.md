# Sprint SS2.2-07 — Przelewy24: Checkout Flow

## Cel
Implementacja frontendu płatności online przez Przelewy24 — inicjowanie płatności z poziomu bookingu oraz obsługa statusu po powrocie.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/integration-architecture.md and docs/architecture/data-architecture.md. Summarize: (1) Przelewy24 integration constraints (CRC verification, session ID routing), (2) how payment transactions should be modeled in DB (tenant isolation), (3) webhook handler security requirements. Max 100 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/integration-architecture.md` | Przelewy24 adapter pattern, CRC signature verification, session ID prefix routing (`sub_`, `sms_`, nowy: `p24_`), webhook security |
| `docs/architecture/data-architecture.md` | Wzorzec tabeli płatności, relacje z `bookings`, tenant isolation |
| `docs/architecture/security-model.md` | Webhook auth (nie używa JWT — CRC zamiast), admin client constraints |
| `docs/architecture/multi-tenant-architecture.md` | `salon_id` na `booking_payments`, webhook nie ma sesji usera — wymaga admin client + ręczny WHERE |

**Kluczowe constraints:**
- **CRC verification obowiązkowa** w webhook — nie pomijaj, P24 wymóg bezpieczeństwa
- `amount` **zawsze z DB** (booking.base_price) — nigdy z body requestu (IDOR protection)
- Webhook handler używa **admin client** — każde query z `WHERE salon_id = ?` (RLS bypass → ręczny filter)
- Session ID: `p24_` + UUID — spójne z konwencją `sub_`, `sms_`
- `booking_payments` tabela: `salon_id` wymagany, RLS włączone
- Webhook: jeden endpoint dla wszystkich typów płatności — routing po prefix session_id

## Stan aktualny
- `lib/payments/przelewy24-client.ts` — klient API P24 istnieje
- `app/api/billing/` — obsługuje subskrypcje i doładowania SMS (inny flow)
- Brak: inicjowanie płatności za usługi, checkout page, status tracking dla bookingów
- Architektura: session ID prefix `p24_` dla płatności za usługi (analogia do `sub_`, `sms_`)
- Webhook CRC weryfikacja jest już zaimplementowana (sprawdź w istniejącym kodzie)

## Zakres tego sprintu
- [ ] Migracja SQL: tabela `booking_payments` (salon_id, booking_id, amount, status, p24_session_id, p24_order_id)
- [ ] API: `POST /api/payments/booking/initiate` — tworzy sesję P24, zwraca redirect URL
- [ ] API: `GET /api/payments/booking/[bookingId]/status` — aktualny status płatności
- [ ] Extend webhook: `app/api/billing/webhook/route.ts` — obsłuż `p24_` prefix session → update booking_payments
- [ ] Strona checkout: `app/(dashboard)/[slug]/bookings/[id]/payment/page.tsx`

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_booking_payments.sql` | CREATE | Gemini |
| `app/api/payments/booking/initiate/route.ts` | CREATE | codex-main |
| `app/api/payments/booking/[bookingId]/status/route.ts` | CREATE | codex-dad |
| `app/(dashboard)/[slug]/bookings/[id]/payment/page.tsx` | CREATE | codex-dad |
| `app/api/billing/webhook/route.ts` | EDIT (extend) | codex-dad |

## Zależności
- **Wymaga:** nic (sprint niezależny, ale logicznie po sprint-01/02)
- **Blokuje:** sprint-08 (payment history UI)

---

## Krok 0 — Odczyt przed dispatchem

```bash
gemini -p "Read lib/payments/przelewy24-client.ts. Show: available methods, request/response shapes, how CRC is verified, what env vars are used. Max 25 lines." --output-format text 2>/dev/null | grep -v "^Loaded"

gemini -p "Read app/api/billing/webhook/route.ts. Show: how session_id prefix routing works, what session types are handled. Max 20 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

---

## Prompt — Gemini (SQL migration)

```bash
gemini -p "Generate SQL migration for SimpliSalonCloud (Supabase/PostgreSQL).

Table booking_payments:
- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
- amount NUMERIC(10,2) NOT NULL
- currency TEXT NOT NULL DEFAULT 'PLN'
- status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled'))
- p24_session_id TEXT UNIQUE (our session ID, prefix p24_)
- p24_order_id TEXT (Przelewy24 order ID after registration)
- p24_transaction_id TEXT (Przelewy24 transaction ID after payment)
- payment_url TEXT (redirect URL for client)
- paid_at TIMESTAMPTZ
- created_at TIMESTAMPTZ DEFAULT now()
- updated_at TIMESTAMPTZ DEFAULT now()

Enable RLS. Policies using get_user_salon_id():
- SELECT: salon_id = get_user_salon_id()
- INSERT: salon_id = get_user_salon_id()
- UPDATE: salon_id = get_user_salon_id()

Add index on (salon_id, booking_id) and p24_session_id.
Output pure SQL only." \
  --output-format text 2>/dev/null | grep -v "^Loaded" > "supabase/migrations/20260325000003_booking_payments.sql"
```

---

## Prompt — codex-main (payment initiate API)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read lib/payments/przelewy24-client.ts for P24 client API.
Read lib/supabase/get-auth-context.ts for auth pattern.
Read app/api/billing/route.ts for reference on how session IDs are built.

Goal: Create booking payment initiation endpoint.
File: app/api/payments/booking/initiate/route.ts

POST handler:
- Body: { bookingId: string; returnUrl: string }
- Auth: getAuthContext() → salonId
- Fetch booking by id + salon_id (validate ownership + get amount/client info)
- Generate session_id: 'p24_' + randomUUID()
- Call Przelewy24 client to register transaction:
  sessionId: session_id,
  amount: booking.base_price (in grosze: multiply by 100),
  currency: 'PLN',
  description: 'Wizyta #' + booking.id.slice(0,8),
  email: client email (fetch from clients table),
  returnUrl: returnUrl + '?session=' + session_id,
  notifyUrl: process.env.NEXT_PUBLIC_APP_URL + '/api/billing/webhook'
- Insert into booking_payments: { salon_id, booking_id, amount, p24_session_id, p24_order_id, payment_url, status: 'pending' }
- Return { paymentUrl, sessionId }

Done when: POST creates payment record and returns redirect URL."
```

---

## Prompt — codex-dad (status API + checkout page + webhook)

```bash
DAD_PROMPT="Read lib/payments/przelewy24-client.ts, app/api/billing/webhook/route.ts, and app/(dashboard)/[slug]/bookings/[id]/page.tsx.

File 1: /mnt/d/SimpliSalonCLoud/app/api/payments/booking/[bookingId]/status/route.ts
GET handler:
- Auth: getAuthContext()
- Fetch from booking_payments WHERE booking_id=bookingId AND salon_id=salonId ORDER BY created_at DESC LIMIT 1
- Return { status, amount, paidAt, paymentUrl } or { status: 'none' } if no record
- Do not expose p24 internal IDs

File 2: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/bookings/[id]/payment/page.tsx
Checkout page:
- Server component, fetch booking and latest booking_payment for this booking
- If status='paid': show success state (green check, 'Płatność zakończona', amount, date)
- If status='pending': show 'Przejdź do płatności' button (link to payment_url)
- If status='failed'/'cancelled': show error state + 'Spróbuj ponownie' button (calls initiate again)
- If status='none': 'Zainicjuj płatność' button
- Show booking summary (service, date, time, employee, amount)

File 3 — Edit: /mnt/d/SimpliSalonCLoud/app/api/billing/webhook/route.ts
Add handling for p24_ prefix sessions:
- If session_id starts with 'p24_': verify P24 transaction (use przelewy24 client verify method)
- On success: UPDATE booking_payments SET status='paid', p24_transaction_id=transactionId, paid_at=now() WHERE p24_session_id=sessionId
- On failure: UPDATE booking_payments SET status='failed' WHERE p24_session_id=sessionId
- Do not change existing sub_ and sms_ handling

Done when: all three files created/updated." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
supabase db push --project-ref bxkxvrhspklpkkgmzcge  # STAGING only
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```

## Done when
- `booking_payments` tabela w DB
- `POST /api/payments/booking/initiate` tworzy sesję P24 i zwraca URL
- Checkout page pokazuje stan płatności
- Webhook obsługuje `p24_` prefix
- `tsc --noEmit` clean

## Uwagi bezpieczeństwa
- CRC weryfikacja w webhook — nie pomijaj (P24 requirement)
- `amount` zawsze pobierz z DB (booking.base_price), nigdy z body requestu
- Webhook używa admin client (nie user session) — każde query musi mieć `WHERE salon_id`
