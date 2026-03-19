# Sprint L2-A — Treatment Records: Fundament

- Status: **DONE** (2026-03-13)
- Zależności: TC-1 (typy Supabase muszą zawierać data_category), TC-2 (consent patterns ustalone)
- Szacowany czas: 2 sesje Claude

---

## Cel

Wprowadzić domain Treatment Records od zera — schema bazy, CRUD API, feature flag i przycisk "Utwórz kartę zabiegu" w booking dialog. Bez UI przeglądania — to L2-B.

---

## Dokumenty referencyjne

| Dokument | Dlaczego |
|----------|---------|
| `docs/SS2.0/v2.0-definition.md` sekcja 3.2 (Treatment Records) | Feature spec, wymagania dostępu, flag |
| `docs/architecture/data-architecture.md` | Sensitivity tiers, AES-256-GCM pattern, RLS conventions |
| `docs/architecture/security-model.md` | RBAC dla owner/manager vs employee, getAuthContext pattern |
| `docs/architecture/bounded-contexts.md` | Treatment Records jako osobny bounded context |
| `docs/architecture/domain-map.md` | Relacje między Treatment Records a Scheduling, Client, Forms |
| `docs/architecture/multi-tenant-architecture.md` | RLS helper functions, salon_id isolation pattern |
| `docs/architecture/adr/002-domain-modules.md` | **Kluczowy ADR** — Treatment Records to nowy domain module; decyzja: `lib/treatment-records/` jako bounded module z explicit public API; nie łącz z `lib/forms/` |
| `docs/architecture/adr/004-tenant-isolation.md` | **Kluczowy ADR** — nowa tabela `treatment_records` MUSI: `salon_id NOT NULL REFERENCES salons(id)`, RLS na wszystkich operacjach, helper functions `get_user_salon_id()` / `has_any_salon_role()` |
| `docs/architecture/adr/001-modular-monolith.md` | API routes trzymaj w `app/api/treatment-records/` — nie w `lib/`; public API modułu przez `lib/treatment-records/index.ts` |
| `docs/architecture/architecture-overview.md` | Treatment Records to L2 feature — musi być za feature flagiem; L2 jest addytywne względem L1, nie zastępuje niczego; feature flag powiązany z planem Professional+ |
| `docs/architecture/service-architecture.md` | Route handler: thin — validate → call `lib/treatment-records/service.ts` → return; logika biznesowa NIE inline w routcie; handler > 80 linii = sygnał do wydzielenia |
| `docs/architecture/multi-tenant-architecture.md` | Słownik: 1 tenant = 1 salon; URL slug → salon_id mapping walidowany per request; każdy API call filtruje przez `getAuthContext().salonId` |

---

## Pliki kontekstowe (czytać na początku sesji)

```
types/supabase.ts                           ← head -100 (wzorzec istniejących tabel)
lib/supabase/get-auth-context.ts            ← sygnatura getAuthContext() — obowiązkowy w każdym API route
lib/features.ts                             ← wzorzec dodawania feature flag
lib/middleware/feature-gate.ts              ← jak działa feature gating
lib/forms/encryption.ts                     ← sygnatury encrypt/decrypt (do notatek zdrowotnych)
app/api/bookings/route.ts                   ← view_range: 1-60 — wzorzec route handlera w projekcie
components/calendar/booking-dialog.tsx      ← view_range: 1-50 — gdzie dodać przycisk
```

---

## Scope

### Sesja 1 — SQL + Feature Flag

| Task | Plik docelowy | Kto | Metoda |
|------|--------------|-----|--------|
| SQL: treatment_records table | `supabase/migrations/YYYYMMDD_treatment_records.sql` | **Gemini** | `gemini -p "..."` |
| Regenerate Supabase types | `types/supabase.ts` | Claude | bash |
| Feature flag: treatment_records | `lib/features.ts` | Claude | Edit (~5 linii) |

**Prompt Gemini dla SQL:**
```
Generate a PostgreSQL migration for Supabase.

Create table 'treatment_records' with these columns:
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id: uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- booking_id: uuid REFERENCES bookings(id) ON DELETE SET NULL
- client_id: uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE
- employee_id: uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT
- service_id: uuid REFERENCES services(id) ON DELETE SET NULL
- performed_at: timestamptz NOT NULL DEFAULT now()
- parameters: jsonb NOT NULL DEFAULT '{}'
- notes_encrypted: text (nullable — encrypted via AES-256-GCM at app layer)
- data_category: text NOT NULL DEFAULT 'general' CHECK (data_category IN ('general', 'health', 'sensitive_health'))
- created_at: timestamptz NOT NULL DEFAULT now()
- updated_at: timestamptz NOT NULL DEFAULT now()

RLS policies:
- Enable RLS on treatment_records
- SELECT: salon_id = public.get_user_salon_id() — owner, manager, employee (own records: employee_id = public.get_user_employee_id() OR has_any_salon_role(ARRAY['owner','manager']))
- INSERT: salon_id = public.get_user_salon_id() AND has_any_salon_role(ARRAY['owner','manager'])
- UPDATE: salon_id = public.get_user_salon_id() AND has_any_salon_role(ARRAY['owner','manager'])
- DELETE: salon_id = public.get_user_salon_id() AND has_salon_role('owner')

Indexes:
- (salon_id, client_id)
- (salon_id, booking_id)
- (salon_id, employee_id)
- (performed_at DESC)

Also add trigger: update updated_at on UPDATE (reuse pattern from existing tables if available).

Output ONLY valid SQL. No markdown, no explanations.
```

**Feature flag edit w `lib/features.ts`:**
```typescript
// Dodaj do istniejącej listy flag:
'treatment_records',
'treatment_photos',
'audit_trail',
```

### Sesja 2 — API Routes + Booking Dialog Button

| Task | Plik docelowy | Kto | Linie |
|------|--------------|-----|-------|
| API: GET /treatment-records + POST | `app/api/treatment-records/route.ts` | **Codex** | ~80 linii |
| API: GET/PATCH/DELETE /treatment-records/[id] | `app/api/treatment-records/[id]/route.ts` | **Codex** | ~80 linii |
| Booking dialog: "Utwórz kartę" button | `components/calendar/booking-dialog.tsx` | **Codex** | ~30 linii zmian |

**Prompt Codex dla API routes (batch):**
```
Read lib/supabase/get-auth-context.ts, lib/features.ts, lib/middleware/feature-gate.ts,
types/supabase.ts (treatment_records section) for context.
Do NOT use Gemini — write directly.

Create 2 files:

FILE 1: app/api/treatment-records/route.ts
- GET: list treatment records for salon, filter by client_id (query param), paginate (limit/offset)
  - Use getAuthContext(), check feature flag 'treatment_records'
  - Employee sees only own records (employee_id = their employee id)
  - Owner/manager sees all
- POST: create treatment record
  - Require: booking_id (optional), client_id, employee_id, service_id, performed_at, parameters, data_category
  - Only owner/manager can create (check role from JWT app_metadata)
  - Return created record
  - Return 403 if feature flag 'treatment_records' disabled

FILE 2: app/api/treatment-records/[id]/route.ts
- GET: get single record — same access rules as list
- PATCH: update parameters, notes_encrypted — only owner/manager
- DELETE: only owner, hard delete

Write both files directly.
```

**Prompt Codex dla booking dialog button:**
```
Read components/calendar/booking-dialog.tsx (first 80 lines) and
app/api/treatment-records/route.ts for context.
Do NOT use Gemini — write directly.

In components/calendar/booking-dialog.tsx, add a "Utwórz kartę zabiegu" button
that appears when booking status is 'completed'.
On click: navigate to /[slug]/clients/[clientId]/treatment-records/new?bookingId=[id]
Use Next.js router.push(). Import useRouter from 'next/navigation'.
Button should be styled as secondary variant, small size.
Only add the button — do not change any other logic.
Edit the file directly.
```

---

## Kryteria wyjścia (Definition of Done)

- [x] `supabase db push` — migracja `treatment_records` zastosowana
- [x] `supabase gen types typescript --linked` — tabela w `types/supabase.ts`
- [x] GET `/api/treatment-records` — employee widzi tylko własne, owner/manager wszystkie
- [x] POST `/api/treatment-records` — employee dostaje 403 (tylko owner/manager)
- [x] GET/PATCH/DELETE `/api/treatment-records/[id]` — action rules zgodne z RBAC
- [x] Feature flag `treatment_records=false` → wszystkie endpointy zwracają 402 (FeatureGateError)
- [x] Booking dialog (status=completed) wyświetla przycisk "Utwórz kartę zabiegu"
- [x] `npx tsc --noEmit` — 0 błędów
- [x] RLS policy na `treatment_records` — 4 policies (SELECT/INSERT/UPDATE/DELETE) w migracji
- [ ] Cross-tenant test: request z `salonId` innego salonu → empty result (RLS blokuje) — manual test

---

## Ryzyka i obejścia

| Ryzyko | Obejście |
|--------|---------|
| Gemini SQL używa funkcji RLS których nie zna | Sprawdź `head -5 migracja.sql` — jeśli nie ma `public.get_user_salon_id()` → Edit ręcznie |
| Codex nie zna employee_id helper | Dodaj w prompcie: `public.get_user_employee_id()` — helper function w DB |
| Booking dialog zbyt duży dla Codex edit | `view_range` na dialog, Codex robi minimal edit |

---

## Resume command (następna sesja)

```
Przeczytaj docs/sprints/L2-A_treatment-records-foundation.md.
Sprawdź: ls supabase/migrations/ | grep treatment_records (czy migracja jest).
Sprawdź: grep -n 'treatment_records' types/supabase.ts (czy typy zregenerowane).
Kontynuuj od pierwszego niezamkniętego task.
```
