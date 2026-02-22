type PayrollRole = 'owner' | 'manager' | 'employee' | null | undefined

export function canViewPayroll(role: PayrollRole): boolean {
  return role === 'owner' || role === 'manager'
}

export function canGeneratePayroll(role: PayrollRole): boolean {
  return role === 'owner'
}

export function canSendPayrollEmails(role: PayrollRole): boolean {
  return role === 'owner' || role === 'manager'
}

