# Sprint AF-11 — Time Tracking — DB + API

> **⚡ Dispatch równolegle z:** [AF-09](AF-09-hcm-api.md)
> AF-11 (Time Tracking DB+API) i AF-09 (HCM API) nie mają zależności między sobą.

## Cel
(P1) Nowy moduł Time Tracking: tabele tt_entries i tt_timesheets,
manifest modułu i API routes (clock in/out, timesheet management).
Wymaga AF-05 (employees manifest) — employees Public API jest używane.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md. List: (1) tt_entries and tt_timesheets full schemas, (2) time.entry.* events and their payloads, (3) how time-tracking fills employees:detail-tab slot. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/DB-SCHEMA.md` | tt_entries, tt_timesheets schematy + RLS wzorzec |
| `docs/AppForge/EVENTS.md` | time.entry.* events, EventBus.emit pattern |
| `docs/AppForge/MODULE-SYSTEM.md` | Manifest z fills employees:detail-tab |
| `docs/AppForge/SECURITY.md` | time:track (pracownik), time:approve (manager) |

**Kluczowe constraints:**
- `tt_entries.clocked_out_at` = NULL oznacza aktywną sesję — max 1 aktywna per pracownik
- API clock-in: sprawdź brak aktywnej sesji (409 jeśli już jest)
- API clock-out: wymaga aktywnej sesji (404 jeśli brak)
- `tt_timesheets` UNIQUE (salon_id, employee_id, period_start) — jeden arkusz per okres
- Events emitowane SYNCHRONICZNIE po operacji DB (przed zwróceniem response)
- `time:track` → pracownik może clock-in/out tylko dla siebie, manager dla wszystkich

## Work packages

Sekwencyjnie: DB najpierw → gen types → API + manifest równolegle.

- ID: pkg-db | Type: migration | Worker: codex-dad
  Outputs: supabase/migrations/20260503000001_time_tracking.sql

- ID: pkg-api | Type: implementation | Worker: codex-main
  Inputs: pkg-db (po gen types)
  Outputs: app/api/time-tracking/*, modules/time-tracking/manifest.ts, modules/time-tracking/public-api.ts

## Prompt — codex-dad (SQL migration)

```bash
DAD_PROMPT="Read .workflow/skills/sql-migration-safe.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/DB-SCHEMA.md for tt_entries and tt_timesheets schemas.

Goal: Create SQL migration for Time Tracking module.
File: /mnt/d/SimpliSalonCLoud/supabase/migrations/20260503000001_time_tracking.sql

SQL:

1. CREATE TABLE tt_entries:
   id uuid PK, salon_id uuid FK salons CASCADE, employee_id uuid FK hr_employees CASCADE,
   clocked_in_at timestamptz NOT NULL, clocked_out_at timestamptz (nullable — NULL = active),
   break_minutes int DEFAULT 0, notes text nullable,
   entry_type text DEFAULT 'clock' CHECK IN ('clock','manual','import'),
   status text DEFAULT 'pending' CHECK IN ('pending','approved','rejected'),
   approved_by uuid FK profiles nullable, approved_at timestamptz nullable,
   created_at timestamptz DEFAULT now()
   - RLS: salon_id = get_user_salon_id()
   - Policy for SELECT/UPDATE: employee sees own entries, manager sees all
     SELECT policy: salon_id = get_user_salon_id() AND (employee_id = get_user_employee_id() OR has_any_salon_role(ARRAY['owner','manager']))
   - Indexes: (salon_id, employee_id), (salon_id, clocked_in_at), (salon_id, status)

2. CREATE TABLE tt_timesheets:
   id uuid PK, salon_id uuid FK salons CASCADE, employee_id uuid FK hr_employees CASCADE,
   period_start date NOT NULL, period_end date NOT NULL,
   total_hours numeric(6,2) nullable,
   status text DEFAULT 'open' CHECK IN ('open','submitted','approved','locked'),
   submitted_at timestamptz nullable, approved_by uuid FK profiles nullable, approved_at timestamptz nullable
   - UNIQUE (salon_id, employee_id, period_start)
   - RLS: salon_id = get_user_salon_id()
   - Indexes: (salon_id, employee_id), (salon_id, status)

Pure SQL only." bash ~/.claude/scripts/dad-exec.sh
```

## Prompt — codex-main (API + manifest)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read lib/supabase/get-auth-context.ts for auth pattern.
Read lib/events/bus.ts and lib/events/catalog.ts for event emission.
Read docs/AppForge/SECURITY.md for permission model.
Read docs/AppForge/MODULE-SYSTEM.md for ModuleManifest structure.
Read lib/modules/types.ts for TypeScript types.
Do NOT use Gemini — write directly.

Goal: Create Time Tracking API routes and module manifest.

File 1: app/api/time-tracking/clock-in/route.ts (POST)
- getAuthContext() — require 'time:track'
- Body: { employeeId?: string } — if missing, use authenticated employee's hr_employees record
- Verify employeeId belongs to workspace (IDOR)
- Check no active session: SELECT WHERE employee_id = ? AND clocked_out_at IS NULL → 409 if exists
- Insert tt_entries { salon_id, employee_id, clocked_in_at: now(), status: 'pending' }
- Emit eventBus.emit('time.entry.clocked-in', { entryId, employeeId, workspaceId, clockedAt })
- Return: { entryId, clockedInAt }

File 2: app/api/time-tracking/clock-out/route.ts (POST)
- getAuthContext() — require 'time:track'
- Body: { employeeId?, notes?, breakMinutes? }
- Find active session: clocked_out_at IS NULL for employeeId → 404 if none
- Update: clocked_out_at = now(), notes, break_minutes
- Compute durationMinutes = diff(now, clocked_in_at) - break_minutes
- Emit eventBus.emit('time.entry.clocked-out', { entryId, employeeId, workspaceId, clockedAt, durationMinutes })
- Return: { entryId, durationMinutes }

File 3: app/api/time-tracking/entries/route.ts (GET + POST manual entry)
- GET: list tt_entries WHERE salon_id AND (employee filter) AND date range from query params
  Require: 'time:view'
- POST: create manual entry
  Body: { employeeId, clockedInAt, clockedOutAt, breakMinutes?, notes? }
  Require: 'time:track'

File 4: app/api/time-tracking/entries/[id]/approve/route.ts (POST)
- getAuthContext() — require 'time:approve'
- Update status='approved', approved_by, approved_at
- Emit eventBus.emit('time.entry.approved', { entryId, employeeId, workspaceId, approvedBy })

File 5: app/api/time-tracking/timesheets/route.ts (GET + POST)
- GET: list tt_timesheets for workspace/employee with date filter
- POST: create or get-or-create timesheet for period
  Body: { employeeId, periodStart, periodEnd }
  UPSERT with ON CONFLICT DO NOTHING, return existing or created

File 6: app/api/time-tracking/timesheets/[id]/submit/route.ts (POST)
- Update status='submitted', submitted_at=now()
- Compute total_hours from sum of approved entries in period
- Emit eventBus.emit('time.timesheet.submitted', { ... })

File 7: modules/time-tracking/manifest.ts
- id: 'time-tracking', name: 'Ewidencja czasu', category: 'hr'
- requires: ['employees'], enhances: ['payroll'], conflicts: []
- navItems: [{ path: 'time-tracking', label: 'Ewidencja czasu', icon: 'Clock', permission: 'time:view' }]
- permissions: time:view, time:track, time:approve
- defaultRolePermissions: owner: all, manager: all, employee: [time:view, time:track]
- slots: {}
- fills: { 'employees:detail-tab-trigger': TimeTrackingTabTrigger (stub), 'employees:detail-tab-content': TimeTrackingTabContent (stub) }
- emits: ['time.entry.clocked-in', 'time.entry.clocked-out', 'time.entry.approved', 'time.timesheet.submitted']
- handles: ['absence.approved']

File 8: modules/time-tracking/public-api.ts
- Export TimeTrackingPublicAPI interface + implementation
- getMonthlyHours(employeeId, month, workspaceId): sum approved entries duration
- getApprovedEntries(employeeId, from, to, workspaceId): list
- Export singleton: export const timeTrackingAPI

Constraints:
- clock-in/out: ALWAYS verify employee belongs to workspace
- employee (not manager) can only clock-in/out for themselves (check JWT employee_id)
- eventBus.emit is async — await it before returning response
Done when: tsc passes."
```

## Po wykonaniu

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
# Dodaj timeTrackingModule do lib/modules/registry.ts (Claude — 2 linie)
npx tsc --noEmit
```

## Acceptance criteria

- [ ] `tt_entries` z RLS (pracownik widzi własne, manager wszystkie)
- [ ] `tt_timesheets` z RLS + UNIQUE constraint
- [ ] `POST /api/time-tracking/clock-in` — 409 przy podwójnym clock-in
- [ ] `POST /api/time-tracking/clock-out` — 404 bez aktywnej sesji
- [ ] Events emitowane: time.entry.clocked-in, time.entry.clocked-out, time.timesheet.submitted
- [ ] `modules/time-tracking/manifest.ts` z fills employees:detail-tab (stubs)
- [ ] `timeTrackingAPI.getMonthlyHours()` działa
- [ ] `npx tsc --noEmit` → clean
