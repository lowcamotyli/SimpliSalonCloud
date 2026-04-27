# AppForge — Events & Cross-Module Communication

## Zasada komunikacji między modułami

```
Moduł A NIGDY nie importuje z modules/B/lib/db/
Moduł A używa:
  1. PublicAPI    → synchroniczny odczyt danych z B
  2. EventBus     → asynchroniczne reakcje na zdarzenia z B
  3. ModuleSlot   → UI injection (patrz MODULE-SYSTEM.md)
```

## Public APIs — cross-module queries

```typescript
// modules/employees/public-api.ts
export interface EmployeesPublicAPI {
  getEmployee(id: string, workspaceId: string): Promise<Employee | null>
  listActiveEmployees(workspaceId: string): Promise<Employee[]>
  isEmployeeAvailable(employeeId: string, from: Date, to: Date): Promise<boolean>
  getEmployeeCurrentContract(employeeId: string, workspaceId: string): Promise<Contract | null>
}

// modules/absence/public-api.ts
export interface AbsencePublicAPI {
  getAbsenceBalance(employeeId: string, typeCode: string, year: number): Promise<number>
  isEmployeeAbsent(employeeId: string, date: Date): Promise<boolean>
  getPendingApprovals(workspaceId: string): Promise<AbsenceRequest[]>
}

// modules/time-tracking/public-api.ts
export interface TimeTrackingPublicAPI {
  getMonthlyHours(employeeId: string, month: Date): Promise<number>
  getApprovedEntries(employeeId: string, from: Date, to: Date): Promise<TimeEntry[]>
}

// lib/modules/public-apis.ts — centralny rejestr
export const MODULE_APIS = {
  employees: () => import('@/modules/employees/public-api').then(m => m.employeesAPI),
  absence:   () => import('@/modules/absence/public-api').then(m => m.absenceAPI),
  timeTracking: () => import('@/modules/time-tracking/public-api').then(m => m.timeTrackingAPI),
}
```

## Event Catalog — kontrakt (Zod schemas)

```typescript
// lib/events/catalog.ts
export const EVENT_CATALOG = {

  // ── Calendar ──────────────────────────────────────────────
  'booking.created': z.object({
    bookingId: z.string().uuid(), workspaceId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
    serviceId: z.string().uuid(),
    startsAt: z.string().datetime(), endsAt: z.string().datetime(),
    source: z.enum(['manual', 'online', 'import']),
  }),
  'booking.cancelled': z.object({
    bookingId: z.string().uuid(), workspaceId: z.string().uuid(),
    reason: z.string().optional(),
    cancelledBy: z.enum(['client', 'workspace', 'system']),
  }),
  'booking.completed': z.object({
    bookingId: z.string().uuid(), workspaceId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    actualDurationMinutes: z.number().int(),
  }),

  // ── Employees ─────────────────────────────────────────────
  'employee.created': z.object({
    employeeId: z.string().uuid(), workspaceId: z.string().uuid(),
  }),
  'employee.deactivated': z.object({
    employeeId: z.string().uuid(), workspaceId: z.string().uuid(),
    effectiveDate: z.string().date(),
  }),
  'employee.contract.signed': z.object({
    employeeId: z.string().uuid(), workspaceId: z.string().uuid(),
    contractId: z.string().uuid(), contractType: z.string(),
    startDate: z.string().date(),
  }),

  // ── Absence ───────────────────────────────────────────────
  'absence.requested': z.object({
    absenceId: z.string().uuid(), employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(), absenceType: z.string(),
    startDate: z.string().date(), endDate: z.string().date(),
    daysCount: z.number(),
  }),
  'absence.approved': z.object({
    absenceId: z.string().uuid(), employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(), approvedBy: z.string().uuid(),
  }),
  'absence.rejected': z.object({
    absenceId: z.string().uuid(), employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(), reason: z.string().optional(),
  }),

  // ── Time Tracking ─────────────────────────────────────────
  'time.entry.clocked-in': z.object({
    entryId: z.string().uuid(), employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(), clockedAt: z.string().datetime(),
  }),
  'time.entry.clocked-out': z.object({
    entryId: z.string().uuid(), employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    clockedAt: z.string().datetime(), durationMinutes: z.number().int(),
  }),
  'time.timesheet.submitted': z.object({
    timesheetId: z.string().uuid(), employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    periodStart: z.string().date(), periodEnd: z.string().date(),
    totalHours: z.number(),
  }),

  // ── Payroll ───────────────────────────────────────────────
  'payroll.run.created': z.object({
    runId: z.string().uuid(), workspaceId: z.string().uuid(),
    periodStart: z.string().date(), periodEnd: z.string().date(),
  }),
  'payroll.run.approved': z.object({
    runId: z.string().uuid(), workspaceId: z.string().uuid(),
    approvedBy: z.string().uuid(),
  }),

} as const satisfies Record<string, z.ZodSchema>

export type EventType = keyof typeof EVENT_CATALOG
export type EventPayload<T extends EventType> = z.infer<typeof EVENT_CATALOG[T]>
```

## EventBus — użycie

```typescript
import { eventBus } from '@/lib/events/bus'

// Publikowanie (w lib/ modułu, po operacji DB):
await eventBus.emit('absence.approved', {
  absenceId, employeeId, workspaceId, approvedBy
})

// Subskrypcja (w module który reaguje — w module/init.ts lub server startup):
eventBus.on('absence.approved', async ({ payload }) => {
  // Zablokuj dni w kalendarzu pracownika
  await calendarAPI.blockDays(payload.employeeId, ...)
})
```

## Powiązania domenowe — tabela zdarzeń

| Zdarzenie | Emituje | Obsługuje |
|-----------|---------|-----------|
| `booking.completed` | calendar | crm (historia klienta) |
| `employee.deactivated` | employees | calendar (anuluj przyszłe), absence (zamknij wnioski) |
| `absence.approved` | absence | calendar (blokuj dni), payroll (oznacz) |
| `time.timesheet.submitted` | time-tracking | payroll (odblokuj obliczenia) |
| `employee.contract.signed` | employees | payroll (aktualizuj stawkę) |

## Zasady

- Event handler musi być idempotentny (może być wywołany wielokrotnie)
- Błąd w jednym handlerze nie blokuje innych (Promise.allSettled)
- Eventy są walidowane przez Zod przed emisją
- Nowy event → dodaj do EVENT_CATALOG PRZED implementacją handlera
