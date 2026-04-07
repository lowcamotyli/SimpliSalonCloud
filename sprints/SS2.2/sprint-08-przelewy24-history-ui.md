# Sprint SS2.2-08 — Przelewy24: Payment History & Booking UI Integration

## Cel
Wyświetlanie statusu płatności w widoku bookingu, historia płatności w panelu, badge na kalendarzu.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/integration-architecture.md. Summarize: how payment history is exposed to UI, what data can be shown vs hidden from P24 internals, role-based access to financial data. Max 50 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/integration-architecture.md` | Payment domain — co eksponować w UI, co ukryć (p24 internal IDs) |
| `docs/architecture/security-model.md` | Finance data: owner + manager access (nie employee) |
| `docs/architecture/bounded-contexts.md` | "Finance" context — kto ma dostęp do historii płatności |

**Kluczowe constraints:**
- Historia płatności: `finance:view` permission — manager + owner (nie employee)
- Nie eksponuj `p24_order_id`, `p24_transaction_id` na UI — tylko wewnętrzne ID systemu
- `booking_payments` JOIN `bookings` JOIN `clients` — wszystkie z tym samym `salon_id` (nie cross-tenant)
- Booking detail payment section: NIE używa admin client — normalny user supabase client z RLS

## Stan po sprint-07
- DB: `booking_payments` tabela
- API: initiate, status, webhook
- Brak: status badge w booking detail, link do płatności, historia, integracja z istniejącym booking view

## Zakres tego sprintu
- [ ] Badge statusu płatności w widoku bookingu (detail + calendar popover)
- [ ] Przycisk "Zapłać online" / "Powtórz płatność" w booking detail
- [ ] Historia płatności: `GET /api/payments/booking/history` (dla managera/ownera)
- [ ] Strona historii płatności: `app/(dashboard)/[slug]/payments/page.tsx`

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `components/bookings/payment-status-badge.tsx` | CREATE | codex-main |
| `app/api/payments/booking/history/route.ts` | CREATE | codex-main |
| `app/(dashboard)/[slug]/payments/page.tsx` | CREATE | codex-dad |
| Booking detail view | EDIT (dodaj badge + przycisk) | codex-dad |

## Zależności
- **Wymaga:** sprint-07

---

## Krok 0 — Odczyt przed dispatchem

```bash
# Znajdź główny komponent booking detail
find app components -name "*booking*detail*" -o -name "*booking-card*" | grep -v .next | grep -v node_modules | head -10
# Sprawdź nawigację — czy jest sekcja payments w sidebarze?
grep -r "payments\|płatności" app/\(dashboard\)/\[slug\]/layout.tsx components/layout/sidebar.tsx 2>/dev/null | head -5
```

---

## Prompt — codex-main (badge + history API)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read app/api/payments/booking/[bookingId]/status/route.ts for status API shape.

Goal: Create PaymentStatusBadge component and payment history API.

File 1: components/bookings/payment-status-badge.tsx
- Props: { status: 'none' | 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'; amount?: number }
- Renders a shadcn/ui Badge with color coding:
  - 'none': gray, 'Brak płatności'
  - 'pending': yellow, 'Oczekuje na płatność'
  - 'paid': green, 'Opłacono' + amount if provided (e.g. 'Opłacono 150 zł')
  - 'failed': red, 'Płatność nieudana'
  - 'refunded': blue, 'Zwrócono'
  - 'cancelled': gray, 'Anulowano'
- Import Badge from @/components/ui/badge

File 2: app/api/payments/booking/history/route.ts
GET handler:
- Auth: getAuthContext(), require owner or manager role
- Query params: ?page=1&limit=20&status= (optional filter)
- Fetch from booking_payments JOIN bookings JOIN clients (for client name/phone) WHERE salon_id=salonId
- Return: { payments: [{ id, bookingId, clientName, serviceName, amount, status, paidAt, createdAt }], total, page }
- Order by created_at DESC

Done when: badge component and history API created."
```

---

## Prompt — codex-dad (payments page + booking detail integration)

```bash
DAD_PROMPT="Read app/api/payments/booking/history/route.ts for API shape.
Read [BOOKING_DETAIL_COMPONENT] for current booking detail structure.

File 1: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/payments/page.tsx
Payments history page:
- Fetch GET /api/payments/booking/history
- Table columns: Data, Klient, Usługa, Kwota, Status, Akcje
- Status filter: select (Wszystkie / Opłacone / Oczekujące / Nieudane)
- Pagination (20 per page)
- Status rendered via PaymentStatusBadge component
- Row action: link to booking (/bookings/[bookingId])
- Owner/manager only (server-side check)
- 'Eksportuj CSV' button (optional — mark as TODO if complex)

File 2 — Edit: /mnt/d/SimpliSalonCLoud/[BOOKING_DETAIL_COMPONENT]
In booking detail view:
- Fetch GET /api/payments/booking/[bookingId]/status
- Show PaymentStatusBadge with current status
- If status='none' or 'failed': show 'Zainicjuj płatność' button (link to /bookings/[id]/payment)
- If status='pending': show 'Powtórz link do płatności' button (copies or redirects to payment_url)
- If status='paid': show payment badge only (no action button)
- Import PaymentStatusBadge from @/components/bookings/payment-status-badge

Done when: payments history page and booking detail payment section work." bash ~/.claude/scripts/dad-exec.sh
```

---

## Dodaj do nawigacji (Claude bezpośrednio — jeśli sidebar < 50 linii)

Sprawdź `components/layout/sidebar.tsx`:
- Jeśli jest sekcja Finance/Raporty: dodaj link do `/payments`
- Label: "Płatności online"
- Icon: `CreditCard` z lucide-react
- Permission: `finance:view` (manager+)

---

## Po wykonaniu

```bash
npx tsc --noEmit
```

## Done when
- `PaymentStatusBadge` renderuje wszystkie statusy
- Historia płatności dostępna na `/[slug]/payments`
- Booking detail pokazuje status płatności z akcjami
- `tsc --noEmit` clean
