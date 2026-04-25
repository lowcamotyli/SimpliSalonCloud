# FlowsForge Platform — Design Document

**Status:** Draft v0.1  
**Autor:** Bartosz / FlowsForge  
**Data:** 2026-04-25  
**Kontekst:** Przekształcenie SimpliSalonCloud w platformę modularną do budowania vertical SaaS aplikacji

---

## 1. Wizja i Zasady

### Wizja

Platforma pozwala zbudować nową vertical SaaS aplikację przez:
1. Wybór modułów domenowych (kreator/workbook)
2. Konfigurację pod konkretny profil biznesowy
3. Wybór zestawu komponentów UI (dostarczonego zewnętrznie)
4. Deployment gotowego produktu

Czas od "nowy pomysł" do "działający MVP" — godziny, nie tygodnie.

### Zasady projektowe (Non-Negotiable)

| Zasada | Co oznacza w praktyce |
|--------|-----------------------|
| **Workspace isolation first** | Każde zapytanie do DB MUSI filtrować po `workspace_id`. Brak wyjątków. |
| **Module encapsulation** | Moduł nie zna wewnętrzności innych modułów. Komunikacja wyłącznie przez Public API lub Events. |
| **Security by default** | Auth check w każdym API route. RLS na każdej tabeli. Moduł wyłączony = 404. |
| **Theme transparency** | Każdy komponent UI w module używa Component Registry. Zero hardcoded shadcn imports w logice domenowej. |
| **Type safety end-to-end** | TypeScript strict. Kontrakty między modułami definiowane jako typy TS + Zod schemas. |
| **Configuration over code** | Nowa aplikacja = nowy `app-config.ts`, nie przepisany kod. |

---

## 2. Architektura warstwowa

```
┌─────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER                          │
│                                                                  │
│   SimpliSalon     GymEase      MediPro     [next-app]           │
│                                                                  │
│   app-config.ts: { modules, theme, businessProfile, branding }  │
├─────────────────────────────────────────────────────────────────┤
│                         THEME LAYER                              │
│                                                                  │
│   Component Registry  │  CSS Design Tokens  │  Per-App UI Kit   │
│   (React Context)     │  (CSS Variables)    │  (external set)   │
├─────────────────────────────────────────────────────────────────┤
│                         MODULE LAYER                             │
│                                                                  │
│  [calendar]  [employees]  [absence]  [time-tracking]  [payroll] │
│  [crm]  [forms]  [surveys]  [notifications]  [integrations]     │
│                                                                  │
│  Każdy moduł: manifest + public API + events + migrations + UI   │
├─────────────────────────────────────────────────────────────────┤
│                          CORE LAYER                              │
│                                                                  │
│  Auth  │  Workspaces (multi-tenant)  │  RBAC  │  Billing        │
│  Audit │  Module Registry            │  Event Bus               │
├─────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE LAYER                        │
│                                                                  │
│  Supabase (DB + Auth + Storage + Realtime)                       │
│  Next.js 14 App Router  │  TypeScript strict                     │
│  Vercel  │  pnpm                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Architektura bazy danych

### 3.1 Konwencja nazewnictwa tabel

Każda tabela modułu ma prefiks modułu. Tabele core nie mają prefiksu.

| Warstwa | Prefiks | Przykładowe tabele |
|---------|---------|-------------------|
| Core | (brak) | `workspaces`, `profiles`, `subscriptions`, `audit_logs` |
| Calendar | `cal_` | `cal_bookings`, `cal_equipment`, `cal_time_reservations` |
| Employees (HCM) | `hr_` | `hr_employees`, `hr_documents`, `hr_contracts`, `hr_demographics` |
| Absence | `abs_` | `abs_requests`, `abs_types`, `abs_balances`, `abs_policies` |
| Time Tracking | `tt_` | `tt_entries`, `tt_timesheets`, `tt_shift_rules` |
| Payroll | `pay_` | `pay_runs`, `pay_entries`, `pay_components`, `pay_tax_tables` |
| CRM | `crm_` | `crm_campaigns`, `crm_automations`, `crm_templates`, `crm_messages` |
| Forms | `frm_` | `frm_templates`, `frm_submissions`, `frm_responses` |

> **Uwaga dla SimpliSalonCloud:** Istniejące tabele produkcyjne (`bookings`, `employees`, itp.) są renaming-candidates w Phase 1. Do czasu migracji manifesty mapują na stare nazwy.

### 3.2 Schemat Core

```sql
-- Centralny tenant — workspace zastępuje "salon" w nowych aplikacjach
CREATE TABLE workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  business_profile text NOT NULL,  -- 'beauty_salon' | 'gym' | 'medical' | ...
  settings      jsonb DEFAULT '{}',
  plan          text NOT NULL DEFAULT 'starter',
  created_at    timestamptz DEFAULT now()
);

-- Rejestr aktywnych modułów per workspace (RUNTIME enablement)
CREATE TABLE workspace_modules (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_id     text NOT NULL,            -- 'calendar', 'employees', itp.
  enabled       boolean DEFAULT true,
  config        jsonb DEFAULT '{}',       -- per-module config (z wizard)
  enabled_at    timestamptz DEFAULT now(),
  PRIMARY KEY   (workspace_id, module_id)
);

-- Śledzenie migracji per moduł
CREATE TABLE module_migrations (
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  module_id       text NOT NULL,
  migration_name  text NOT NULL,
  applied_at      timestamptz DEFAULT now(),
  PRIMARY KEY     (workspace_id, module_id, migration_name)
);

-- Katalog aplikacji (meta — do wizarda)
CREATE TABLE app_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  business_profile text NOT NULL,
  default_modules text[] NOT NULL,  -- lista module_id domyślnie włączonych
  config_schema   jsonb NOT NULL,   -- JSON Schema dla kreatora
  created_at      timestamptz DEFAULT now()
);
```

### 3.3 Wzorzec każdej tabeli modułu

**Każda tabela modułu MUSI zawierać:**

```sql
CREATE TABLE cal_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- ... kolumny specyficzne dla modułu ...
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- OBOWIĄZKOWE: RLS
ALTER TABLE cal_bookings ENABLE ROW LEVEL SECURITY;

-- OBOWIĄZKOWE: workspace isolation policy
CREATE POLICY "workspace_isolation" ON cal_bookings
  USING (workspace_id = get_user_workspace_id());

-- OBOWIĄZKOWE: indeks na workspace_id
CREATE INDEX idx_cal_bookings_workspace ON cal_bookings(workspace_id);

-- OPCJONALNIE: module-gating na poziomie DB (belt-and-suspenders)
CREATE POLICY "module_enabled" ON cal_bookings
  USING (
    EXISTS (
      SELECT 1 FROM workspace_modules wm
      WHERE wm.workspace_id = get_user_workspace_id()
        AND wm.module_id = 'calendar'
        AND wm.enabled = true
    )
  );
```

### 3.4 Schemat modułu Employees (HCM — pełny)

```sql
-- Pracownicy (rdzeń)
CREATE TABLE hr_employees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES profiles(id),  -- link do auth user (opcjonalny)
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

-- Dane demograficzne
CREATE TABLE hr_demographics (
  employee_id     uuid PRIMARY KEY REFERENCES hr_employees(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date_of_birth   date,
  nationality     text,
  address         jsonb,  -- { street, city, postal_code, country }
  emergency_contact jsonb,
  -- Dane wrażliwe — osobna tabela, osobna RLS policy z "view_sensitive" permission
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Kontrakty / szczegóły zatrudnienia
CREATE TABLE hr_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  contract_type   text NOT NULL,  -- 'employment' | 'b2b' | 'civil_law' | ...
  start_date      date NOT NULL,
  end_date        date,  -- NULL = bezterminowy
  position        text NOT NULL,
  department      text,
  salary_gross    numeric(10,2),
  salary_currency text DEFAULT 'PLN',
  working_hours   numeric(4,2),  -- tygodniowe godziny
  is_current      boolean DEFAULT true,
  signed_at       date,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- Dokumenty pracownicze
CREATE TABLE hr_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  category        text NOT NULL,  -- 'id_card' | 'cv' | 'certificate' | 'contract_scan' | ...
  name            text NOT NULL,
  storage_path    text NOT NULL,  -- Supabase Storage path
  expires_at      date,           -- dla dokumentów z ważnością
  is_verified     boolean DEFAULT false,
  uploaded_at     timestamptz DEFAULT now(),
  uploaded_by     uuid REFERENCES profiles(id)
);
```

### 3.5 Schemat modułu Absence

```sql
-- Typy nieobecności (konfiguracja workspace)
CREATE TABLE abs_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,       -- 'Urlop wypoczynkowy', 'Chorobowe', ...
  code            text NOT NULL,       -- 'annual_leave', 'sick_leave', ...
  requires_approval boolean DEFAULT true,
  accrual_days_per_year int,           -- NULL = bez limitu
  color           text DEFAULT '#94a3b8',
  is_paid         boolean DEFAULT true
);

-- Polityki urlopowe per pracownik/workspace
CREATE TABLE abs_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  absence_type_id uuid NOT NULL REFERENCES abs_types(id),
  employee_id     uuid REFERENCES hr_employees(id),  -- NULL = default dla workspace
  days_per_year   int NOT NULL,
  carry_over_days int DEFAULT 0,
  effective_from  date NOT NULL
);

-- Wnioski urlopowe
CREATE TABLE abs_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  absence_type_id uuid NOT NULL REFERENCES abs_types(id),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  days_count      numeric(4,1) NOT NULL,  -- z uwzględnieniem half-day
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason          text,
  reviewed_by     uuid REFERENCES profiles(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz DEFAULT now()
);

-- Salda urlopowe (computed + manual adjustments)
CREATE TABLE abs_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  absence_type_id uuid NOT NULL REFERENCES abs_types(id),
  year            int NOT NULL,
  allocated       numeric(5,1) NOT NULL DEFAULT 0,
  used            numeric(5,1) NOT NULL DEFAULT 0,
  pending         numeric(5,1) NOT NULL DEFAULT 0,  -- oczekujące wnioski
  carried_over    numeric(5,1) NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, employee_id, absence_type_id, year)
);
```

### 3.6 Schemat modułu Time Tracking

```sql
-- Wpisy czasu pracy
CREATE TABLE tt_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  clocked_in_at   timestamptz NOT NULL,
  clocked_out_at  timestamptz,          -- NULL = aktywna sesja
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

-- Arkusze czasu (tygodniowe/miesięczne zestawienie)
CREATE TABLE tt_timesheets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES hr_employees(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  total_hours     numeric(6,2),        -- computed
  status          text DEFAULT 'open'
                    CHECK (status IN ('open', 'submitted', 'approved', 'locked')),
  submitted_at    timestamptz,
  approved_by     uuid REFERENCES profiles(id),
  approved_at     timestamptz,
  UNIQUE (workspace_id, employee_id, period_start)
);
```

---

## 4. Security Model

### 4.1 Autentykacja

```
Klient → Supabase Auth → JWT token
JWT: {
  sub: "user-uuid",
  app_metadata: {
    workspace_id: "workspace-uuid",
    role: "owner" | "manager" | "employee",
    permissions: ["calendar:view", "employees:manage", ...]
  }
}
```

**Reguły:**
- `supabase.auth.getUser()` — ZAWSZE. Nigdy `getSession()` w server-side code.
- JWT `app_metadata` synchronizowany przez trigger `sync_user_claims` przy INSERT/UPDATE na `profiles`.
- `getAuthContext()` — jedyny helper uprawniony do wyciągania `workspace_id` w API routes.

```typescript
// lib/supabase/get-auth-context.ts
export interface AuthContext {
  supabase: SupabaseClient
  user: User
  workspaceId: string
  role: WorkspaceRole
  permissions: Permission[]
}

export async function getAuthContext(): Promise<AuthContext>
// Throws: UnauthorizedError, NotFoundError — nigdy nie zwraca null
```

### 4.2 RBAC — Permission Model

Uprawnienia są **per-moduł**, aggregowane do JWT claims.

```typescript
// lib/rbac/permissions.ts
export type Permission =
  // Core
  | 'workspace:manage'
  | 'workspace:billing'
  | 'audit:view'
  // Calendar
  | 'calendar:view'
  | 'calendar:manage'
  | 'calendar:manage_own'
  // Employees
  | 'employees:view'
  | 'employees:manage'
  | 'employees:view_sensitive'     // demografia, szczegóły kontraktu
  | 'employees:manage_sensitive'
  // Absence
  | 'absence:view'
  | 'absence:request'              // pracownik składa wniosek
  | 'absence:approve'              // manager zatwierdza
  // Time Tracking
  | 'time:view'
  | 'time:track'                   // clock in/out
  | 'time:approve'
  // Payroll
  | 'payroll:view'
  | 'payroll:manage'
  // CRM
  | 'crm:view'
  | 'crm:manage'
```

**Domyślna macierz uprawnień per rola:**

| Uprawnienie | owner | manager | employee |
|-------------|-------|---------|----------|
| workspace:manage | ✓ | — | — |
| workspace:billing | ✓ | — | — |
| calendar:manage | ✓ | ✓ | — |
| calendar:manage_own | ✓ | ✓ | ✓ |
| employees:view | ✓ | ✓ | — |
| employees:manage | ✓ | ✓ | — |
| employees:view_sensitive | ✓ | — | — |
| absence:request | ✓ | ✓ | ✓ |
| absence:approve | ✓ | ✓ | — |
| time:track | ✓ | ✓ | ✓ |
| time:approve | ✓ | ✓ | — |
| payroll:view | ✓ | ✓ | — |
| payroll:manage | ✓ | — | — |
| crm:manage | ✓ | ✓ | — |

Każdy moduł w `manifest.ts` deklaruje swoje uprawnienia i nadpisuje domyślne — workspace może customizować.

### 4.3 Multi-tenancy — Invarianty Bezwzględne

```
1. KAŻDE zapytanie do tabeli modułu MUSI zawierać WHERE workspace_id = $workspaceId
2. workspace_id ZAWSZE pochodzi z getAuthContext() — NIGDY z request body/params
3. RLS na KAŻDEJ tabeli (bez wyjątku)
4. Middleware sprawdza aktywność modułu PRZED przekazaniem do route handler
5. Dane wrażliwe (hr_demographics) — osobna RLS policy z 'employees:view_sensitive'
```

### 4.4 Module Gating — Middleware

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Wyciągnij moduł z pathname
  const moduleId = resolveModuleFromPath(pathname)
  if (!moduleId) return NextResponse.next()

  // Sprawdź czy moduł aktywny dla workspace
  const workspaceId = await getWorkspaceIdFromRequest(request)
  const isEnabled = await isModuleEnabled(workspaceId, moduleId)

  if (!isEnabled) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}
```

### 4.5 Row Level Security — Helper Functions

```sql
-- get_user_workspace_id() — core helper (zawsze dostępna)
CREATE OR REPLACE FUNCTION get_user_workspace_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::uuid
$$;

-- has_permission(permission) — sprawdza JWT claim
CREATE OR REPLACE FUNCTION has_permission(permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth.jwt() -> 'app_metadata' -> 'permissions' ? permission
$$;

-- Sensitive data policy (hr_demographics)
CREATE POLICY "sensitive_data_access" ON hr_demographics
  USING (
    workspace_id = get_user_workspace_id()
    AND has_permission('employees:view_sensitive')
  );
```

---

## 5. Module System — Kontrakty

### 5.1 ModuleManifest — Pełny Interfejs

```typescript
// lib/modules/types.ts

export type ModuleCategory =
  | 'scheduling'   // calendar, equipment
  | 'hr'           // employees, absence, time-tracking, payroll
  | 'sales'        // crm, vouchers
  | 'operations'   // forms, surveys, notifications
  | 'integrations' // booksy, gmail, payments

export type BusinessProfile =
  | 'beauty_salon'
  | 'gym'
  | 'medical'
  | 'workshop'
  | 'agency'
  | 'custom'

export interface NavItem {
  path: string           // relative to /[slug]/
  label: string          // localized
  icon: string           // Lucide icon name
  permission?: Permission
  children?: NavItem[]
}

export interface PermissionDefinition {
  id: Permission
  label: string
  description: string
}

export interface SlotDefinition {
  id: string
  description: string
  props: Record<string, unknown>  // props przekazywane do slot component
}

export interface ModuleLifecycle {
  onInstall(workspaceId: string): Promise<void>
  onUninstall(workspaceId: string, strategy: 'soft' | 'hard'): Promise<void>
  onUpgrade(workspaceId: string, fromVersion: string): Promise<void>
  healthCheck(workspaceId: string): Promise<{
    status: 'healthy' | 'degraded' | 'error'
    checks: Record<string, boolean>
  }>
}

export interface ModuleManifest {
  // Identity
  id: string              // 'calendar' — kebab-case, globally unique
  name: string            // 'Kalendarz' — display name
  description: string
  version: string         // semver: '1.0.0'
  icon: string            // Lucide icon name
  category: ModuleCategory

  // Dependency graph
  requires: string[]      // module IDs, MUSZĄ być aktywne
  enhances: string[]      // moduł działa bez nich, ale lepiej razem
  conflicts: string[]     // wzajemnie wykluczające się

  // Business fit
  recommendedFor: BusinessProfile[]

  // Configuration contract
  configSchema: ZodSchema
  defaultConfig: unknown

  // Navigation contribution
  navItems: NavItem[]

  // RBAC contract
  permissions: PermissionDefinition[]
  defaultRolePermissions: Record<'owner' | 'manager' | 'employee', Permission[]>

  // Extension slots (extension points offered to other modules)
  slots: Record<string, SlotDefinition>

  // Slot fills (what this module injects into other modules' slots)
  fills: Record<string, React.ComponentType>
  // key format: '{module_id}:{slot_id}' → np. 'employees:detail-tab'

  // Event catalog
  emits: string[]         // event type strings this module publishes
  handles: string[]       // event type strings this module subscribes to

  // Database
  migrations: string[]    // ordered paths relative to module root
  seedScript?: string     // optional demo data SQL

  // Lifecycle
  lifecycle: ModuleLifecycle
}
```

### 5.2 Public API — Kontrakt między modułami

Każdy moduł eksportuje `PublicAPI` — jedyny legalny sposób dostępu do danych modułu przez inne moduły.

```typescript
// modules/employees/public-api.ts
export interface EmployeesPublicAPI {
  getEmployee(id: string, workspaceId: string): Promise<Employee | null>
  listActiveEmployees(workspaceId: string, options?: {
    departmentId?: string
    withContracts?: boolean
  }): Promise<Employee[]>
  getEmployeeSchedule(employeeId: string, date: Date): Promise<DaySchedule>
  isEmployeeAvailable(employeeId: string, from: Date, to: Date): Promise<boolean>
  getEmployeeCurrentContract(employeeId: string, workspaceId: string): Promise<Contract | null>
}

// modules/absence/public-api.ts
export interface AbsencePublicAPI {
  getAbsenceBalance(employeeId: string, typeCode: string, year: number): Promise<number>
  isEmployeeAbsent(employeeId: string, date: Date): Promise<boolean>
  getPendingApprovals(workspaceId: string, managerId: string): Promise<AbsenceRequest[]>
}

// modules/time-tracking/public-api.ts
export interface TimeTrackingPublicAPI {
  getMonthlyHours(employeeId: string, month: Date): Promise<number>
  getApprovedEntries(employeeId: string, from: Date, to: Date): Promise<TimeEntry[]>
  getCurrentlyActive(workspaceId: string): Promise<ActiveSession[]>
}

// lib/modules/public-apis.ts — centralny registry
export const MODULE_APIS = {
  employees: () => import('@/modules/employees/public-api').then(m => m.employeesAPI),
  absence: () => import('@/modules/absence/public-api').then(m => m.absenceAPI),
  timeTracking: () => import('@/modules/time-tracking/public-api').then(m => m.timeTrackingAPI),
  payroll: () => import('@/modules/payroll/public-api').then(m => m.payrollAPI),
  calendar: () => import('@/modules/calendar/public-api').then(m => m.calendarAPI),
  crm: () => import('@/modules/crm/public-api').then(m => m.crmAPI),
} as const
```

**Zasada:** Moduł `payroll` obliczający wynagrodzenie importuje `timeTrackingAPI.getApprovedEntries()` — **nigdy** nie importuje bezpośrednio z `modules/time-tracking/lib/db/queries.ts`.

### 5.3 Event System — Katalog zdarzeń

Zdarzenia domenowe są kontraktem między modułami. Każde zdarzenie ma zdefiniowany kształt (Zod schema).

```typescript
// lib/events/catalog.ts
import { z } from 'zod'

export const EVENT_CATALOG = {
  // ─── Calendar ───────────────────────────────────────────────
  'booking.created': z.object({
    bookingId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
    serviceId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    source: z.enum(['manual', 'online', 'import']),
  }),
  'booking.cancelled': z.object({
    bookingId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    reason: z.string().optional(),
    cancelledBy: z.enum(['client', 'workspace', 'system']),
    cancelledAt: z.string().datetime(),
  }),
  'booking.completed': z.object({
    bookingId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    actualDurationMinutes: z.number().int(),
  }),

  // ─── Employees ──────────────────────────────────────────────
  'employee.created': z.object({
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  }),
  'employee.deactivated': z.object({
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    reason: z.string().optional(),
    effectiveDate: z.string().date(),
  }),
  'employee.contract.signed': z.object({
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    contractId: z.string().uuid(),
    contractType: z.string(),
    startDate: z.string().date(),
  }),

  // ─── Absence ────────────────────────────────────────────────
  'absence.requested': z.object({
    absenceId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    absenceType: z.string(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    daysCount: z.number(),
  }),
  'absence.approved': z.object({
    absenceId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    approvedBy: z.string().uuid(),
  }),
  'absence.rejected': z.object({
    absenceId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    reason: z.string().optional(),
  }),

  // ─── Time Tracking ──────────────────────────────────────────
  'time.entry.clocked-in': z.object({
    entryId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    clockedAt: z.string().datetime(),
  }),
  'time.entry.clocked-out': z.object({
    entryId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    clockedAt: z.string().datetime(),
    durationMinutes: z.number().int(),
  }),
  'time.entry.approved': z.object({
    entryId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    approvedBy: z.string().uuid(),
  }),
  'time.timesheet.submitted': z.object({
    timesheetId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    totalHours: z.number(),
  }),

  // ─── Payroll ────────────────────────────────────────────────
  'payroll.run.created': z.object({
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    employeeCount: z.number().int(),
  }),
  'payroll.run.approved': z.object({
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    approvedBy: z.string().uuid(),
  }),
  'payroll.entry.exported': z.object({
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    format: z.enum(['pdf', 'csv', 'xml']),
  }),
} as const satisfies Record<string, z.ZodSchema>

export type EventCatalog = typeof EVENT_CATALOG
export type EventType = keyof EventCatalog
export type EventPayload<T extends EventType> = z.infer<EventCatalog[T]>
```

### 5.4 Event Bus — Implementacja

```typescript
// lib/events/bus.ts
type EventHandler<T extends EventType> = (
  event: { type: T; payload: EventPayload<T>; timestamp: string }
) => Promise<void>

class EventBus {
  private handlers = new Map<string, EventHandler<EventType>[]>()

  on<T extends EventType>(eventType: T, handler: EventHandler<T>): void {
    const existing = this.handlers.get(eventType) ?? []
    this.handlers.set(eventType, [...existing, handler as EventHandler<EventType>])
  }

  async emit<T extends EventType>(eventType: T, payload: EventPayload<T>): Promise<void> {
    const handlers = this.handlers.get(eventType) ?? []
    const event = { type: eventType, payload, timestamp: new Date().toISOString() }

    // Równoległe wywołanie wszystkich handlerów — błąd jednego nie blokuje innych
    await Promise.allSettled(handlers.map(h => h(event)))

    // Persystuj do audit log (opcjonalnie)
    await persistEvent(event)
  }
}

export const eventBus = new EventBus()
```

**Przykładowe powiązania modułów przez eventy:**

```
booking.completed → [CRM] dodaj do historii klienta
booking.completed → [Payroll] opcjonalnie: premia za wizytę

absence.approved  → [Calendar] zablokuj dni w kalendarzu pracownika
absence.approved  → [Payroll] oznacz dni nieobecności w rozliczeniu

time.timesheet.submitted → [Payroll] odblokuj obliczenie wynagrodzenia

employee.deactivated → [Calendar] anuluj przyszłe rezerwacje
employee.deactivated → [Absence] zamknij otwarte wnioski
```

### 5.5 Extension Slots — UI Injection

Moduły mogą rozszerzać UI innych modułów bez bezpośrednich zależności.

```typescript
// lib/modules/slots.ts
export function ModuleSlot({
  moduleId,
  slotId,
  props
}: {
  moduleId: string
  slotId: string
  props: Record<string, unknown>
}) {
  const registry = useModuleRegistry()
  const fillerKey = `${moduleId}:${slotId}`
  const Filler = registry.getSlotFiller(fillerKey)

  if (!Filler) return null
  return <Filler {...props} />
}
```

**Przykład: Absence tab w Employee Detail**

```tsx
// modules/employees/components/EmployeeDetail.tsx
// EmployeeDetail NIE wie nic o module Absence

export function EmployeeDetail({ employee }) {
  return (
    <Tabs>
      <TabsList>
        <TabsTrigger value="overview">Przegląd</TabsTrigger>
        <TabsTrigger value="contracts">Kontrakty</TabsTrigger>
        {/* Inne moduły mogą dodać swoje zakładki */}
        <ModuleSlot
          moduleId="employees"
          slotId="detail-tab-trigger"
          props={{ employeeId: employee.id }}
        />
      </TabsList>
      <TabsContent value="overview">...</TabsContent>
      <TabsContent value="contracts">...</TabsContent>
      <ModuleSlot
        moduleId="employees"
        slotId="detail-tab-content"
        props={{ employeeId: employee.id }}
      />
    </Tabs>
  )
}

// modules/absence/manifest.ts
fills: {
  'employees:detail-tab-trigger': AbsenceTabTrigger,
  'employees:detail-tab-content': AbsenceTabContent,
}
```

---

## 6. Theme & Component System

### 6.1 Zasada działania

Moduły domenowe **nigdy nie importują bezpośrednio** bibliotek UI (`shadcn/ui`, `@radix-ui`, itp.). Używają wyłącznie `useComponents()` — hooka zwracającego implementację z aktywnego theme.

```tsx
// ✅ Poprawnie — theme-agnostic
import { useComponents } from '@/lib/themes'

export function BookingCard({ booking }) {
  const { Card, Badge, Button } = useComponents()
  return (
    <Card>
      <Badge variant="success">{booking.status}</Badge>
      <Button>Edytuj</Button>
    </Card>
  )
}

// ❌ Błąd — hardcoded UI library
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
```

### 6.2 Component Registry — Interfejs

```typescript
// lib/themes/registry.ts

// Typy props — definiują kontrakt UI (niezależny od implementacji)
export interface ButtonProps {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link'
  size?: 'sm' | 'default' | 'lg' | 'icon'
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
}

export interface CardProps {
  variant?: 'default' | 'outlined' | 'elevated'
  padding?: 'none' | 'sm' | 'default' | 'lg'
  children: React.ReactNode
  className?: string
}

export interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData>[]
  onRowClick?: (row: TData) => void
  emptyState?: React.ReactNode
  loading?: boolean
  pagination?: { pageSize: number; total: number; onPageChange: (p: number) => void }
}

export interface ComponentRegistry {
  // ─── Layout
  PageHeader: React.ComponentType<PageHeaderProps>
  PageContent: React.ComponentType<{ children: React.ReactNode }>
  Section: React.ComponentType<SectionProps>
  Card: React.ComponentType<CardProps>
  CardHeader: React.ComponentType<CardHeaderProps>
  CardContent: React.ComponentType<{ children: React.ReactNode }>
  Divider: React.ComponentType<{ label?: string }>

  // ─── Forms
  Input: React.ComponentType<InputProps>
  Select: React.ComponentType<SelectProps>
  Textarea: React.ComponentType<TextareaProps>
  Checkbox: React.ComponentType<CheckboxProps>
  Switch: React.ComponentType<SwitchProps>
  DatePicker: React.ComponentType<DatePickerProps>
  DateRangePicker: React.ComponentType<DateRangePickerProps>
  TimePicker: React.ComponentType<TimePickerProps>
  FormField: React.ComponentType<FormFieldProps>
  FormLabel: React.ComponentType<FormLabelProps>
  FormMessage: React.ComponentType<FormMessageProps>

  // ─── Actions
  Button: React.ComponentType<ButtonProps>
  IconButton: React.ComponentType<IconButtonProps>
  DropdownMenu: React.ComponentType<DropdownMenuProps>

  // ─── Feedback
  Badge: React.ComponentType<BadgeProps>
  Alert: React.ComponentType<AlertProps>
  Toast: ToastAPI      // imperatywne API
  Progress: React.ComponentType<ProgressProps>
  Tooltip: React.ComponentType<TooltipProps>

  // ─── Data Display
  DataTable: <TData>(props: DataTableProps<TData>) => React.ReactElement
  Avatar: React.ComponentType<AvatarProps>
  EmptyState: React.ComponentType<EmptyStateProps>
  StatCard: React.ComponentType<StatCardProps>
  Timeline: React.ComponentType<TimelineProps>
  FileUpload: React.ComponentType<FileUploadProps>

  // ─── Navigation
  Sidebar: React.ComponentType<SidebarProps>
  Breadcrumb: React.ComponentType<BreadcrumbProps>
  Tabs: React.ComponentType<TabsProps>
  TabsList: React.ComponentType<{ children: React.ReactNode }>
  TabsTrigger: React.ComponentType<TabsTriggerProps>
  TabsContent: React.ComponentType<TabsContentProps>

  // ─── Overlays
  Modal: React.ComponentType<ModalProps>
  Sheet: React.ComponentType<SheetProps>
  Popover: React.ComponentType<PopoverProps>
  ConfirmDialog: React.ComponentType<ConfirmDialogProps>

  // ─── Loading
  Skeleton: React.ComponentType<SkeletonProps>
  Spinner: React.ComponentType<SpinnerProps>
  PageLoader: React.ComponentType
}
```

### 6.3 Design Tokens

```typescript
// lib/themes/tokens.ts
export interface DesignTokens {
  colors: {
    primary:     ColorScale  // 50-950 odcieni
    secondary:   ColorScale
    accent:      ColorScale
    neutral:     ColorScale
    destructive: ColorScale
    success:     ColorScale
    warning:     ColorScale
    info:        ColorScale
    background:  string
    surface:     string      // card backgrounds
    border:      string
    foreground:  string
  }
  typography: {
    fontFamily: { sans: string; mono: string }
    fontSize: Record<'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl', string>
    fontWeight: Record<'normal' | 'medium' | 'semibold' | 'bold', string>
    lineHeight: Record<'tight' | 'normal' | 'relaxed', string>
  }
  spacing: Record<0 | 0.5 | 1 | 2 | 3 | 4 | 6 | 8 | 10 | 12 | 16 | 20 | 24, string>
  borderRadius: Record<'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full', string>
  shadows: Record<'none' | 'sm' | 'md' | 'lg' | 'xl', string>
  motion: {
    duration: Record<'fast' | 'normal' | 'slow', string>
    easing: Record<'default' | 'in' | 'out' | 'bounce', string>
  }
}
```

### 6.4 Struktura Theme Package (zewnętrzny zestaw komponentów)

```
themes/
  simplisalon/          ← dostarczone przez Bartosza
    index.ts            ← eksportuje: { registry, tokens }
    tokens.ts           ← rose/coral/soft palette (salon/spa feeling)
    components/
      Button.tsx
      Card.tsx
      DataTable.tsx
      ... (wszystkie komponenty z ComponentRegistry)
  gymease/
    index.ts
    tokens.ts           ← electric blue/dark/energy palette
    components/
  medipro/
    index.ts
    tokens.ts           ← clean white/blue/clinical palette
    components/
  _default/             ← fallback (current shadcn/ui — always present)
    index.ts
    tokens.ts
    components/
```

### 6.5 Theme Provider

```tsx
// app/providers.tsx
import { APP_CONFIG } from '@/app-config'

export async function Providers({ children }: { children: React.ReactNode }) {
  const theme = await loadTheme(APP_CONFIG.themeId)

  return (
    <ThemeProvider tokens={theme.tokens} registry={theme.registry}>
      {children}
    </ThemeProvider>
  )
}

// lib/themes/provider.tsx
const ComponentRegistryContext = createContext<ComponentRegistry>(defaultRegistry)

export function ThemeProvider({ tokens, registry, children }) {
  return (
    <ComponentRegistryContext.Provider value={registry}>
      <style>{generateCSSVariables(tokens)}</style>
      {children}
    </ComponentRegistryContext.Provider>
  )
}

export function useComponents(): ComponentRegistry {
  return useContext(ComponentRegistryContext)
}
```

---

## 7. App Configuration — Kontrakt

```typescript
// app-config.ts — generowany przez wizard, checkin do repo per aplikacja

import { type AppConfig } from '@/lib/config/types'

export const APP_CONFIG: AppConfig = {
  // Identyfikacja aplikacji
  appId: 'simplisalon',
  appName: 'SimpliSalon Cloud',
  appUrl: 'https://app.simplisalon.pl',

  // Profil biznesowy
  businessProfile: 'beauty_salon',

  // Aktywne moduły — kolejność = kolejność w nawigacji
  enabledModules: [
    'calendar',
    'employees',
    'absence',
    'crm',
    'notifications',
    'forms',
    'surveys',
    'billing',
    'integrations',
  ],

  // Konfiguracja per moduł (wypełniana przez wizard)
  moduleConfigs: {
    calendar: {
      bookingWindowDays: 60,
      cancellationWindowHours: 24,
      defaultDuration: 60,
      bufferMinutes: 0,
      equipmentEnabled: true,
      groupBookingEnabled: true,
      onlineBookingEnabled: true,
    },
    employees: {
      contractTypes: ['employment', 'b2b', 'civil_law'],
      documentCategories: ['id_card', 'cv', 'certificate', 'other'],
      departments: ['reception', 'stylist', 'nail_tech', 'management'],
    },
    absence: {
      types: [
        { code: 'annual_leave', name: 'Urlop wypoczynkowy', daysPerYear: 26 },
        { code: 'sick_leave', name: 'Zwolnienie lekarskie', daysPerYear: null },
      ],
      approvalRequired: true,
    },
    crm: {
      channels: ['sms', 'email'],
      automationsEnabled: true,
    },
  },

  // Wygląd
  themeId: 'simplisalon',
  branding: {
    logoUrl: '/logo.svg',
    faviconUrl: '/favicon.ico',
    primaryColor: '#f43f5e',  // dla fallback CSS var
  },

  // Lokalizacja
  locale: 'pl',
  timezone: 'Europe/Warsaw',
  currency: 'PLN',
}
```

---

## 8. Data Gathering Workbook — Wizard

### 8.1 Flow

```
/setup (lub /_admin/new-app)

Step 1: Profil biznesowy
  [ ] Salon urody / Spa / Wellness
  [ ] Siłownia / Studio fitness / Crossfit  
  [ ] Gabinet medyczny / Stomatologia / Fizjoterapia
  [ ] Warsztat / Serwis
  [ ] Biuro / Agencja
  [ ] Własny profil (custom)
  → Auto-preselect modułów i konfiguracji na podstawie profilu

Step 2: Moduły
  Wymagane (zawsze)
  ─────────────────
  [■] Core (auth, workspace, billing)

  Dostępne
  ─────────────────
  [✓] Kalendarz          — rezerwacje online i offline
  [✓] Pracownicy (HCM)   — kartoteki, umowy, dokumenty
  [✓] Nieobecności       — wnioski, salda, zatwierdzanie
      └─ wymaga: Pracownicy
  [ ] Ewidencja czasu    — clock in/out, arkusze godzin
      └─ wymaga: Pracownicy
  [ ] Payroll            — obliczanie wynagrodzeń
      └─ wymaga: Pracownicy + Ewidencja czasu
  [✓] CRM                — kampanie, automatyzacje, wiadomości
  [✓] Formularze         — formularze przed wizytą, intake
  [✓] Ankiety            — NPS, satysfakcja klienta
  [✓] Powiadomienia      — SMS, email
  [ ] Integracje         — Booksy, Przelewy24, Gmail

Step 3: Konfiguracja modułów (accordion)
  ▼ Kalendarz
    Okno rezerwacji:        [60] dni do przodu
    Anulowanie:             [24] h przed wizytą
    Bufor między wizytami:  [0] min
    Rezerwacje grupowe:     [✓]
    Rezerwacje online:      [✓]
    Zarządzanie sprzętem:   [✓]

  ▼ Pracownicy
    Typy kontraktu:         [✓] Umowa o pracę  [✓] B2B  [ ] Zlecenie
    Kategorie dokumentów:   [✓] Dowód  [✓] CV  [✓] Certyfikaty
    Działy:                 [salon] [zarząd] + [+Dodaj dział]

  ▼ Nieobecności
    [+] Urlop wypoczynkowy (26 dni / rok)
    [+] Zwolnienie lekarskie (bez limitu)
    [+Dodaj typ nieobecności]
    Zatwierdzanie przez managera: [✓]

Step 4: Styl graficzny
  Wybierz zestaw komponentów:
  [ ] Default (shadcn/ui)
  [ ] SimpliSalon (rose/coral — salon & wellness)
  [ ] GymEase (dark/electric — fitness)
  [ ] MediPro (white/blue — medical)
  [+] Wgraj własny zestaw (ZIP z plikami TSX)

  Branding:
  Nazwa aplikacji: [SimpliSalon Cloud_______]
  Logo:            [Upload SVG]
  Kolor główny:    [#f43f5e ███]

Step 5: Role i uprawnienia
  Przeglądaj macierz uprawnień, opcjonalne nadpisanie defaults
  (tabela owner/manager/employee vs permissions per module)

Step 6: Podsumowanie i generowanie
  Aktywne moduły: 6
  Tabele DB do utworzenia: 23
  Szacowany czas setup: ~2 min

  [✓] Uruchom migracje
  [✓] Dodaj dane demo
  [ ] Skonfiguruj domenę

  [Utwórz aplikację →]
```

### 8.2 Output wizarda

```typescript
// Wizard generuje 3 artefakty:

// 1. app-config.ts (jak w sekcji 7)
// 2. Migration manifest — tylko tabele wybranych modułów
// modules/_wizard-output/selected-migrations.sql

// 3. Seed script
// modules/_wizard-output/seed.sql
```

---

## 9. Struktura katalogów

```
d:\SimpliSalonCLoud\
├── app/
│   ├── (auth)/
│   ├── (dashboard)/[slug]/
│   │   ├── layout.tsx               ← dynamiczna nawigacja z MODULE_REGISTRY
│   │   ├── calendar/                ← page imports from modules/calendar/
│   │   ├── employees/               ← page imports from modules/employees/
│   │   ├── absence/
│   │   ├── time-tracking/
│   │   ├── payroll/
│   │   ├── crm/
│   │   └── settings/
│   ├── api/
│   │   ├── _core/                   ← auth, workspace, billing routes
│   │   ├── calendar/                ← handlers import from modules/calendar/lib
│   │   ├── employees/
│   │   ├── absence/
│   │   ├── time-tracking/
│   │   └── payroll/
│   └── setup/                       ← Data Gathering Workbook wizard
│
├── modules/
│   ├── _core/
│   │   ├── manifest.ts
│   │   └── lib/
│   ├── calendar/
│   │   ├── manifest.ts              ← SINGLE SOURCE OF TRUTH dla modułu
│   │   ├── public-api.ts            ← API dla innych modułów
│   │   ├── components/              ← UI components (używane przez app/)
│   │   ├── lib/                     ← business logic (używane przez app/api/)
│   │   │   ├── db/                  ← Supabase queries
│   │   │   ├── validation.ts
│   │   │   └── utils.ts
│   │   ├── db/
│   │   │   ├── migrations/          ← SQL pliki dla tego modułu
│   │   │   └── seed.sql
│   │   ├── config/
│   │   │   ├── schema.ts            ← Zod schema konfiguracji
│   │   │   └── defaults.ts
│   │   └── hooks/                   ← React hooks
│   ├── employees/
│   ├── absence/
│   ├── time-tracking/
│   ├── payroll/
│   └── crm/
│
├── lib/
│   ├── modules/
│   │   ├── types.ts                 ← ModuleManifest interface
│   │   ├── registry.ts              ← MODULE_REGISTRY
│   │   ├── slots.ts                 ← ModuleSlot component
│   │   └── public-apis.ts           ← cross-module API registry
│   ├── events/
│   │   ├── catalog.ts               ← EVENT_CATALOG (Zod schemas)
│   │   └── bus.ts                   ← EventBus
│   ├── themes/
│   │   ├── types.ts                 ← ComponentRegistry, DesignTokens interfaces
│   │   ├── provider.tsx             ← ThemeProvider, useComponents()
│   │   └── registry.ts              ← loadTheme()
│   ├── config/
│   │   └── types.ts                 ← AppConfig interface
│   └── supabase/
│       └── get-auth-context.ts      ← getAuthContext()
│
├── themes/
│   ├── _default/                    ← shadcn/ui based (always present)
│   ├── simplisalon/                 ← (dostarczone per aplikacja)
│   └── [app-theme]/
│
├── app-config.ts                    ← generowany przez wizard, per deployment
├── supabase/migrations/             ← istniejące migracje SimpliSalonCloud
└── docs/architecture/
    └── platform-design-doc.md       ← ten plik
```

---

## 10. Mapa zależności modułów

```
_core ─────────────────────────────────────────────────────
  └── (required by ALL modules)

calendar
  ├── enhances: employees (show employee availability)
  ├── enhances: crm (booking → client history)
  └── emits: booking.created, booking.cancelled, booking.completed

employees (HCM)
  ├── requires: _core
  ├── slots: detail-tab-trigger, detail-tab-content, list-column
  └── emits: employee.created, employee.deactivated, employee.contract.signed

absence
  ├── requires: employees
  ├── fills: employees:detail-tab (Absence balance tab)
  ├── handles: employee.deactivated (close open requests)
  └── emits: absence.requested, absence.approved, absence.rejected

time-tracking
  ├── requires: employees
  ├── fills: employees:detail-tab (Timesheet tab)
  ├── handles: absence.approved (block from tracking when absent)
  └── emits: time.entry.clocked-in, time.entry.clocked-out, time.timesheet.submitted

payroll
  ├── requires: employees + time-tracking
  ├── fills: employees:detail-tab (Payroll history tab)
  ├── handles: time.timesheet.submitted, absence.approved
  └── emits: payroll.run.created, payroll.run.approved

crm
  ├── enhances: calendar (post-booking automations)
  ├── handles: booking.completed (trigger follow-up)
  └── emits: crm.message.sent, crm.campaign.completed
```

---

## 11. Deployment Model

### Nowa aplikacja = fork + wizard

```
1. Use Template: github.com/flowsforge/platform
   → Nowe repo: github.com/flowsforge/[app-name]

2. Skonfiguruj Supabase:
   supabase projects create [app-name]
   supabase link --project-ref [ref]

3. Uruchom wizard lokalnie:
   pnpm wizard
   → Wybierz moduły, konfiguruj, wybierz theme
   → Generuje app-config.ts + runs migrations

4. Deploy na Vercel:
   vercel --prod
   → Environment variables z Supabase
```

### Per-app environment variables

```bash
# .env.local (per aplikacja)
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_ID=simplisalon        # identyfikator aplikacji
NEXT_PUBLIC_THEME_ID=simplisalon      # który theme załadować
```

---

## 12. Roadmap implementacji

### Faza 0 — Module System Infrastructure (2 sprinty)
- [ ] `lib/modules/types.ts` — interfejsy ModuleManifest, AppConfig
- [ ] `lib/modules/registry.ts` — MODULE_REGISTRY
- [ ] `lib/events/catalog.ts` — EVENT_CATALOG z Zod schemas
- [ ] `lib/events/bus.ts` — EventBus
- [ ] `lib/themes/types.ts` — ComponentRegistry interface
- [ ] `lib/themes/provider.tsx` — ThemeProvider + useComponents()
- [ ] `themes/_default/` — shadcn/ui wrapped w ComponentRegistry
- [ ] `middleware.ts` — module gating
- [ ] `workspace_modules` table — migracja
- [ ] Dynamiczna nawigacja w layout.tsx z MODULE_REGISTRY

### Faza 1 — Wyodrębnienie istniejących modułów (4 sprinty)
- [ ] `modules/calendar/` — manifest + public-api + db migrations z istniejących tabel
- [ ] `modules/employees/` — manifest + public-api (podstawowy)
- [ ] `modules/crm/` — manifest + public-api
- [ ] `modules/absence/` — manifest + public-api

### Faza 2 — Nowe moduły (3 sprinty)
- [ ] `modules/employees/` upgrade do HCM (hr_documents, hr_demographics, hr_contracts)
- [ ] `modules/time-tracking/` — nowy (tt_entries, tt_timesheets)
- [ ] `modules/payroll/` — wzbogacenie istniejącego

### Faza 3 — Wizard (2 sprinty)
- [ ] `app/setup/` — Data Gathering Workbook (5 kroków)
- [ ] Generator `app-config.ts`
- [ ] Migration runner per moduł

### Faza 4 — Template Repository (1 sprint)
- [ ] Usunięcie SimpliSalonCloud-specific hardcoding
- [ ] GitHub Template Repository
- [ ] Dokumentacja "nowa aplikacja w 30 minut"

---

## 13. Kluczowe decyzje i uzasadnienia

| Decyzja | Wybór | Dlaczego |
|---------|-------|---------|
| Module storage | `workspace_modules` w DB | Runtime flexibility, brak rebuild na zmianę konfiguracji |
| Cross-module comms | Typed PublicAPI + EventBus | Zero coupling, type safety, testowalność |
| UI theming | ComponentRegistry (React Context) | Brak dodatkowego build tooling, działa z Next.js |
| Table naming | Prefiks modułu | Jasna przynależność, brak konfliktów, łatwy cleanup |
| New app model | Fork GitHub Template | Prostota, niezależność, brak monorepo overhead |
| Event persistence | audit_log w core | Debugowanie, compliance, replay możliwy |
| Sensitive data | Osobna tabela + osobna RLS policy | Minimalizacja dostępu do wrażliwych danych |
| Zależności modułów | Deklaratywne w manifest.requires | Wizard może walidować i auto-enable zależności |
