import test from 'node:test'
import assert from 'node:assert/strict'
import { canGeneratePayroll, canSendPayrollEmails, canViewPayroll } from '@/lib/payroll/access'
import { payrollMonthSchema, sendPayrollEmailSchema } from '@/lib/validators/payroll.validators'
import { parsePayrollMonth } from '@/lib/payroll/period'

test('payroll RBAC: manager can view but cannot generate payroll', () => {
  assert.equal(canViewPayroll('manager'), true)
  assert.equal(canGeneratePayroll('manager'), false)
})

test('payroll RBAC: employee cannot view or generate payroll', () => {
  assert.equal(canViewPayroll('employee'), false)
  assert.equal(canGeneratePayroll('employee'), false)
})

test('payroll email RBAC: owner and manager can send, employee cannot', () => {
  assert.equal(canSendPayrollEmails('owner'), true)
  assert.equal(canSendPayrollEmails('manager'), true)
  assert.equal(canSendPayrollEmails('employee'), false)
})

test('payroll month parser accepts valid YYYY-MM and computes period boundaries', () => {
  const parsed = parsePayrollMonth('2026-02')

  assert.equal(parsed.month, '2026-02')
  assert.equal(parsed.periodStart.getFullYear(), 2026)
  assert.equal(parsed.periodStart.getMonth(), 1)
  assert.equal(parsed.periodStart.getDate(), 1)

  assert.equal(parsed.periodEnd.getFullYear(), 2026)
  assert.equal(parsed.periodEnd.getMonth(), 1)
  assert.equal(parsed.periodEnd.getDate(), 28)
})

test('payroll month parser rejects invalid month values', () => {
  assert.throws(() => payrollMonthSchema.parse('2026-13'))
  assert.throws(() => payrollMonthSchema.parse('2026-00'))
  assert.throws(() => payrollMonthSchema.parse('2026-2'))
})

test('send payroll email schema validates strict payload', () => {
  const payload = {
    employeeId: '3f2df4d0-cc98-4c0e-b5e9-dc2ac4b715f8',
    employeeName: 'Jan Kowalski',
    month: '2026-02',
    totalPayout: 1234.56,
  }

  const result = sendPayrollEmailSchema.parse(payload)
  assert.equal(result.employeeName, 'Jan Kowalski')
  assert.equal(result.totalPayout, 1234.56)
})

test('send payroll email schema rejects malformed payload', () => {
  assert.throws(() => sendPayrollEmailSchema.parse({
    employeeId: 'not-a-uuid',
    employeeName: '',
    month: '2026-99',
    totalPayout: -10,
  }))
})

