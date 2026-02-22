import test from 'node:test'
import assert from 'node:assert/strict'
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

test('BooksyProcessor: idempotency returns existing booking for duplicated eventId before parsing', async () => {
  const existingBooking = {
    id: 'booking-1',
    salon_id: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8',
    source: 'booksy',
    notes: '[booksy_event_id:evt-123]',
  }

  const supabaseMock = {
    from: (table: string) => {
      assert.equal(table, 'bookings')
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

  assert.equal(result.success, true)
  assert.equal(result.deduplicated, true)
  assert.equal(result.booking.id, 'booking-1')
})

