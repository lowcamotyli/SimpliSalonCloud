import { describe, it, expect } from 'vitest'
import { BooksyProcessor } from '@/lib/booksy/processor'

type QueryResult<T> = { data: T | null; error: null }

class BookingQueryMock {
  private readonly result: QueryResult<Record<string, unknown>>

  constructor(result: QueryResult<Record<string, unknown>>) {
    this.result = result
  }

  select() {
    return this
  }

  eq() {
    return this
  }

  maybeSingle() {
    return Promise.resolve(this.result)
  }
}

describe('BooksyProcessor', () => {
  it('idempotency returns existing booking for duplicated eventId before parsing', async () => {
    const existingBooking = {
      id: 'booking-1',
      salon_id: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8',
      source: 'booksy',
      notes: '[booksy_event_id:evt-123]',
    }

    const supabaseMock = {
      from: (table: string) => {
        expect(table).toBe('bookings')
        return new BookingQueryMock({ data: existingBooking, error: null })
      },
    }

    const processor = new BooksyProcessor(
      supabaseMock as unknown as ConstructorParameters<typeof BooksyProcessor>[0],
      'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8'
    )

    const result = await processor.processEmail('INVALID SUBJECT', 'INVALID BODY', {
      eventId: 'evt-123',
    })

    expect(result.success).toBe(true)
    expect(result.deduplicated).toBe(true)
    expect(result.booking.id).toBe('booking-1')
  })

  it('parses reschedule old date/time when year and time are glued (e.g. 202614:30)', () => {
    const supabaseMock = {
      from: () => new BookingQueryMock({ data: null, error: null }),
    }

    const processor = new BooksyProcessor(
      supabaseMock as unknown as ConstructorParameters<typeof BooksyProcessor>[0],
      'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8'
    ) as unknown as { parseEmail: (subject: string, body: string) => any }

    const parsed = processor.parseEmail(
      'Zmiany w rezerwacji sroda, 13 maja 2026 o 14:30',
      [
        'Ewa Lis',
        '123 456 789',
        'Ewa Lis przesunela swoja wizyte Przedluzenie paznokci L/XL z dnia sroda, 13 maja 202614:30 na inny termin.',
        '',
        'poniedzialek, 17 czerwca 2026, 14:00 - 15:00',
        '',
        'Pracownik: Alex',
      ].join('\n')
    )

    expect(parsed).toMatchObject({
      type: 'reschedule',
      clientName: 'Ewa Lis',
      oldDate: '2026-05-13',
      oldTime: '14:30',
      bookingDate: '2026-06-17',
      bookingTime: '14:00',
    })
  })
})
