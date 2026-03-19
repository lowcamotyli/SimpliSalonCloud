# Sprint S2 — Dynamiczne Dodatki + Grupowe Przypisywanie Sprzętu

- Status: **TODO**
- Zależności: S1 (`npx tsc --noEmit` zielony)
- Szacowany czas: 2–3 sesje Claude

---

## Cel

1. **Dynamiczne Dodatki (Add-ons)** — każda usługa może mieć modyfikatory z własnym `price_delta` i `duration_delta`. Podczas rezerwacji klient/recepcjonistka wybiera checkboxami → suma aktualizuje się w czasie rzeczywistym. Eliminuje konieczność tworzenia osobnych "usług-wariacji" w bazie.

2. **Grupowe Przypisywanie Sprzętu** — dual-listbox w `Settings → Sprzęt` pozwala przypisać jeden sprzęt do dziesiątek usług jednym kliknięciem zamiast edytować każdą usługę z osobna.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/architecture/adr/004-tenant-isolation.md` | Każda nowa tabela: `salon_id` + RLS obligatoryjnie |
| `docs/architecture/data-architecture.md` | Relacje między services, equipment, bookings |
| `docs/architecture/service-architecture.md` | Thin route handlers — logika w `lib/services/` |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                                         ← view_range: tabela services + equipment
app/api/services/[id]/route.ts                            ← wzorzec CRUD usług
app/api/equipment/route.ts                                ← aktualny stan equipment API
app/(dashboard)/[slug]/services/page.tsx                  ← view_range: 1-60 (wzorzec edycji usługi)
app/(dashboard)/[slug]/settings/equipment/page.tsx        ← aktualny UI sprzętu
app/(dashboard)/[slug]/calendar/booking-dialog.tsx        ← view_range: selekcja usługi → dalej
```

---

## Scope

### Sesja 1 — Migracja SQL + API Dodatków

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Migracja: tabele `service_addons` + `booking_addons` | `supabase/migrations/20260318XXXXXX_service_addons.sql` | **Gemini** | ~50 linii SQL |
| Regeneracja typów | `types/supabase.ts` | `supabase gen types` | auto |
| CRUD endpoint dodatków | `app/api/services/[id]/addons/route.ts` | **codex-main** | ~80 |

**Kolejność:** SQL → gen types → CRUD (pipeline)

### Sesja 2 — UI Edytora Dodatków + Booking Dialog

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Komponent AddonsEditor | `components/services/addons-editor.tsx` | **codex-dad** | ~120 |
| Integracja AddonsEditor w services/page | `app/(dashboard)/[slug]/services/page.tsx` | **codex-dad** | Edit ~30 |
| Dodatki w booking-dialog (checkboxy + totals) | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | **Gemini** | Edit (460 linii) |

**Kolejność:**
```
RÓWNOLEGLE:
  codex-dad → addons-editor.tsx (bg)
  Gemini    → booking-dialog.tsx (bg)
WAIT
  codex-dad → services/page.tsx integracja (bg)   ← czeka na addons-editor
WAIT
  npx tsc --noEmit
```

### Sesja 3 — Grupowe Przypisywanie Sprzętu

| Task | Plik | Kto | Linie |
|------|------|-----|-------|
| Bulk assign endpoint | `app/api/equipment/[id]/services/route.ts` | **codex-main** | ~70 |
| Dual listbox w equipment/page | `app/(dashboard)/[slug]/settings/equipment/page.tsx` | **Gemini** | Edit (280 linii) |

**Kolejność:**
```
RÓWNOLEGLE:
  codex-main → equipment/[id]/services/route.ts (bg)
  Gemini     → equipment/page.tsx (bg)
WAIT
  npx tsc --noEmit
```

---

## Schema SQL

### Gemini → service_addons.sql

```
Generate SQL migration for SimpliSalon (Next.js + Supabase, multi-tenant).

Tables needed:

1. service_addons
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
   - service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE
   - name TEXT NOT NULL
   - duration_delta INTEGER NOT NULL DEFAULT 0  -- additional minutes
   - price_delta NUMERIC(10,2) NOT NULL DEFAULT 0  -- additional price
   - is_active BOOLEAN NOT NULL DEFAULT true
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()

2. booking_addons  -- junction: records which addons were selected per booking
   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   - booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
   - addon_id UUID NOT NULL REFERENCES service_addons(id) ON DELETE RESTRICT
   - price_at_booking NUMERIC(10,2) NOT NULL  -- snapshot of price_delta at time of booking
   - duration_at_booking INTEGER NOT NULL      -- snapshot of duration_delta

RLS on both tables:
- service_addons: SELECT/INSERT/UPDATE/DELETE WHERE salon_id = get_user_salon_id()
- booking_addons: SELECT/INSERT/DELETE via booking's salon_id check

File: supabase/migrations/20260318120000_service_addons.sql
```

---

## Prompty

### codex-main → services/[id]/addons/route.ts
```
Read app/api/services/[id]/route.ts for auth pattern. Do NOT use Gemini.
Goal: CRUD endpoint for service add-ons
File: app/api/services/[id]/addons/route.ts
Requirements:
- GET → return all active addons for the service (filter by salon_id + service_id)
- POST → create new addon (body: { name, price_delta, duration_delta })
- Auth: getAuthContext(); verify service belongs to same salon
- Return GET: { addons: ServiceAddon[] }, POST: { addon }
Done when: compiles, GET returns addons array, POST creates addon
```

### codex-dad → addons-editor.tsx
```
Read app/api/services/[id]/addons/route.ts for endpoint contract.
Goal: Create an AddonsEditor component for managing service add-ons
File: /mnt/d/SimpliSalonCLoud/components/services/addons-editor.tsx
Requirements:
- 'use client', Props: serviceId: string, salonId: string
- Fetch addons from GET /api/services/[serviceId]/addons
- Display list of addons: name, +Xmin, +PLN price_delta, delete button
- "Add addon" inline form: name input, duration_delta (minutes), price_delta (PLN)
- Submit → POST to /api/services/[serviceId]/addons → refetch list
- Use shadcn/ui Input, Button, Badge
Done when: component renders addons, add form works, no tsc errors
```

### codex-dad → services/page.tsx (integracja)
```
Read /mnt/d/SimpliSalonCLoud/components/services/addons-editor.tsx for props.
Goal: Add AddonsEditor to the service edit/detail modal in services page
File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/services/page.tsx
Constraints: do NOT break existing service CRUD; only add AddonsEditor inside edit modal/sheet
- Import AddonsEditor from @/components/services/addons-editor
- Place it in the service edit dialog/sheet below existing fields
- Pass serviceId and salonId as props
Done when: editing a service shows AddonsEditor below existing fields
```

### Gemini → booking-dialog.tsx (addons + live totals)
```
Extend the service selection step in app/(dashboard)/[slug]/calendar/booking-dialog.tsx
to show and apply service add-ons.

Types needed (paste these into prompt):
interface ServiceAddon {
  id: string
  name: string
  price_delta: number
  duration_delta: number
  is_active: boolean
}

Requirements:
- After selecting a service, fetch GET /api/services/[serviceId]/addons
- Show active addons as checkboxes below the service selector
- Selecting/deselecting addons updates state:
    totalPrice += sum of selected price_deltas
    totalDuration += sum of selected duration_deltas
- Display running total price and duration in the dialog footer/summary
- Selected addon IDs must be included in the booking POST payload as addon_ids: string[]
- Do NOT change any other dialog steps or existing booking logic

File: app/(dashboard)/[slug]/calendar/booking-dialog.tsx
```

### codex-main → equipment/[id]/services/route.ts
```
Read app/api/equipment/route.ts for auth pattern. Do NOT use Gemini.
Goal: Bulk assign/unassign services to a piece of equipment
File: app/api/equipment/[id]/services/route.ts
Requirements:
- PUT handler: body { serviceIds: string[] } — replaces the full list of services assigned to this equipment
  (DELETE existing rows for equipment_id + INSERT new ones in a transaction)
- GET handler: returns current serviceIds[] assigned to this equipment
- Auth: getAuthContext(); verify equipment belongs to same salon
Done when: PUT replaces assignment, GET returns current list, no tsc errors
```

### Gemini → equipment/page.tsx (dual listbox)
```
Extend app/(dashboard)/[slug]/settings/equipment/page.tsx to allow bulk service assignment.

Types needed:
interface Equipment { id: string; name: string; ... }
interface Service { id: string; name: string; category: string | null }

Requirements:
- Clicking on equipment → open a modal/sheet with two columns (dual listbox pattern):
    Left column: "Dostępne usługi" — services NOT yet assigned to this equipment
    Right column: "Przypisane usługi" — services currently assigned
- Checkbox-based selection in both columns + "Przypisz zaznaczone" / "Usuń zaznaczone" buttons
  OR drag-and-drop between columns (simpler: just checkboxes)
- "Zapisz" button → PUT /api/equipment/[id]/services with selected serviceIds
- Services fetched from existing /api/services endpoint
- Current assignments fetched from GET /api/equipment/[id]/services

File: app/(dashboard)/[slug]/settings/equipment/page.tsx
```

---

## Weryfikacja po każdej sesji

```bash
# Po sesji 1 (migracja):
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit

# Po sesji 2 i 3:
npx tsc --noEmit
# Sprawdź wizualnie: edycja usługi → sekcja Dodatki widoczna
# Booking dialog → po wyborze usługi pojawiają się checkboxy dodatków
```

---

## Definition of Done

- [ ] Tabele `service_addons` + `booking_addons` istnieją w DB z RLS
- [ ] Typy Supabase zregenerowane
- [ ] Edycja usługi → widoczny panel AddonsEditor
- [ ] Booking dialog → po wyborze usługi checkboxy z dodatkami, suma się aktualizuje
- [ ] Equipment settings → modal z dual listbox, Zapisz aktualizuje przypisanie
- [ ] `npx tsc --noEmit` — 0 błędów
