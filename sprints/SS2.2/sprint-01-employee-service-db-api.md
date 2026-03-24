# Sprint SS2.2-01 — Employee-Service Assignment: DB + API

## Cel
Umożliwienie przypisywania konkretnych usług do konkretnych pracowników.
Aktualnie wszyscy pracownicy mogą wykonywać wszystkie usługi — brak filtrowania.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
gemini -p "Read docs/architecture/data-architecture.md and docs/architecture/multi-tenant-architecture.md. Summarize: (1) how junction/relationship tables are structured, (2) salon_id isolation requirements for new tables, (3) RLS policy pattern. Max 20 lines." --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Wzorzec nowych tabel, relacje, indeksy |
| `docs/architecture/multi-tenant-architecture.md` | Wymagania `salon_id` na każdej tabeli tenant-scoped |
| `docs/architecture/security-model.md` | Wzorzec RLS policies (`get_user_salon_id()`) |
| `docs/architecture/bounded-contexts.md` | Kontekst: "Staff & Operations" domain dla employee-service |

**Kluczowe constraints:**
- Każda nowa tabela tenant-scoped: `salon_id UUID NOT NULL`, RLS włączone, policies przez `get_user_salon_id()`
- Default-deny: bez explicit policy → brak dostępu
- Junction tables: `UNIQUE(salon_id, employee_id, service_id)` — salon_id w constraint, nie tylko w tabeli
- Booking validation: admin client wymaga ręcznego `WHERE salon_id = ?` (NIE używaj admin klienta do user-facing routes)

## Stan aktualny
- Architektura wspomina `services JSONB` na `employees` oraz `employee-service.ts` — **brak** tych elementów w bazie/kodzie
- `employees` table: brak kolumny `services` lub tabeli junction
- Booking flow: nie waliduje czy pracownik może wykonać wybraną usługę
- API `/api/services` i `/api/employees` — nie eksponują powiązań

## Zakres tego sprintu
- [ ] Migracja SQL: tabela `employee_services` (junction)
- [ ] API: `GET /api/employees/[id]/services` — lista usług pracownika
- [ ] API: `POST /api/employees/[id]/services` — przypisz usługę
- [ ] API: `DELETE /api/employees/[id]/services?serviceId=` — usuń przypisanie
- [ ] API: update `GET /api/services` — dodaj pole `assigned_employee_count`
- [ ] Walidacja w booking creation: czy pracownik może wykonać wybraną usługę

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_employee_services.sql` | CREATE | Gemini |
| `app/api/employees/[id]/services/route.ts` | CREATE | codex-main |
| `app/api/bookings/route.ts` | EDIT (walidacja) | codex-dad |
| `app/api/services/route.ts` | EDIT (employee_count) | Claude / codex-dad |

## Zależności
- **Wymaga:** nic (sprint bazowy)
- **Blokuje:** sprint-02 (UI), sprint-02 (booking calendar filter)

---

## Prompt — Gemini (SQL migration)

```bash
gemini -p "Generate SQL migration for SimpliSalonCloud (Supabase/PostgreSQL).

Create table employee_services:
- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
- employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE
- service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE
- created_at TIMESTAMPTZ DEFAULT now()
- UNIQUE(salon_id, employee_id, service_id)

Enable RLS. Add policies using get_user_salon_id():
- SELECT: salon_id = get_user_salon_id()
- INSERT: salon_id = get_user_salon_id()
- DELETE: salon_id = get_user_salon_id()

Add index on (salon_id, employee_id) and (salon_id, service_id).
Output pure SQL only." \
  --output-format text 2>/dev/null | grep -v "^Loaded" > "supabase/migrations/20260325000001_employee_services.sql"
```

---

## Prompt — codex-main (employee services API)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read app/api/services/[id]/addons/route.ts and lib/supabase/get-auth-context.ts for context on API route patterns.

Goal: Create employee-services CRUD API route.
File: app/api/employees/[id]/services/route.ts

Requirements:
- GET: return all services assigned to employee (join with services table: id, name, duration, price)
  Filter: salon_id match, employee belongs to salon
- POST body: { serviceId: string } — assign service to employee
  Validate: service exists and belongs to same salon
  Insert into employee_services(salon_id, employee_id, service_id)
  Return 409 if already assigned
- DELETE ?serviceId=: remove assignment
  Validate ownership before delete

Use getAuthContext() from lib/supabase/get-auth-context.ts.
All queries must filter by salon_id.
Explicit return types on exported functions.
Done when: file created with all three handlers."
```

---

## Prompt — codex-dad (booking validation)

```bash
DAD_PROMPT="Read app/api/bookings/route.ts and app/api/employees/[id]/services/route.ts for context.

Goal: Add employee-service assignment validation to booking creation POST handler.
File: /mnt/d/SimpliSalonCLoud/app/api/bookings/route.ts

In the POST handler, after extracting employee_id and service_id from body:
- Query employee_services WHERE salon_id=salonId AND employee_id=employeeId AND service_id=serviceId
- If employee_services table has no rows for this employee (meaning no assignments configured yet), allow the booking (backwards-compatible)
- If employee HAS assignments but this service is NOT in them, return 422 with message 'Pracownik nie wykonuje tej usługi'
- Do not change any other logic

Done when: POST /api/bookings validates employee-service assignment." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
# 1. Push migration
supabase db push

# 2. Regenerate types
supabase gen types typescript --linked > types/supabase.ts

# 3. TypeScript check
npx tsc --noEmit
```

## Done when
- `employee_services` tabela istnieje w DB
- `GET/POST/DELETE /api/employees/[id]/services` działa
- Booking z pracownikiem bez uprawnień do usługi → 422
- Booking z pracownikiem bez żadnych przypisań → nadal działa (backward compat)
- `tsc --noEmit` clean
