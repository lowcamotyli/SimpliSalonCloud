# Sprint AF-06 — Absence + Payroll Module Manifests

> **⚡ Dispatch równolegle z:** [AF-04](AF-04-calendar-module-manifest.md) · [AF-05](AF-05-employees-crm-manifests.md)
> Wszystkie trzy sprinty to niezależne manifesty modułów — żaden nie zależy od drugiego.

## Cel
(P1) Manifesty i Public APIs dla modułów Absence i Payroll — oba bazują
na istniejących tabelach SimpliSalonCloud. Absence wymaga Employees (slot fill).
Payroll wymaga Employees + (docelowo) Time Tracking.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md. List: (1) absence.* events and their payloads, (2) payroll.* events, (3) how Absence fills employees:detail-tab slot, (4) what Payroll handles from Time Tracking events. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/MODULE-SYSTEM.md` | ModuleManifest, slot fills pattern |
| `docs/AppForge/EVENTS.md` | absence.*, payroll.*, time.timesheet.submitted |

**Kluczowe constraints:**
- Absence `fills: { 'employees:detail-tab-trigger': AbsenceTabTrigger, 'employees:detail-tab-content': AbsenceTabContent }`
- Absence `requires: ['employees']` — bez pracowników brak sensu
- Payroll `requires: ['employees']` — time-tracking będzie wymagany po AF-11, na razie enhances
- Istniejące tabele: `employee_absences` (SimpliSalon naming) — NIE `abs_requests` (to nowe w HCM)
- Payroll istniejące tabele: `payroll_entries`, `payroll_runs`
- Slot component `AbsenceTabTrigger` — stub (zwraca null) do czasu AF-10 HCM UI

## Work packages

Oba równolegle.

- ID: pkg-absence-manifest | Type: implementation | Worker: codex-main
  Outputs: modules/absence/manifest.ts, modules/absence/public-api.ts, modules/absence/config/

- ID: pkg-payroll-manifest | Type: implementation | Worker: codex-dad
  Outputs: modules/payroll/manifest.ts, modules/payroll/public-api.ts, modules/payroll/config/

## Prompt — codex-main (Absence manifest)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/MODULE-SYSTEM.md for ModuleManifest and slot fill pattern.
Read docs/AppForge/EVENTS.md for absence.* events.
Read lib/modules/types.ts for types.
Do NOT use Gemini — write directly.

Goal: Create Absence module manifest and public API.

File 1: modules/absence/manifest.ts
- id: 'absence', name: 'Nieobecności', category: 'hr'
- requires: ['employees'], enhances: ['calendar', 'payroll'], conflicts: []
- recommendedFor: all profiles
- navItems: [
    { path: 'employees/absences', label: 'Nieobecności', icon: 'CalendarOff', permission: 'absence:view' }
  ]
- permissions: absence:view, absence:request, absence:approve
- defaultRolePermissions:
    owner: [absence:view, absence:request, absence:approve]
    manager: [absence:view, absence:request, absence:approve]
    employee: [absence:view, absence:request]
- slots: {}
- fills: {
    'employees:detail-tab-trigger': AbsenceTabTrigger (stub: () => null),
    'employees:detail-tab-content': AbsenceTabContent (stub: () => null),
  }
  Note: Stubs — real components added in AF-10
- emits: ['absence.requested', 'absence.approved', 'absence.rejected']
- handles: ['employee.deactivated']
- migrations: []
- lifecycle: stubs

File 2: modules/absence/public-api.ts
- Export interface AbsencePublicAPI:
  isEmployeeAbsent(employeeId: string, date: Date, workspaceId: string): Promise<boolean>
  getAbsencesForEmployee(employeeId: string, from: Date, to: Date, workspaceId: string): Promise<AbsenceEntry[]>
  getPendingApprovals(workspaceId: string): Promise<AbsenceEntry[]>
- AbsenceEntry: { id: string; employeeId: string; startDate: Date; endDate: Date; reason?: string; status: string }
- Implement using existing 'employee_absences' table (column: salon_id)
- Export singleton: export const absenceAPI: AbsencePublicAPI

File 3: modules/absence/config/schema.ts + defaults.ts
- schema: z.object({
    approvalRequired: z.boolean().default(true),
    types: z.array(z.object({ code: z.string(), name: z.string(), daysPerYear: z.number().nullable() }))
      .default([{ code: 'vacation', name: 'Urlop', daysPerYear: 26 }, { code: 'sick', name: 'Chorobowe', daysPerYear: null }])
  })

Constraints: Use 'employee_absences' table (not 'abs_requests' — that's future HCM). salon_id column.
Done when: tsc passes."
```

## Prompt — codex-dad (Payroll manifest)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md for ModuleManifest interface.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md for payroll.* events.
Read /mnt/d/SimpliSalonCLoud/lib/modules/types.ts for types.

Goal: Create Payroll module manifest and public API.

File 1: /mnt/d/SimpliSalonCLoud/modules/payroll/manifest.ts
- id: 'payroll', name: 'Payroll', category: 'hr'
- requires: ['employees']
- enhances: ['time-tracking']  (will become required after AF-11)
- recommendedFor: ['beauty_salon', 'gym', 'agency']
- navItems: [
    { path: 'payroll', label: 'Payroll', icon: 'Banknote', permission: 'payroll:view' }
  ]
- permissions: payroll:view, payroll:manage
- defaultRolePermissions:
    owner: [payroll:view, payroll:manage]
    manager: [payroll:view]
    employee: []
- slots: {}
- fills: {
    'employees:detail-tab-trigger': PayrollTabTrigger (stub: () => null),
    'employees:detail-tab-content': PayrollTabContent (stub: () => null),
  }
- emits: ['payroll.run.created', 'payroll.run.approved', 'payroll.entry.exported']
- handles: ['time.timesheet.submitted', 'absence.approved', 'employee.contract.signed']
- migrations: []
- lifecycle: stubs

File 2: /mnt/d/SimpliSalonCLoud/modules/payroll/public-api.ts
- Export interface PayrollPublicAPI:
  getPayrollRunStatus(workspaceId: string, period: { from: Date; to: Date }): Promise<'open'|'approved'|'none'>
  getEmployeeEarnings(employeeId: string, workspaceId: string, period: { from: Date; to: Date }): Promise<number>
- Implement using existing 'payroll_entries' and 'payroll_runs' tables (salon_id column)
- Export singleton: export const payrollAPI: PayrollPublicAPI

File 3: /mnt/d/SimpliSalonCLoud/modules/payroll/config/schema.ts + defaults.ts
- schema: z.object({
    currency: z.string().default('PLN'),
    periodType: z.enum(['weekly', 'biweekly', 'monthly']).default('monthly'),
    payDay: z.number().int().min(1).max(31).default(10),
  })

Constraints: Use 'payroll_entries', 'payroll_runs' tables (existing). salon_id column.
Done when: tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Claude — registry update

```typescript
// lib/modules/registry.ts — dodaj:
import { absenceModule } from '@/modules/absence/manifest'
import { payrollModule } from '@/modules/payroll/manifest'

export const MODULE_REGISTRY: ModuleManifest[] = [
  calendarModule, employeesModule, crmModule,
  absenceModule, payrollModule,
]
```

## Verification

```bash
npx tsc --noEmit
# Sprawdź: absenceModule.requires zawiera 'employees'
# Sprawdź: absenceModule.fills ma 'employees:detail-tab-trigger' i 'employees:detail-tab-content'
# Sprawdź: absenceAPI.isEmployeeAbsent() jest type-safe
# Sprawdź: MODULE_REGISTRY ma 5 modułów
```

## Acceptance criteria

- [ ] `modules/absence/manifest.ts` — requires employees, fills employees slots (stubs)
- [ ] `modules/absence/public-api.ts` — isEmployeeAbsent() używa employee_absences table
- [ ] `modules/payroll/manifest.ts` — handles time.timesheet.submitted, absence.approved
- [ ] `modules/payroll/public-api.ts` — getEmployeeEarnings() używa payroll_entries
- [ ] Obie config/ schemas i defaults
- [ ] `lib/modules/registry.ts` — 5 modułów
- [ ] `npx tsc --noEmit` → clean
