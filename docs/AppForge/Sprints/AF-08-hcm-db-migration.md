# Sprint AF-08 — HCM DB — Nowe tabele pracownicze

> **⚡ Dispatch równolegle z:** [AF-13](AF-13-default-theme-implementation.md)
> AF-08 (migracje DB) i AF-13 (implementacja _default theme) są całkowicie niezależne.

## Cel
(P1) Migracja SQL dla pełnego modułu HCM: tabele hr_employees, hr_demographics,
hr_contracts, hr_documents z RLS. To fundament pod AF-09 (API) i AF-10 (UI).

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md. List ALL table schemas for HR module: hr_employees, hr_demographics, hr_contracts, hr_documents — with exact column definitions, constraints, and RLS requirements. Do NOT summarize. List every column." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/DB-SCHEMA.md` | Pełne schematy SQL dla hr_* tabel, RLS wzorzec |
| `docs/AppForge/SECURITY.md` | Wrażliwe dane (hr_demographics) — osobna RLS policy z has_permission() |

**Kluczowe constraints:**
- `hr_demographics` — osobna policy: `has_permission('employees:view_sensitive')` wymagane
- `hr_employees` używa `salon_id` (NIE workspace_id — istniejąca konwencja SimpliSalon)
- `hr_documents.storage_path` — ścieżka w Supabase Storage (bucket: `employee-documents`)
- `hr_contracts.is_current` — tylko jeden aktywny kontrakt per pracownik (constraint lub trigger)
- Indeksy obowiązkowe: na salon_id każdej tabeli + na employee_id dla tabel powiązanych
- Migracje w 2 plikach (logicznie): 001 = tabele podstawowe (employees + demographics), 002 = kontrakty + dokumenty

## Work packages

- ID: pkg-migration-core | Type: migration | Worker: codex-dad
  Outputs: supabase/migrations/20260502000001_hr_employees_demographics.sql

- ID: pkg-migration-contracts | Type: migration | Worker: codex-dad
  Outputs: supabase/migrations/20260502000002_hr_contracts_documents.sql

Oba równolegle (niezależne tabele).

## Prompt — codex-dad (migration 1: employees + demographics)

```bash
DAD_PROMPT="Read .workflow/skills/sql-migration-safe.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md for exact HR table schemas.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/SECURITY.md for RLS patterns and has_permission() function.

Goal: Create SQL migration for hr_employees and hr_demographics tables.
File: /mnt/d/SimpliSalonCLoud/supabase/migrations/20260502000001_hr_employees_demographics.sql

SQL requirements:

1. CREATE TABLE hr_employees:
   id, salon_id (FK to salons), profile_id (FK to profiles, nullable),
   first_name, last_name, email (nullable), phone (nullable),
   status ('active'|'inactive'|'on_leave' CHECK), hire_date (date, nullable),
   termination_date (date, nullable), created_at, updated_at
   - RLS enabled
   - Policy 'workspace_isolation': salon_id = get_user_salon_id()
   - Indexes: (salon_id), (salon_id, status)

2. CREATE TABLE hr_demographics:
   employee_id (PK, FK to hr_employees CASCADE), salon_id (FK to salons),
   date_of_birth (date, nullable), nationality (text, nullable),
   address (jsonb nullable — { street, city, postal_code, country }),
   emergency_contact (jsonb nullable — { name, phone, relation }), updated_at
   - RLS enabled
   - Policy 'workspace_isolation': salon_id = get_user_salon_id()
   - Policy 'sensitive_access': salon_id = get_user_salon_id() AND has_permission('employees:view_sensitive')
     (this policy REPLACES workspace_isolation for SELECT — use USING clause)
   - Index: (salon_id)

Pure SQL only." bash ~/.claude/scripts/dad-exec.sh
```

## Prompt — codex-dad (migration 2: contracts + documents)

```bash
DAD_PROMPT="Read .workflow/skills/sql-migration-safe.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md for hr_contracts and hr_documents schemas.

Goal: Create SQL migration for hr_contracts and hr_documents.
File: /mnt/d/SimpliSalonCLoud/supabase/migrations/20260502000002_hr_contracts_documents.sql

SQL requirements:

1. CREATE TABLE hr_contracts:
   id, salon_id (FK salons), employee_id (FK hr_employees CASCADE),
   contract_type ('employment'|'b2b'|'civil_law'|'other' — text, no CHECK, for flexibility),
   start_date (date NOT NULL), end_date (date nullable — NULL = indefinite),
   position (text NOT NULL), department (text nullable),
   salary_gross (numeric(10,2) nullable), salary_currency (text DEFAULT 'PLN'),
   working_hours (numeric(4,2) nullable — weekly hours),
   is_current (boolean DEFAULT true), signed_at (date nullable), notes (text nullable),
   created_at timestamptz DEFAULT now()
   - RLS: salon_id = get_user_salon_id()
   - Index: (salon_id, employee_id), (salon_id, is_current)

2. CREATE TABLE hr_documents:
   id, salon_id (FK salons), employee_id (FK hr_employees CASCADE),
   category (text NOT NULL — 'id_card'|'cv'|'certificate'|'contract_scan'|'other'),
   name (text NOT NULL), storage_path (text NOT NULL),
   expires_at (date nullable), is_verified (boolean DEFAULT false),
   uploaded_at (timestamptz DEFAULT now()), uploaded_by (uuid FK profiles nullable)
   - RLS: salon_id = get_user_salon_id()
   - Index: (salon_id, employee_id), (salon_id, expires_at) — for expiry alerts

3. Create Supabase Storage bucket 'employee-documents':
   INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', false)
   ON CONFLICT DO NOTHING;
   Add RLS on storage.objects for bucket 'employee-documents':
   Policy: authenticated users can upload/read only for their workspace (use salon_id from metadata)

Pure SQL only." bash ~/.claude/scripts/dad-exec.sh
```

## Po wykonaniu

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
# Sprawdź: tabele hr_employees, hr_demographics, hr_contracts, hr_documents istnieją
# Sprawdź: SELECT na hr_demographics wymaga has_permission('employees:view_sensitive')
```

## Acceptance criteria

- [ ] Tabela `hr_employees` z RLS (salon_id isolation)
- [ ] Tabela `hr_demographics` z RLS + dodatkowa policy employees:view_sensitive
- [ ] Tabela `hr_contracts` z RLS, indeks na (salon_id, is_current)
- [ ] Tabela `hr_documents` z RLS, indeks na expires_at
- [ ] Bucket `employee-documents` w Storage (private)
- [ ] `npx tsc --noEmit` → clean po gen types
