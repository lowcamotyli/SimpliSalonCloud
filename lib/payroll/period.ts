import { endOfMonth, startOfMonth } from 'date-fns'
import { payrollMonthSchema } from '@/lib/validators/payroll.validators'

export function parsePayrollMonth(input: string): {
  month: string
  periodStart: Date
  periodEnd: Date
} {
  const month = payrollMonthSchema.parse(input)
  const [yearPart, monthPart] = month.split('-')
  const year = Number(yearPart)
  const monthNumber = Number(monthPart)
  const periodStart = startOfMonth(new Date(year, monthNumber - 1))
  const periodEnd = endOfMonth(new Date(year, monthNumber - 1))

  return {
    month,
    periodStart,
    periodEnd,
  }
}

