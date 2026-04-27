import { describe, expect, it } from 'vitest'
import { buildSalonSlotUtcRange, toSalonLocalMinuteBlock } from '@/lib/utils/equipment-timezone'

describe('equipment timezone utilities', () => {
  it('maps salon local slot in non-UTC timezone to UTC ISO range', () => {
    const range = buildSalonSlotUtcRange('2026-05-10', '10:00', 30, 'Europe/Warsaw')
    expect(range).toEqual({
      startsAtIso: '2026-05-10T08:00:00.000Z',
      endsAtIso: '2026-05-10T08:30:00.000Z',
    })
  })

  it('maps equipment booking UTC range into local day minute block', () => {
    const block = toSalonLocalMinuteBlock(
      {
        starts_at: '2026-05-10T08:00:00.000Z',
        ends_at: '2026-05-10T08:30:00.000Z',
      },
      'Europe/Warsaw',
      '2026-05-10'
    )
    expect(block).toEqual([600, 630])
  })

  it('throws for nonexistent local time at DST jump', () => {
    expect(() => buildSalonSlotUtcRange('2026-03-29', '02:30', 30, 'Europe/Warsaw')).toThrow(
      'Provided local datetime is invalid for selected timezone'
    )
  })
})
