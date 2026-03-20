# Sprint S5 — Publiczne API dla multi-rezerwacji (simlisalon.pl)

- Status: **TODO**
- Zależności: S4 ukończony (`visit_groups` w DB, `POST /api/bookings/group` działa)
- Szacowany czas: 2–3 sesje Claude
- Repo salon: `d:\Karolina_Kasztelan_Salon`
- Repo backend: `d:\SimpliSalonCLoud`

---

## Cel

Rozbudować system rezerwacji online na `simlisalon.pl` o możliwość dodania wielu usług do jednej wizyty (koszyk). Klient samodzielnie kompletuje wizytę: dodaje kolejne usługi, każda z własnym pracownikiem i terminem.

---

## Architektura — jak to działa dziś

```
simlisalon.pl (Vite + React SPA)
    → /api/simpli/* (Vercel rewrite/proxy)
        → simplisaloncloud.vercel.app/api/*

Auth: X-API-Key + X-Salon-Id w każdym requeście
Dziś: POST /api/public/bookings → 1 booking
```

Pliki kluczowe:
- `d:\Karolina_Kasztelan_Salon\lib\api.ts` — wszystkie wywołania API
- `d:\Karolina_Kasztelan_Salon\lib\types.ts` — typy requestów/responsów
- `d:\Karolina_Kasztelan_Salon\components\Booking.tsx` — główny komponent rezerwacji (step machine)
- `d:\Karolina_Kasztelan_Salon\components\booking\` — ServiceSelector, EmployeeSelector, BookingCalendar, TimeSlots, ClientForm, BookingConfirmation
- `d:\SimpliSalonCLoud\app\api\public\bookings\route.ts` — wzorzec auth/rate-limit do skopiowania

---

## Scope

### Sesja 1 — Backend: `POST /api/public/bookings/group`

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Nowy endpoint publiczny dla grupy rezerwacji | `app/api/public/bookings/group/route.ts` | **Gemini** | ~200 linii |

### Sesja 2 — Frontend: typy + API client + komponent koszyka

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Typy: `GroupBookingRequest`, `CartItem` | `lib/types.ts` (edit) | **Claude** | ~15 linii |
| Funkcja `createGroupBooking` | `lib/api.ts` (edit) | **Claude** | ~10 linii |
| Komponent `CartItem.tsx` — pojedyncza pozycja koszyka | `components/booking/CartItem.tsx` | **codex-main** | ~100 linii |

### Sesja 3 — Frontend: przepisanie Booking.tsx z koszykiem

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Rewrite `Booking.tsx` z trybem koszyka | `components/Booking.tsx` | **Gemini** | REWRITE >200 linii |

---

## Schema endpointu

### `POST /api/public/bookings/group`

Auth: identycznie jak istniejące publiczne endpointy:
- `validateApiKey(request)` — z `lib/middleware/api-key-auth`
- `getSalonId(request)` — z `lib/utils/salon`
- `checkPublicApiRateLimit` — z `lib/middleware/rate-limit`
- `createAdminSupabaseClient()` — admin client (bypasses RLS)

Request body:
```typescript
interface PublicGroupBookingRequest {
  name: string          // imię i nazwisko klienta
  phone: string         // telefon (find-or-create klienta)
  email?: string
  items: Array<{
    serviceId: string
    employeeId: string
    date: string        // YYYY-MM-DD
    time: string        // HH:MM
  }>
}
```

Response `201`:
```typescript
{
  visitGroup: { id: string; status: string; total_price: number; total_duration: number }
  bookings: Array<{ id: string; status: string; booking_date: string; booking_time: string }>
}
```

Logika (wzoruj się na `app/api/public/bookings/route.ts`):
1. Rate limit → api key → salon_id (te same co w istniejącym endpoincie)
2. Validate body (min 1 item)
3. Find-or-create client po `phone` + `salon_id` (skopiuj logikę z route.ts)
4. `validateClientCanBook(phone, salonId)` — blacklist check
5. Dla każdego item: pobierz service (duration, price), sprawdź overlap pracownika, sprawdź equipment
6. Jeśli jakikolwiek konflikt → `409 { error: 'Time slot not available', conflictingItemIndex: N }`
7. INSERT `visit_groups` → get groupId
8. INSERT każdy booking z `visit_group_id = groupId` i `source: 'website'`
9. UPDATE `visit_groups` SET `total_price = sum`, `total_duration = sum`
10. Zarezerwuj equipment dla każdego bookingu (jeśli ma)
11. Return `{ visitGroup, bookings[] }`

---

## Prompty

### Gemini → `app/api/public/bookings/group/route.ts`

```
Create file app/api/public/bookings/group/route.ts in SimpliSalonCloud (Next.js 14, TypeScript).

This is a PUBLIC endpoint (no user session). Auth via API key + salon ID from headers.

Copy this exact auth pattern from app/api/public/bookings/route.ts:
- validateApiKey(request) from '@/lib/middleware/api-key-auth'
- getSalonId(request) from '@/lib/utils/salon'
- checkPublicApiRateLimit + getClientIp from '@/lib/middleware/rate-limit'
- createAdminSupabaseClient() from '@/lib/supabase/admin'
- logger from '@/lib/logger' — use [PUBLIC_GROUP_BOOKINGS] prefix
- validateClientCanBook(phone, salonId) from '@/lib/booking/validation'

Request body interface:
interface PublicGroupBookingRequest {
  name: string
  phone: string
  email?: string
  items: Array<{
    serviceId: string
    employeeId: string
    date: string   // YYYY-MM-DD
    time: string   // HH:MM
  }>
}

Logic:
1. Rate limit → validateApiKey → getSalonId (same as existing public bookings)
2. Parse + validate body (items must have length >= 1)
3. Find-or-create client by phone + salon_id (exact same logic as in route.ts: generate_client_code RPC, insert with full_name/phone/email/visit_count/client_code)
4. validateClientCanBook — return 403 if blocked
5. For each item: fetch service (duration, price, salon_id check), check employee overlap (fetch bookings for employee+date, check time conflict), check equipment via check_equipment_availability RPC if service has equipment in service_equipment table
6. If any conflict → return 409 { error: 'Time slot not available', conflictingItemIndex: index }
7. INSERT visit_groups { salon_id, client_id, status: 'confirmed', total_price: 0, total_duration: 0 }
8. INSERT each booking { salon_id, employee_id, client_id, service_id, booking_date, booking_time, duration, base_price, status: 'scheduled', source: 'website', visit_group_id }
9. INSERT equipment_bookings for each booking that has required equipment
10. UPDATE visit_groups SET total_price = sum of base_price, total_duration = sum of duration WHERE id = groupId
11. Return 201 { visitGroup: { id, status, total_price, total_duration }, bookings: [{ id, status, booking_date, booking_time }] }

Export only: export async function POST(request: NextRequest)
```

---

### codex-main → `CartItem.tsx`

```
Do NOT use Gemini — write directly.
Read components/booking/ServiceSelector.tsx for styling patterns.
Goal: Single cart item component for multi-booking flow on simlisalon.pl
File: d:\Karolina_Kasztelan_Salon\components\booking\CartItem.tsx

Props:
  index: number
  service: { id: string; name: string; duration: number; price: number } | null
  employee: { id: string; first_name: string; last_name: string } | null
  date: string | null
  time: string | null
  onRemove: () => void   // hidden when index === 0

Display:
- Card-style box with subtle border (match existing tailwind style)
- Show: "Usługa [N]" header, service name (or "Nie wybrano"), employee full name, date + time, price in PLN
- Remove button (×) top-right, hidden when index === 0
- Use framer-motion AnimatePresence for mount/unmount

Done when: component renders with all props, no tsc errors
```

---

### Gemini → Rewrite `Booking.tsx`

```
REWRITE d:\Karolina_Kasztelan_Salon\components\Booking.tsx as a multi-service cart booking flow.

Read the current file first to understand: modal open/close, step machine, existing imports.

New flow:
- STEP 1: Client fills name + phone + email (ClientForm — existing component)
- STEP 2: CART — user builds their order:
    - List of CartItems (import CartItem from './booking/CartItem')
    - For each item: ServiceSelector → EmployeeSelector → BookingCalendar → TimeSlots (sequential sub-steps per item, reuse existing components)
    - "Dodaj kolejną usługę" button — appends new empty cart item (max 5)
    - Footer: total price, total duration, "Zarezerwuj" button (active when all items are complete: service + employee + date + time)
- STEP 3: BookingConfirmation — show summary

Cart item state:
  interface CartItem {
    serviceId: string | null
    service: { id: string; name: string; duration: number; price: number } | null
    employeeId: string | null
    employee: { id: string; first_name: string; last_name: string } | null
    date: string | null
    time: string | null
    activeSubStep: 'service' | 'employee' | 'date' | 'time'
  }

On submit:
  - If cart has 1 item → POST /api/public/bookings (backwards compat, existing createBooking)
  - If cart has 2+ items → POST /api/public/bookings/group (new createGroupBooking)

Import createGroupBooking from '../lib/api'.
Import CartItem component from './booking/CartItem'.
Keep existing modal open/close behavior and all existing prop/state patterns.

File: d:\Karolina_Kasztelan_Salon\components\Booking.tsx
```

---

## Dodaj do `lib/types.ts` i `lib/api.ts`

### types.ts — dodaj na końcu:
```typescript
export interface GroupBookingItem {
  serviceId: string
  employeeId: string
  date: string
  time: string
}

export interface GroupBookingRequest {
  name: string
  phone: string
  email?: string
  items: GroupBookingItem[]
}

export interface GroupBookingResponse {
  visitGroup: {
    id: string
    status: string
    total_price: number
    total_duration: number
  }
  bookings: Array<{
    id: string
    status: string
    booking_date: string
    booking_time: string
  }>
}
```

### api.ts — dodaj funkcję:
```typescript
export async function createGroupBooking(data: GroupBookingRequest): Promise<GroupBookingResponse> {
  return fetchWithAuth<GroupBookingResponse>('/api/public/bookings/group', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
```

---

## Weryfikacja po każdej sesji

```bash
# Po sesji 1 (backend):
cd d:/SimpliSalonCLoud
npx tsc --noEmit

# Test manualny endpointu (zastąp wartości realnymi):
curl -X POST https://simplisaloncloud.vercel.app/api/public/bookings/group \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <klucz>" \
  -H "X-Salon-Id: <salon_id>" \
  -d '{"name":"Test","phone":"500000000","items":[{"serviceId":"...","employeeId":"...","date":"2026-04-01","time":"10:00"},{"serviceId":"...","employeeId":"...","date":"2026-04-01","time":"11:00"}]}'

# Po sesji 2 (typy + api.ts):
cd d:/Karolina_Kasztelan_Salon
npm run type-check

# Po sesji 3 (Booking.tsx rewrite):
npm run type-check
npm run build   # sprawdź brak błędów bundle
```

---

## Definition of Done

- [ ] `POST /api/public/bookings/group` działa z X-API-Key auth
- [ ] Klient może dodać 2+ usług w jednej rezerwacji online
- [ ] 1 usługa → stary endpoint (backwards compat)
- [ ] `npm run type-check` bez błędów w obydwu repozytoriach
- [ ] `npm run build` przechodzi w `Karolina_Kasztelan_Salon`
- [ ] Test manualny: rezerwacja 2 usług pojawia się w dashboardzie jako `visit_group`
- [ ] Deploy na Vercel (oba projekty)
