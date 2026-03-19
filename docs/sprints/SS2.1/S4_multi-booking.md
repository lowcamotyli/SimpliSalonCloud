# Sprint S4 — Multi-rezerwacje (Koszyk)

- Status: **TODO**
- Zależności: S2 (`npx tsc --noEmit` zielony) + **osobna gałąź `feature/multi-booking`**
- Szacowany czas: 3–5 sesji Claude
- ⚠️ **RYZYKO KRYTYCZNE** — przeprojektowanie fundamentów rezerwacji. Wymaga pełnych testów E2E przed merge do `main`.

---

## Cel

1. **Multi-rezerwacje (Visit_Group / koszyk)** — jeden modal "Nowa Wizyta" obsługuje wiele usług w jednej sesji dla tego samego klienta, także gdy usługi są wykonywane kolejno przez różne osoby. Frontend działa jak koszyk: dodajesz kolejne pozycje, sumy czasu i ceny aktualizują się na żywo. Backend wprowadza obiekt `visit_groups` jako kontener dla powiązanych `bookings`.

---

## Co świadomie NIE wchodzi do tego sprintu

- **Pule zasobów / `resource_pools`** — odkładamy jako osobny future sprint po zweryfikowaniu realnego problemu produkcyjnego.
- **Przebudowa algorytmu dostępności sprzętu** — poza zakresem tej iteracji.
- **Bulk przypisywanie usług do sprzętu** — już pokryte w `docs/sprints/SS2.1/S2_service-addons-equipment.md`.
- **Przedpłaty / płatności online** — poza zakresem multi-bookingu.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/architecture/data-architecture.md` | Relacje bookings — aktualna struktura przed zmianą |
| `docs/architecture/adr/004-tenant-isolation.md` | `visit_groups`: `salon_id` + RLS |
| `docs/architecture/adr/003-event-driven-workflows.md` | Side effects po booking → placeholder event, nie inline |
| `docs/architecture/service-architecture.md` | Logika tworzenia grupy i walidacji poza route handlerem |
| `docs/architecture/multi-tenant-architecture.md` | IDOR: weryfikuj `salon_id` w każdym query po `visit_group_id` |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                                         ← view_range: bookings tabela (pełna)
app/api/bookings/route.ts                                 ← aktualny POST tworzenia wizyty
app/api/bookings/check-availability/route.ts              ← aktualny algorytm dostępności
app/(dashboard)/[slug]/calendar/booking-dialog.tsx        ← view_range: 1-120 (cały flow)
components/calendar/                                       ← istniejące komponenty kalendarza
lib/supabase/get-auth-context.ts                          ← sygnatura
```

---

## Scope

### Sesja 1 — Schema DB

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Migracja: `visit_groups` + ALTER bookings | `supabase/migrations/20260318140000_visit_groups.sql` | **Gemini** | ~50 linii SQL |
| Regeneracja typów | `types/supabase.ts` | `supabase gen types` | auto |

### Sesja 2 — Backend Group Booking

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Nowy endpoint tworzenia grupy | `app/api/bookings/group/route.ts` | **Gemini** | ~180 linii (business logic) |
| Komponent `BookingCartItem` | `components/calendar/booking-cart-item.tsx` | **codex-main** | ~80 |

### Sesja 3 — Przepisanie Booking Dialog

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Nowy `booking-dialog` z koszykiem | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | **Gemini** | REWRITE >200 linii |

⚠️ Przed rewrite — skopiuj aktualny plik jako backup: `booking-dialog.tsx.bak`

### Sesja 4 — Stabilizacja i kompatybilność

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Backwards compatibility dla pojedynczej wizyty | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx`, `app/api/bookings/route.ts` | **codex-main** | Edit ~30 |
| Weryfikacja kolizji i odpowiedzi błędów | `app/api/bookings/group/route.ts` | **codex-main** | Edit ~20 |

---

## Schema SQL

### Gemini → visit_groups.sql

```
Generate SQL migration for SimpliSalon (multi-tenant, Supabase).

1. Create table visit_groups:
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
   - client_id UUID NOT NULL REFERENCES clients(id)
   - status TEXT NOT NULL DEFAULT 'draft'
     CHECK (status IN ('draft','confirmed','in_progress','completed','cancelled'))
   - payment_method TEXT
   - total_price NUMERIC(10,2)     -- computed/stored for reporting
   - total_duration INTEGER         -- total minutes, computed
   - notes TEXT
   - created_by UUID REFERENCES auth.users(id)
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   - updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

2. ALTER TABLE bookings:
   ADD COLUMN visit_group_id UUID REFERENCES visit_groups(id) ON DELETE SET NULL;
   -- nullable — existing bookings stay as standalone

RLS on visit_groups:
- SELECT/INSERT/UPDATE/DELETE WHERE salon_id = get_user_salon_id()

Index: visit_groups(salon_id, status), bookings(visit_group_id)

File: supabase/migrations/20260318140000_visit_groups.sql
```

---

## Prompty

### Gemini → bookings/group/route.ts

```
Generate a POST route handler for creating a group booking (visit_group with multiple bookings).
File: app/api/bookings/group/route.ts

Types needed:
interface BookingItem {
  serviceId: string
  employeeId: string
  startTime: string   // ISO datetime
  addonIds?: string[]
}
interface CreateGroupBookingBody {
  clientId: string
  salonId: string
  items: BookingItem[]  // min 1
  paymentMethod?: string
  notes?: string
}

Requirements:
- POST only
- Auth: getAuthContext(); verify salonId matches
- Validate: items.length >= 1
- Atomically in a single Supabase transaction (or sequential with rollback on error):
  1. INSERT INTO visit_groups → get groupId
  2. For each item: INSERT INTO bookings (with visit_group_id = groupId)
  3. UPDATE visit_groups SET total_price = sum(items prices), total_duration = sum(items durations)
- Return: { visitGroup, bookings[] }
- If any booking insert fails (conflict) → return 409 with { conflictingItem: index }
- TODO(INFRA-A-event-bus): emit('booking.group_created', { groupId }) — placeholder only
```

### codex-main → booking-cart-item.tsx

```
Do NOT use Gemini.
Goal: Single booking cart item component for the multi-booking dialog
File: components/calendar/booking-cart-item.tsx
Requirements:
- 'use client', Props:
    index: number
    service: { id: string; name: string; price: number; duration: number } | null
    employee: { id: string; name: string } | null
    addons: { id: string; name: string; price_delta: number; duration_delta: number }[]
    selectedAddonIds: string[]
    startTime: string
    onRemove: () => void
    onChange: (updates: Partial<CartItem>) => void
- Display: service name, employee name, start time, selected addons, subtotal (price + addon deltas)
- "Usuń" button visible when index > 0
- Use shadcn/ui Card, Badge
Done when: component renders correctly with all props, no tsc errors
```

### Gemini → booking-dialog.tsx (REWRITE — koszyk)

```
REWRITE app/(dashboard)/[slug]/calendar/booking-dialog.tsx as a multi-service cart-style booking dialog.

Types needed (paste all):
interface CartItem {
  serviceId: string | null
  employeeId: string | null
  startTime: string
  selectedAddonIds: string[]
}
interface Service { id: string; name: string; price: number; duration: number; category: string | null }
interface Employee { id: string; name: string }
interface ServiceAddon { id: string; name: string; price_delta: number; duration_delta: number }

Local component available:
import BookingCartItem from '@/components/calendar/booking-cart-item'
Props: (see above)

Requirements:
- 'use client', shadcn/ui Dialog
- Step 1: select client (existing pattern)
- Step 2: CART view
    - Shows BookingCartItem components (one per item in cart)
    - "Dodaj kolejną usługę" button appends new empty CartItem
    - Footer shows: total duration (sum), total price (sum + addons), "Zapisz wizytę" button
- Support flow: jedna wizyta, kilka usług wykonywanych kolejno, także przez różne pracownice/pracowników
- On submit → POST /api/bookings/group with { clientId, salonId, items, paymentMethod }
- If single item (no extras) → fall back to existing POST /api/bookings for backwards compatibility
- Maintain existing dialog open/close and onSuccess callback props

File: app/(dashboard)/[slug]/calendar/booking-dialog.tsx
```

---

## Backup i rollback

```bash
# Przed przepisaniem booking-dialog:
cp app/(dashboard)/[slug]/calendar/booking-dialog.tsx \
   app/(dashboard)/[slug]/calendar/booking-dialog.tsx.bak

# Rollback jeśli coś pójdzie nie tak:
cp app/(dashboard)/[slug]/calendar/booking-dialog.tsx.bak \
   app/(dashboard)/[slug]/calendar/booking-dialog.tsx
```

---

## Weryfikacja po każdej sesji

```bash
# Po migracji:
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit

# Po booking-dialog rewrite:
head -5 app/(dashboard)/[slug]/calendar/booking-dialog.tsx  # sprawdź że nie artefakt Gemini
npx tsc --noEmit

# Test manualny E2E przed merge:
# 1. Utwórz wizytę z 1 usługą → działa jak poprzednio
# 2. Utwórz wizytę z 2 usługami → obie pojawiają się w kalendarzu z poprawnym czasem
# 3. Utwórz wizytę z 2 usługami dla różnych pracowników → kolejność i przypisanie są poprawne
# 4. Rozliczenie pojedynczej wizyty nadal działa bez regresji
```

---

## Definition of Done

- [ ] Tabela `visit_groups` z RLS, `bookings.visit_group_id` nullable
- [ ] `POST /api/bookings/group` tworzy grupę atomowo
- [ ] Booking dialog — "Dodaj kolejną usługę" działa
- [ ] Każda pozycja koszyka może mieć osobną usługę, pracownika i czas startu
- [ ] Footer pokazuje sumaryczny czas i cenę
- [ ] Backwards compat: pojedyncze wizyty działają jak przed
- [ ] `npx tsc --noEmit` — 0 błędów
- [ ] E2E test przechodzi na środowisku staging
- [ ] Merge do `main` tylko po akceptacji właściciela

---

## Future Sprint

- Jeśli po wdrożeniu multi-bookingu nadal realnie blokuje nas model sprzętu, wracamy z osobnym sprintem:
  - `resource_pools`,
  - nowy algorytm dostępności,
  - ewentualna przebudowa powiązań usługa ↔ sprzęt na poziomie dostępności.
