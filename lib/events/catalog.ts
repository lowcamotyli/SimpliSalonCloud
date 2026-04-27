import { z } from 'zod'

export const EVENT_CATALOG = {
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
  }),
  'booking.completed': z.object({
    bookingId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    actualDurationMinutes: z.number().int(),
  }),
  'employee.created': z.object({
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  }),
  'employee.deactivated': z.object({
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    effectiveDate: z.string().date(),
  }),
  'employee.contract.signed': z.object({
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    contractId: z.string().uuid(),
    contractType: z.string(),
    startDate: z.string().date(),
  }),
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
  'time.timesheet.submitted': z.object({
    timesheetId: z.string().uuid(),
    employeeId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    totalHours: z.number(),
  }),
  'payroll.run.created': z.object({
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
  }),
  'payroll.run.approved': z.object({
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    approvedBy: z.string().uuid(),
  }),
} as const satisfies Record<string, z.ZodSchema>

export type EventType = keyof typeof EVENT_CATALOG
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_CATALOG)[T]>
