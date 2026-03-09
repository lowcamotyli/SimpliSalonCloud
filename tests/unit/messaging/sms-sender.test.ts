import { describe, it, expect } from 'vitest'
import { normalizePolishPhoneToE164 } from '@/lib/messaging/sms-sender'

describe('normalizePolishPhoneToE164', () => {
  it('normalizes PL local number', () => {
    const result = normalizePolishPhoneToE164('500 600 700')
    expect(result).toBe('+48500600700')
  })

  it('keeps valid E.164', () => {
    const result = normalizePolishPhoneToE164('+48500600700')
    expect(result).toBe('+48500600700')
  })

  it('throws on invalid number', () => {
    expect(() => normalizePolishPhoneToE164('12')).toThrow()
  })
})
