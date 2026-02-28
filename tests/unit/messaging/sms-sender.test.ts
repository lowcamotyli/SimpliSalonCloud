import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePolishPhoneToE164 } from '@/lib/messaging/sms-sender'

test('normalizePolishPhoneToE164 normalizes PL local number', () => {
  const result = normalizePolishPhoneToE164('500 600 700')
  assert.equal(result, '+48500600700')
})

test('normalizePolishPhoneToE164 keeps valid E.164', () => {
  const result = normalizePolishPhoneToE164('+48500600700')
  assert.equal(result, '+48500600700')
})

test('normalizePolishPhoneToE164 throws on invalid number', () => {
  assert.throws(() => normalizePolishPhoneToE164('12'))
})

