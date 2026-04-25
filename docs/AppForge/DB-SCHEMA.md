# AppForge — Database Schema

## Konwencja nazewnictwa tabel

| Moduł | Prefiks | Przykład |
|-------|---------|---------|
| Core | (brak) | `workspaces`, `profiles`, `audit_logs` |
| Calendar | `cal_` | `cal_bookings`, `cal_equipment` |
| Employees (HCM) | `hr_` | `hr_employees`, `hr_documents`, `hr_contracts` |
| Absence | `abs_` | `abs_requests`, `abs_types`, `abs_balances` |
| Time Tracking | `tt_` | `tt_entries`, `tt_timesheets` |
| Payroll | `pay_` | `pay_runs`, `pay_entries` |
| CRM | `crm_` | `crm_campaigns`, `crm_automations` |
| Forms | `frm_` | `frm_templates`, `frm_submissions` |

> SimpliSalonCloud legacy: istniejące tabele (`bookings`, `employees`, ...) działają bez rename.
> Nowe aplikacje używają prefiksów od początku.

## Wzorzec każdej tabeli (obowiązkowe kolumny)

```sql
CREATE TABLE {prefix}_{name} (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- ... kolumny modułu ...
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE {prefix}_{name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON {prefix}_{name}
  USING (workspace_id = get_user_workspace_id());
CREATE INDEX idx_{prefix}_{name}_workspace ON {prefix}_{name}(workspace_id);
```

## Core — tabele platformy

```sql
CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  name            text NOT NULL,
  business_profile text NOT NULL,
  plan            text NOT NULL DEFAULT 'starter',
  settings        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

-- Runtime module enablement per workspace
CREATE TABLE workspace_modules (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_id     text NOT NULL,
  enabled       boolean DEFAULT true,
  config        jsonb DEFAULT '{}',
  enabled_at    timestamptz DEFAULT now(),
  PRIMARY KEY   (workspace_id, module_id)
);
```

## HR / Employees (HCM)

```sql
CREATE TABLE hr_employees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES profiles(id),
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text,
  phone           text,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'on_leave')),
  hire_date       date,
  termination_date date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Dane wrażliwe — osobna tabela, inna RLS policy
CREATE TABLE hr_demographics (
  employee_id     uuid PRIMARY KEY REFERENCES hr_employees(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date_of_birth   date,
  nationality     text,
  address         jsonb,        -- { street, city, postal_code, country }
  emergency_contact jsonb,
  updated_at      timestamptz DEFAULT now()
);
-- RLS: has_permission('employees:view_sensitive') wymagane

CREATE TABLE hr_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  contract_type   text NOT NULL, -- 'employment' | 'b2b' | 'civil_law'
  start_date      date NOT NULL,
  end_date        date,          -- NULL = bezterminowy
  position        text NOT NULL,
  department      text,
  salary_gross    numeric(10,2),
  salary_currency text DEFAULT 'PLN',
  working_hours   numeric(4,2),  -- tygodniowo
  is_current      boolean DEFAULT true,
  signed_at       date,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE hr_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  category        text NOT NULL, -- 'id_card' | 'cv' | 'certificate' | 'contract_scan'
  name            text NOT NULL,
  storage_path    text NOT NULL, -- Supabase Storage
  expires_at      date,
  is_verified     boolean DEFAULT false,
  uploaded_at     timestamptz DEFAULT now(),
  uploaded_by     uuid REFERENCES profiles(id)
);
```

## Absence

```sql
CREATE TABLE abs_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  code            text NOT NULL,
  requires_approval boolean DEFAULT true,
  accrual_days_per_year int,   -- NULL = bez limitu
  color           text DEFAULT '#94a3b8',
  is_paid         boolean DEFAULT true
);

CREATE TABLE abs_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  absence_type_id uuid NOT NULL REFERENCES abs_types(id),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days_count      numeric(4,1) NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason          text,
  reviewed_by     uuid REFERENCES profiles(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE abs_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  absence_type_id uuid NOT NULL REFERENCES abs_types(id),
  year            int NOT NULL,
  allocated       numeric(5,1) NOT NULL DEFAULT 0,
  used            numeric(5,1) NOT NULL DEFAULT 0,
  pending         numeric(5,1) NOT NULL DEFAULT 0,
  carried_over    numeric(5,1) NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, employee_id, absence_type_id, year)
);
```

## Time Tracking

```sql
CREATE TABLE tt_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  clocked_in_at   timestamptz NOT NULL,
  clocked_out_at  timestamptz,       -- NULL = aktywna sesja
  break_minutes   int DEFAULT 0,
  notes           text,
  entry_type      text DEFAULT 'manual'
                    CHECK (entry_type IN ('clock', 'manual', 'import')),
  status          text DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     uuid REFERENCES profiles(id),
  approved_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE tt_timesheets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  total_hours     numeric(6,2),
  status          text DEFAULT 'open'
                    CHECK (status IN ('open', 'submitted', 'approved', 'locked')),
  submitted_at    timestamptz,
  approved_by     uuid REFERENCES profiles(id),
  approved_at     timestamptz,
  UNIQUE (workspace_id, employee_id, period_start)
);
```

## Po każdej migracji — obowiązkowe kroki

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```
