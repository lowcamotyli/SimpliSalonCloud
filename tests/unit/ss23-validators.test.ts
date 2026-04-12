import { describe, expect, it } from 'vitest'
import { publicBookingSchema } from '@/lib/validators/public-booking.validators'
import { createServiceSchema, updateServiceSchema } from '@/lib/validators/service.validators'
import { updateClientSchema } from '@/lib/validators/client.validators'

const UUID = '123e4567-e89b-42d3-a456-426614174000'

describe('SS2.3 validators', () => {
  it('accepts public booking payload with terms_accepted enabled', () => {
    const result = publicBookingSchema.safeParse({
      name: 'Anna Kowalska',
      phone: '+48123456789',
      email: 'anna@example.com',
      serviceId: UUID,
      employeeId: UUID,
      date: '2026-04-09',
      time: '10:30',
      terms_accepted: true,
    })

    expect(result.success).toBe(true)
  })

  it('accepts service description up to 1000 characters', () => {
    const result = createServiceSchema.safeParse({
      salon_id: UUID,
      name: 'Koloryzacja premium',
      category: 'Koloryzacja',
      subcategory: 'Baleyage',
      duration: 90,
      price: 250,
      description: 'a'.repeat(1000),
    })

    expect(result.success).toBe(true)
  })

  it('rejects service description longer than 1000 characters', () => {
    const result = updateServiceSchema.safeParse({
      description: 'a'.repeat(1001),
    })

    expect(result.success).toBe(false)
  })

  it('accepts client tags in update payload', () => {
    const result = updateClientSchema.safeParse({
      tags: ['VIP', 'stały klient'],
    })

    expect(result.success).toBe(true)
  })
})
