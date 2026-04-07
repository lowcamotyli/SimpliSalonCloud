import {
  endOfDay,
  endOfISOWeek,
  endOfMonth,
  isValid,
  parseISO,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
} from 'date-fns'
import { payrollMonthSchema } from '@/lib/validators/payroll.validators'

export type PayrollPeriodType = 'daily' | 'weekly' | 'monthly'

export interface PeriodRange {
  periodStart: Date
  periodEnd: Date
}

export function getPeriodRange(period: string, type: PayrollPeriodType): PeriodRange {
  if (type === 'daily') {
    const date = parseISO(period)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || !isValid(date)) {
      throw new Error('Invalid daily period format (expected YYYY-MM-DD)')
    }

    return {
      periodStart: startOfDay(date),
      periodEnd: endOfDay(date),
    }
  }

  if (type === 'weekly') {
    if (!/^\d{4}-W\d{2}$/.test(period)) {
      throw new Error('Invalid weekly period format (expected YYYY-WNN)')
    }

    const [yearPart, weekPart] = period.split('-W')
    const year = Number(yearPart)
    const week = Number(weekPart)

    if (!Number.isInteger(week) || week < 1 || week > 53) {
      throw new Error('Invalid weekly period value (expected week 01-53)')
    }

    const firstWeekStart = startOfISOWeek(new Date(year, 0, 4))
    const weekStart = new Date(firstWeekStart)
    weekStart.setDate(firstWeekStart.getDate() + (week - 1) * 7)

    return {
      periodStart: startOfISOWeek(weekStart),
      periodEnd: endOfISOWeek(weekStart),
    }
  }

  const month = payrollMonthSchema.parse(period)
  const [yearPart, monthPart] = month.split('-')
  const year = Number(yearPart)
  const monthNumber = Number(monthPart)
  const date = new Date(year, monthNumber - 1)

  return {
    periodStart: startOfMonth(date),
    periodEnd: endOfMonth(date),
  }
}

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

