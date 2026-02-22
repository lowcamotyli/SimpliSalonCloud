import { z } from 'zod'

export const payrollMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Invalid month format (expected YYYY-MM)')
  .refine((value) => {
    const [, monthPart] = value.split('-')
    const month = Number(monthPart)
    return Number.isInteger(month) && month >= 1 && month <= 12
  }, 'Invalid month value (expected 01-12)')

export const sendPayrollEmailSchema = z.object({
  employeeId: z.string().uuid('Invalid employeeId format'),
  employeeName: z.string().trim().min(1, 'employeeName is required').max(120),
  month: payrollMonthSchema,
  totalPayout: z.number().finite().min(0, 'totalPayout must be >= 0'),
})

export type SendPayrollEmailInput = z.infer<typeof sendPayrollEmailSchema>
