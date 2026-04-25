# Sprint AF-09 — HCM API — CRUD dla tabel pracowniczych

> **⚡ Dispatch równolegle z:** [AF-11](AF-11-time-tracking-db-api.md)
> AF-09 (HCM API) i AF-11 (Time Tracking DB+API) nie mają zależności między sobą.

## Cel
(P1) API routes dla modułu HCM: zarządzanie pracownikami, demografią,
kontraktami i dokumentami. Wymaga AF-08 (tabele) + gen types.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/SECURITY.md. List: (1) getAuthContext() usage pattern, (2) how to check permission 'employees:view_sensitive', (3) IDOR prevention for nested resources (employee belongs to workspace). FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/SECURITY.md` | getAuthContext, permission checks, workspace isolation, IDOR |
| `docs/AppForge/DB-SCHEMA.md` | Kolumny tabel hr_*, salon_id naming |

**Kluczowe constraints:**
- `hr_demographics` GET/PATCH wymaga `has_permission('employees:view_sensitive')` — zwróć 403 bez tego
- Każdy endpoint sprawdza że `employee.salon_id = salonId` (IDOR prevention dla nested resources)
- `hr_documents` upload: presigned URL do Supabase Storage — NIE przesyłaj binarki przez API
- `hr_contracts.is_current` — przy PATCH nowego kontraktu jako current: set is_current=false na poprzednim
- Brak paginacji w pierwszej wersji — salony mają < 50 pracowników

## Zakres

| Route | Metody | Worker |
|-------|--------|--------|
| `app/api/hr/employees/route.ts` | GET (lista), POST (nowy) | codex-main |
| `app/api/hr/employees/[id]/route.ts` | GET (szczegóły), PATCH, DELETE (soft) | codex-main |
| `app/api/hr/employees/[id]/demographics/route.ts` | GET, PUT | codex-dad |
| `app/api/hr/employees/[id]/contracts/route.ts` | GET (lista), POST | codex-dad |
| `app/api/hr/employees/[id]/contracts/[contractId]/route.ts` | PATCH | codex-dad |
| `app/api/hr/employees/[id]/documents/route.ts` | GET (lista), POST (presigned URL) | codex-main |
| `app/api/hr/employees/[id]/documents/[docId]/route.ts` | DELETE | codex-main |

## Work packages

- ID: pkg-core-api | Type: implementation | Worker: codex-main
  Outputs: employees/route.ts, employees/[id]/route.ts, documents/route.ts, documents/[docId]/route.ts

- ID: pkg-sensitive-api | Type: implementation | Worker: codex-dad
  Outputs: demographics/route.ts, contracts/route.ts, contracts/[contractId]/route.ts

Oba równolegle.

## Prompt — codex-main (employees + documents API)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read lib/supabase/get-auth-context.ts for auth pattern.
Read docs/AppForge/SECURITY.md for permission checks and IDOR prevention.
Do NOT use Gemini — write directly.

Goal: Create HCM employee and document API routes.

File 1: app/api/hr/employees/route.ts
- GET: list hr_employees WHERE salon_id = salonId, order by last_name ASC
  Include: id, first_name, last_name, email, phone, status, hire_date
  Require: 'employees:view' permission
- POST: insert hr_employees, return created record
  Body: { firstName, lastName, email?, phone?, hireDate?, status? }
  Require: 'employees:manage' permission

File 2: app/api/hr/employees/[id]/route.ts
- GET: fetch hr_employees WHERE id = params.id AND salon_id = salonId (IDOR guard)
  Require: 'employees:view'
- PATCH: update hr_employees, partial update, return updated
  Require: 'employees:manage'
- DELETE: soft delete — set status='inactive', termination_date=now()
  Require: 'employees:manage'

File 3: app/api/hr/employees/[id]/documents/route.ts
- GET: list hr_documents WHERE employee_id = id AND salon_id = salonId
  Require: 'employees:view'
- POST: generate presigned upload URL for Supabase Storage (bucket: employee-documents)
  Body: { name, category, expiresAt? }
  Insert hr_documents with storage_path = presigned path
  Require: 'employees:manage'
  Use: createAdminSupabaseClient().storage.from('employee-documents').createSignedUploadUrl(path)

File 4: app/api/hr/employees/[id]/documents/[docId]/route.ts
- DELETE: delete hr_documents WHERE id = docId AND salon_id = salonId
  Also delete from storage (best-effort)
  Require: 'employees:manage'

Constraints:
- ALWAYS verify employee.salon_id = salonId before any operation (IDOR)
- Return 404 (not 403) when employee not found in this workspace
- Column mapping: firstName → first_name, lastName → last_name, hireDate → hire_date
Done when: tsc passes."
```

## Prompt — codex-dad (demographics + contracts API)

```bash
DAD_PROMPT="Read .workflow/skills/safe-sensitive-change.md and follow it.
Read /mnt/d/SimpliSalonCLoud/lib/supabase/get-auth-context.ts for auth.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/SECURITY.md for sensitive data permissions and IDOR.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md for hr_demographics and hr_contracts schema.

Goal: Create demographics and contracts API routes.

File 1: /mnt/d/SimpliSalonCLoud/app/api/hr/employees/[id]/demographics/route.ts
- GET: fetch hr_demographics WHERE employee_id = id
  IDOR: verify employee.salon_id = salonId first
  SENSITIVE: check has_permission('employees:view_sensitive') — return 403 if missing
  Return null (not 404) if no demographics yet
- PUT: upsert hr_demographics (create or update)
  SENSITIVE: require 'employees:manage_sensitive'
  Body: { dateOfBirth?, nationality?, address?, emergencyContact? }

File 2: /mnt/d/SimpliSalonCLoud/app/api/hr/employees/[id]/contracts/route.ts
- GET: list hr_contracts WHERE employee_id = id AND salon_id = salonId, order by start_date DESC
  Require: 'employees:view'
- POST: insert hr_contract
  If body.isCurrent === true: set is_current=false on all existing contracts first
  Body: { contractType, startDate, endDate?, position, department?, salaryGross?, workingHours?, isCurrent? }
  Require: 'employees:manage'

File 3: /mnt/d/SimpliSalonCLoud/app/api/hr/employees/[id]/contracts/[contractId]/route.ts
- PATCH: update hr_contracts WHERE id = contractId AND salon_id = salonId
  If body.isCurrent === true: deactivate other contracts first
  Require: 'employees:manage'

Constraints:
- ALWAYS check employee ownership before accessing nested resources
- Demographics: return {} not 404 when row missing (no demographics yet = empty form)
- has_permission() reads from JWT app_metadata.permissions array
Done when: tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Verification

```bash
npx tsc --noEmit
# Test: GET /api/hr/employees → lista pracowników salonu
# Test: GET /api/hr/employees/[id]/demographics bez view_sensitive → 403
# Test: POST /api/hr/employees/[id]/contracts z isCurrent:true → poprzedni kontrakt is_current=false
# Test: GET /api/hr/employees/[other-salon-id] → 404 (nie 200)
```

## Acceptance criteria

- [ ] CRUD `/api/hr/employees` — lista i tworzenie
- [ ] CRUD `/api/hr/employees/[id]` — szczegóły, edycja, soft delete
- [ ] `/api/hr/employees/[id]/demographics` — GET/PUT z permission gate
- [ ] `/api/hr/employees/[id]/contracts` — lista + tworzenie, is_current logic
- [ ] `/api/hr/employees/[id]/documents` — lista + presigned upload + delete
- [ ] IDOR: żaden endpoint nie zwraca danych z innego workspace
- [ ] `npx tsc --noEmit` → clean
