# Sprint AF-05 — Employees + CRM Module Manifests + Public APIs

> **⚡ Dispatch równolegle z:** [AF-04](AF-04-calendar-module-manifest.md) · [AF-06](AF-06-absence-payroll-manifests.md)
> Wszystkie trzy sprinty to niezależne manifesty modułów — żaden nie zależy od drugiego.

## Cel
(P1) Manifesty i Public APIs dla modułów Employees (podstawowy, przed HCM upgrade)
i CRM. Wzorzec identyczny jak AF-04 (Calendar). Oba moduły równolegle.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md and /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md. List: (1) employee.* events, (2) what slots employees module offers, (3) what CRM module handles from calendar events. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/AppForge/MODULE-SYSTEM.md` | ModuleManifest interface, slot system |
| `docs/AppForge/EVENTS.md` | employee.* events, CRM handles booking.completed |
| `docs/AppForge/SECURITY.md` | permissions per moduł |

**Kluczowe constraints:**
- Employees slots: `detail-tab-trigger`, `detail-tab-content` — używane przez Absence, Time Tracking, Payroll
- CRM handles: `booking.completed` (dodaje do historii klienta), `booking.created` (triggeruje automations)
- Employees Public API: `listActiveEmployees()` — używane przez Calendar availability check
- CRM Public API: uproszczony — tylko `getClientHistory()` potrzebne innym modułom
- Istniejące tabele: `employees` (nie `hr_employees` — to HCM upgrade w AF-08)

## Work packages

Oba równolegle — brak zależności między Employees i CRM.

- ID: pkg-employees-manifest | Type: implementation | Worker: codex-main
  Outputs: modules/employees/manifest.ts, modules/employees/public-api.ts, modules/employees/config/

- ID: pkg-crm-manifest | Type: implementation | Worker: codex-dad
  Outputs: modules/crm/manifest.ts, modules/crm/public-api.ts, modules/crm/config/

- ID: pkg-registry | Worker: Claude (< 5 linii)
  Output: lib/modules/registry.ts — dodaj employeesModule + crmModule

## Prompt — codex-main (Employees manifest)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read docs/AppForge/MODULE-SYSTEM.md for ModuleManifest interface.
Read docs/AppForge/EVENTS.md for employee.* events and slot patterns.
Read lib/modules/types.ts for TypeScript types.
Do NOT use Gemini — write directly.

Goal: Create Employees module manifest and public API.

File 1: modules/employees/manifest.ts
- id: 'employees', name: 'Pracownicy', category: 'hr'
- requires: [], enhances: ['calendar', 'payroll'], conflicts: []
- recommendedFor: all profiles
- navItems: [
    { path: 'employees', label: 'Pracownicy', icon: 'Users', permission: 'employees:view' }
  ]
- permissions: employees:view, employees:manage, employees:view_sensitive, employees:manage_sensitive
- defaultRolePermissions: owner all, manager: view+manage (not sensitive), employee: none
- slots: {
    'detail-tab-trigger': { description: 'Tab trigger in employee detail page', props: { employeeId: 'string' } },
    'detail-tab-content': { description: 'Tab content in employee detail page', props: { employeeId: 'string' } },
    'list-column': { description: 'Extra column in employees list', props: { employeeId: 'string' } },
  }
- fills: {}
- emits: ['employee.created', 'employee.deactivated', 'employee.contract.signed']
- handles: []
- migrations: []
- lifecycle: stubs (async functions that do nothing)

File 2: modules/employees/public-api.ts
- Export interface EmployeesPublicAPI:
  getEmployee(id: string, workspaceId: string): Promise<Employee | null>
  listActiveEmployees(workspaceId: string): Promise<Employee[]>
  isEmployeeAvailable(employeeId: string, from: Date, to: Date, workspaceId: string): Promise<boolean>
- Employee type: { id: string; firstName: string; lastName: string; email?: string }
- Implement using existing 'employees' table (column: salon_id)
- isEmployeeAvailable: checks employee_absences (date range) and time_reservations
- Export singleton: export const employeesAPI: EmployeesPublicAPI

File 3: modules/employees/config/schema.ts
- z.object({
    contractTypes: z.array(z.string()).default(['employment', 'b2b']),
    documentCategories: z.array(z.string()).default(['id_card', 'cv', 'certificate']),
    departments: z.array(z.string()).default([]),
  })

File 4: modules/employees/config/defaults.ts — defaults from schema

Constraints: DO NOT modify any existing files. Use 'salon_id' (not workspace_id) for DB queries.
Done when: tsc passes."
```

## Prompt — codex-dad (CRM manifest)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/MODULE-SYSTEM.md for ModuleManifest interface.
Read /mnt/d/SimpliSalonCLoud/docs/AppForge/EVENTS.md for CRM event handling.
Read /mnt/d/SimpliSalonCLoud/lib/modules/types.ts for TypeScript types.

Goal: Create CRM module manifest and public API.

File 1: /mnt/d/SimpliSalonCLoud/modules/crm/manifest.ts
- id: 'crm', name: 'CRM', category: 'sales'
- requires: [], enhances: ['calendar', 'notifications'], conflicts: []
- recommendedFor: ['beauty_salon', 'gym', 'agency']
- navItems: [
    { path: 'clients', label: 'Klienci', icon: 'Users2', permission: 'crm:view' },
    { path: 'clients/campaigns', label: 'Kampanie', icon: 'Megaphone', permission: 'crm:manage' },
    { path: 'clients/automations', label: 'Automatyzacje', icon: 'Zap', permission: 'crm:manage' },
  ]
- permissions: crm:view, crm:manage
- defaultRolePermissions: owner: [crm:view, crm:manage], manager: [crm:view, crm:manage], employee: [crm:view]
- slots: {}
- fills: {}
- emits: ['crm.message.sent', 'crm.campaign.completed']
- handles: ['booking.completed', 'booking.created']
- migrations: []
- lifecycle: stubs

File 2: /mnt/d/SimpliSalonCLoud/modules/crm/public-api.ts
- Export interface CrmPublicAPI:
  getClientHistory(clientId: string, workspaceId: string): Promise<BookingHistoryItem[]>
  getClientCount(workspaceId: string): Promise<number>
- BookingHistoryItem: { bookingId: string; serviceId: string; completedAt: Date }
- Implement using existing bookings + clients tables (filter by salon_id)
- Export singleton: export const crmAPI: CrmPublicAPI

File 3: /mnt/d/SimpliSalonCLoud/modules/crm/config/schema.ts
- z.object({
    channels: z.array(z.enum(['sms', 'email'])).default(['sms', 'email']),
    automationsEnabled: z.boolean().default(true),
    campaignsEnabled: z.boolean().default(true),
  })

File 4: /mnt/d/SimpliSalonCLoud/modules/crm/config/defaults.ts

Constraints: DO NOT modify any existing file. salon_id in DB queries.
Done when: tsc passes." bash ~/.claude/scripts/dad-exec.sh
```

## Claude — registry update

```typescript
// lib/modules/registry.ts — dodaj:
import { employeesModule } from '@/modules/employees/manifest'
import { crmModule } from '@/modules/crm/manifest'

export const MODULE_REGISTRY: ModuleManifest[] = [
  calendarModule,
  employeesModule,
  crmModule,
]
```

## Verification

```bash
npx tsc --noEmit
# Sprawdź: MODULE_REGISTRY ma 3 moduły
# Sprawdź: employeesAPI.listActiveEmployees() jest type-safe
# Sprawdź: crmModule.handles zawiera 'booking.completed'
```

## Acceptance criteria

- [ ] `modules/employees/manifest.ts` — slots: detail-tab-trigger, detail-tab-content, list-column
- [ ] `modules/employees/public-api.ts` — isEmployeeAvailable() z checks absences + time_reservations
- [ ] `modules/crm/manifest.ts` — handles booking.completed, booking.created
- [ ] `modules/crm/public-api.ts` — getClientHistory()
- [ ] Obie config/ schemas i defaults
- [ ] `lib/modules/registry.ts` — 3 moduły w MODULE_REGISTRY
- [ ] `npx tsc --noEmit` → clean
