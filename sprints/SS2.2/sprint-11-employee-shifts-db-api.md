# Sprint SS2.2-11 — Employee Shifts: DB + API

## Cel
Umożliwienie tworzenia konfigurowalnych zmian (shift templates) i przypisywania pracowników do zmian w konkretnych dniach.
Zmiany automatycznie definiują dostępność pracownika — booking calendar blokuje sloty poza zmianą.

## Architektura — dokumenty referencyjne

Przed dispatchem przeczytaj:
```bash
cat d:/SimpliSalonCLoud/docs/architecture/data-architecture.md \
  | gemini -p "TASK: List ALL constraints for new tables: RLS patterns, salon_id isolation, junction table conventions, time/date column types. FORMAT: Bulleted list. Do NOT summarize away exceptions." \
  --output-format text 2>/dev/null | grep -v "^Loaded"
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Wzorzec tabel, TIME vs TIMESTAMPTZ dla slotów czasowych |
| `docs/architecture/multi-tenant-architecture.md` | Wymagania salon_id na każdej tabeli tenant-scoped |
| `docs/architecture/security-model.md` | RLS policies (`get_user_salon_id()`) |

**Kluczowe constraints:**
- Każda nowa tabela tenant-scoped: `salon_id UUID NOT NULL`, RLS włączone, policies przez `get_user_salon_id()`
- Czas zmiany: `TIME` (bez strefy) — czas lokalny salonu, nie UTC
- `employee_shifts.date`: typ `DATE` — jeden rekord = jeden dzień
- Junction/assignment tables: indeksy na `(salon_id, employee_id)` i `(salon_id, date)`
- `shift_templates` referencja z `employee_shifts`: nullable (pozwala na ad-hoc zmianę bez szablonu)

## Stan aktualny
- Tab "Grafik" na stronie `/employees/[id]` → placeholder z tekstem "Zobacz grafik na liście pracowników"
- Brak tabel `shift_templates` i `employee_shifts` w bazie
- Booking flow nie sprawdza dostępności pracownika poza godzinami pracy
- Brak mechanizmu definiowania godzin pracy per pracownik per dzień

## Zakres tego sprintu

### DB
- [ ] Tabela `shift_templates` — wzorce zmian wielokrotnego użytku per salon
- [ ] Tabela `employee_shifts` — przypisania pracownik → zmiana → data

### API
- [ ] `GET /api/shift-templates` — lista szablonów salonu
- [ ] `POST /api/shift-templates` — utwórz szablon
- [ ] `PATCH /api/shift-templates/[id]` — edytuj szablon
- [ ] `DELETE /api/shift-templates/[id]` — usuń szablon
- [ ] `GET /api/employees/[id]/shifts?from=&to=` — zmiany pracownika w zakresie dat
- [ ] `POST /api/employees/[id]/shifts` — przypisz zmianę (ze szablonu lub ad-hoc)
- [ ] `DELETE /api/employees/[id]/shifts/[shiftId]` — usuń przypisanie
- [ ] Update `GET /api/employees/[id]` — dodaj `current_shift` (zmiana na dziś, jeśli istnieje)

## Schemat DB

### `shift_templates`
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
salon_id      UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
name          TEXT NOT NULL                    -- "Zmiana poranna", "Wieczorna"
start_time    TIME NOT NULL                    -- "08:00"
end_time      TIME NOT NULL                    -- "16:00"
color         TEXT DEFAULT '#3B82F6'           -- hex, do wyświetlania w UI
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMPTZ DEFAULT now()
UNIQUE(salon_id, name)
```

### `employee_shifts`
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
salon_id            UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE
shift_template_id   UUID REFERENCES shift_templates(id) ON DELETE SET NULL  -- nullable: ad-hoc shift
date                DATE NOT NULL
start_time          TIME NOT NULL
end_time            TIME NOT NULL
notes               TEXT
created_at          TIMESTAMPTZ DEFAULT now()
UNIQUE(salon_id, employee_id, date)   -- jeden pracownik = jedna zmiana dziennie
```

## Pliki do stworzenia / modyfikacji

| Plik | Akcja | Worker |
|------|-------|--------|
| `supabase/migrations/[ts]_employee_shifts_system.sql` | CREATE | Gemini |
| `app/api/shift-templates/route.ts` | CREATE | codex-main |
| `app/api/shift-templates/[id]/route.ts` | CREATE | codex-dad |
| `app/api/employees/[id]/shifts/route.ts` | CREATE | codex-dad |
| `app/api/employees/[id]/shifts/[shiftId]/route.ts` | CREATE | codex-dad |

## Zależności
- **Wymaga:** nic (sprint bazowy)
- **Blokuje:** sprint-12 (UI)

---

## Prompt — Gemini (SQL migration)

```bash
gemini -p "Generate SQL migration for SimpliSalonCloud (Supabase/PostgreSQL).

Create two tables:

1. shift_templates:
   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
   name TEXT NOT NULL
   start_time TIME NOT NULL
   end_time TIME NOT NULL
   color TEXT NOT NULL DEFAULT '#3B82F6'
   is_active BOOLEAN NOT NULL DEFAULT true
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   UNIQUE(salon_id, name)

2. employee_shifts:
   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
   salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE
   employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE
   shift_template_id UUID REFERENCES shift_templates(id) ON DELETE SET NULL
   date DATE NOT NULL
   start_time TIME NOT NULL
   end_time TIME NOT NULL
   notes TEXT
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   UNIQUE(salon_id, employee_id, date)

For both tables:
- Enable RLS
- Add SELECT policy: salon_id = get_user_salon_id()
- Add INSERT policy: salon_id = get_user_salon_id()
- Add UPDATE policy: salon_id = get_user_salon_id()
- Add DELETE policy: salon_id = get_user_salon_id()

Indexes:
- employee_shifts: (salon_id, employee_id), (salon_id, date), (salon_id, employee_id, date)
- shift_templates: (salon_id, is_active)

Output pure SQL only." \
  --output-format text 2>/dev/null | grep -v "^Loaded" > "supabase/migrations/20260416100000_employee_shifts_system.sql"
```

---

## Prompt — codex-main (shift-templates route GET/POST)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Do NOT use Gemini — write directly.

Read lib/supabase/get-auth-context.ts and app/api/services/route.ts for context on API route patterns.

Goal: Create shift templates CRUD API — collection endpoint (GET list + POST create).
File: app/api/shift-templates/route.ts

Requirements:
GET /api/shift-templates
- Auth via getAuthContext()
- Return all shift_templates WHERE salon_id = salonId AND is_active = true
- Order by start_time ASC
- Response: { templates: ShiftTemplate[] }

POST /api/shift-templates
- Auth via getAuthContext()
- Body: { name: string, start_time: string, end_time: string, color?: string }
- Validate: name non-empty, start_time < end_time (HH:MM format)
- Insert with salon_id from auth context
- Return 409 if name already exists for this salon
- Response: { template: ShiftTemplate }

TypeScript types inline (no import from types/supabase.ts yet — migration just created):
interface ShiftTemplate {
  id: string
  salon_id: string
  name: string
  start_time: string
  end_time: string
  color: string
  is_active: boolean
  created_at: string
}

Explicit return types on exported functions.
Done when: file created with GET and POST handlers."
```

---

## Prompt — codex-dad (shift-templates [id] + employee shifts routes)

```bash
DAD_PROMPT="Read app/api/shift-templates/route.ts and lib/supabase/get-auth-context.ts for context.

Goal: Create three more API route files for shift management system.
Files:
- /mnt/d/SimpliSalonCLoud/app/api/shift-templates/[id]/route.ts
- /mnt/d/SimpliSalonCLoud/app/api/employees/[id]/shifts/route.ts
- /mnt/d/SimpliSalonCLoud/app/api/employees/[id]/shifts/[shiftId]/route.ts

=== File 1: app/api/shift-templates/[id]/route.ts ===
PATCH /api/shift-templates/[id]
- Auth via getAuthContext()
- Body: { name?: string, start_time?: string, end_time?: string, color?: string, is_active?: boolean }
- Validate ownership: shift_template belongs to salonId
- Validate: if start_time or end_time provided, start_time < end_time
- Update fields provided only (partial update)
- Response: { template: ShiftTemplate }

DELETE /api/shift-templates/[id]
- Auth via getAuthContext()
- Validate ownership
- Soft delete: set is_active = false (do not hard delete — existing employee_shifts reference it)
- Response: { success: true }

=== File 2: app/api/employees/[id]/shifts/route.ts ===
GET /api/employees/[id]/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD
- Auth via getAuthContext()
- Validate employee belongs to salonId
- Query employee_shifts WHERE employee_id AND salon_id AND date BETWEEN from AND to
- Left join shift_templates to include template name + color
- Default range: current week (Monday to Sunday) if from/to not provided
- Order by date ASC
- Response: { shifts: EmployeeShift[] }

POST /api/employees/[id]/shifts
- Auth via getAuthContext()
- Body: { date: string (YYYY-MM-DD), shift_template_id?: string, start_time?: string, end_time?: string, notes?: string }
- If shift_template_id provided: load template and use its start_time/end_time (can be overridden by explicit times)
- Validate: must have either shift_template_id OR (start_time AND end_time)
- Validate: start_time < end_time
- Validate: no existing shift for this employee+date (UNIQUE constraint — return 409 with message 'Pracownik ma już zmianę w tym dniu')
- Insert into employee_shifts with salon_id from auth context
- Response: { shift: EmployeeShift }

=== File 3: app/api/employees/[id]/shifts/[shiftId]/route.ts ===
DELETE /api/employees/[id]/shifts/[shiftId]
- Auth via getAuthContext()
- Validate shift belongs to salonId AND employee_id matches param
- Hard delete
- Response: { success: true }

TypeScript types inline:
interface ShiftTemplate { id: string; salon_id: string; name: string; start_time: string; end_time: string; color: string; is_active: boolean; created_at: string }
interface EmployeeShift { id: string; salon_id: string; employee_id: string; shift_template_id: string | null; date: string; start_time: string; end_time: string; notes: string | null; created_at: string; template?: { name: string; color: string } | null }

Constraints:
- All queries must filter by salon_id (never trust only employee_id)
- Use getAuthContext() for auth — no custom auth logic
- Explicit return types on all exported functions

Done when: all three files created." bash ~/.claude/scripts/dad-exec.sh
```

---

## Po wykonaniu

```bash
# 1. Push migration — STAGING only
supabase db push --project-ref bxkxvrhspklpkkgmzcge

# 2. Regenerate types
supabase gen types typescript --linked > types/supabase.ts

# 3. TypeScript check
npx tsc --noEmit
```

## Done when
- `shift_templates` i `employee_shifts` tabele istnieją w DB (staging)
- `GET/POST /api/shift-templates` działa
- `PATCH/DELETE /api/shift-templates/[id]` działa (soft delete)
- `GET/POST /api/employees/[id]/shifts` działa z zakresem dat
- `DELETE /api/employees/[id]/shifts/[shiftId]` działa
- `tsc --noEmit` clean
