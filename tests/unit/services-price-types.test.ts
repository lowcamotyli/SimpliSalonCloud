import { describe, expect, it } from 'vitest'
import {
  normalizeServicePriceType,
  resolveBookingBasePrice,
  resolvePublicServicePrice,
} from '@/lib/services/price-types'

describe('service price type helpers', () => {
  it('normalizes unsupported values to fixed', () => {
    expect(normalizeServicePriceType(undefined)).toBe('fixed')
    expect(normalizeServicePriceType(null)).toBe('fixed')
    expect(normalizeServicePriceType('unknown')).toBe('fixed')
    expect(normalizeServicePriceType('hidden')).toBe('hidden')
  })

  it('hides public raw price for hidden type', () => {
    expect(resolvePublicServicePrice(120, 'hidden')).toBeNull()
    expect(resolvePublicServicePrice(120, 'fixed')).toBe(120)
  })

  it('maps base_price snapshot for all public booking price types', () => {
    expect(resolveBookingBasePrice(120, 'fixed')).toBe(120)
    expect(resolveBookingBasePrice(90, 'from')).toBe(90)
    expect(resolveBookingBasePrice(70, 'variable')).toBe(70)
    expect(resolveBookingBasePrice(200, 'hidden')).toBe(0)
    expect(resolveBookingBasePrice(0, 'free')).toBe(0)
  })
})
