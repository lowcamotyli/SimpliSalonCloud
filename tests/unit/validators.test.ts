import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmployeeSchema } from '@/lib/validators/employee.validators'
import { createClientSchema } from '@/lib/validators/client.validators'

test('employee validator accepts valid employee payload', () => {
    const result = createEmployeeSchema.safeParse({
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna@example.com',
      phone: '123456789',
      baseThreshold: 0,
      baseSalary: 1000,
      commissionRate: 0.2,
      avatarUrl: 'https://example.com/avatar.jpg',
      active: true,
    })

    assert.equal(result.success, true)
})

test('employee validator rejects invalid employee email', () => {
    const result = createEmployeeSchema.safeParse({
      firstName: 'Anna',
      email: 'not-an-email',
      baseThreshold: 0,
      baseSalary: 0,
      commissionRate: 0,
      active: true,
    })

    assert.equal(result.success, false)
})

test('client validator accepts valid client payload', () => {
    const result = createClientSchema.safeParse({
      salon_id: '123e4567-e89b-12d3-a456-426614174000',
      first_name: 'Jan',
      last_name: 'Kowalski',
      phone: '+48123456789',
      email: 'jan@example.com',
      notes: 'VIP',
    })

    assert.equal(result.success, true)
})

test('client validator rejects invalid phone format', () => {
    const result = createClientSchema.safeParse({
      salon_id: '123e4567-e89b-12d3-a456-426614174000',
      first_name: 'Jan',
      last_name: 'Kowalski',
      phone: 'abc',
    })

    assert.equal(result.success, false)
})

