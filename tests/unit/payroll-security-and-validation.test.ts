import { describe, it, expect } from 'vitest'
import { canGeneratePayroll, canSendPayrollEmails, canViewPayroll } from '@/lib/payroll/access'
import { payrollMonthSchema, sendPayrollEmailSchema } from '@/lib/validators/payroll.validators'
import { parsePayrollMonth } from '@/lib/payroll/period'

describe('payroll RBAC', () => {
  it('manager can view but cannot generate payroll', () => {
    expect(canViewPayroll('manager')).toBe(true)
    expect(canGeneratePayroll('manager')).toBe(false)
  })

  it('employee cannot view or generate payroll', () => {
    expect(canViewPayroll('employee')).toBe(false)
    expect(canGeneratePayroll('employee')).toBe(false)
  })

  it('owner and manager can send payroll emails, employee cannot', () => {
    expect(canSendPayrollEmails('owner')).toBe(true)
    expect(canSendPayrollEmails('manager')).toBe(true)
    expect(canSendPayrollEmails('employee')).toBe(false)
  })
})

describe('payroll month parser', () => {
  it('accepts valid YYYY-MM and computes period boundaries', () => {
    const parsed = parsePayrollMonth('2026-02')

    expect(parsed.month).toBe('2026-02')
    expect(parsed.periodStart.getFullYear()).toBe(2026)
    expect(parsed.periodStart.getMonth()).toBe(1)
    expect(parsed.periodStart.getDate()).toBe(1)
    expect(parsed.periodEnd.getFullYear()).toBe(2026)
    expect(parsed.periodEnd.getMonth()).toBe(1)
    expect(parsed.periodEnd.getDate()).toBe(28)
  })

  it('rejects invalid month values', () => {
    expect(() => payrollMonthSchema.parse('2026-13')).toThrow()
    expect(() => payrollMonthSchema.parse('2026-00')).toThrow()
    expect(() => payrollMonthSchema.parse('2026-2')).toThrow()
  })
})

describe('send payroll email schema', () => {
  it('validates strict payload', () => {
    const payload = {
      employeeId: '3f2df4d0-cc98-4c0e-b5e9-dc2ac4b715f8',
      employeeName: 'Jan Kowalski',
      month: '2026-02',
      totalPayout: 1234.56,
    }

    const result = sendPayrollEmailSchema.parse(payload)
    expect(result.employeeName).toBe('Jan Kowalski')
    expect(result.totalPayout).toBe(1234.56)
  })

  it('rejects malformed payload', () => {
    expect(() =>
      sendPayrollEmailSchema.parse({
        employeeId: 'not-a-uuid',
        employeeName: '',
        month: '2026-99',
        totalPayout: -10,
      })
    ).toThrow()
  })
})
