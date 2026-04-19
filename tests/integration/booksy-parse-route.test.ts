import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { loadBooksyFixture } from '@/tests/fixtures/booksy/helpers'

const {
  createAdminSupabaseClientMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createAdminSupabaseClientMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  },
}))

import { POST } from '@/app/api/internal/booksy/parse/route'

type RawEmailRow = {
  id: string
  salon_id: string
  subject: string
  from_address: string | null
  storage_path: string | null
  parse_status: 'pending' | 'parsed' | 'failed'
}

function makeRequest(secret?: string) {
  return new NextRequest('http://localhost/api/internal/booksy/parse', {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

function createRawEmailQuery(rawEmails: RawEmailRow[]) {
  let parseStatusFilter: string | null = null

  return {
    select: vi.fn(() => ({
      eq: vi.fn((column: string, value: string) => {
        if (column === 'parse_status') {
          parseStatusFilter = value
        }

        return {
          limit: vi.fn(async (limitValue: number) => ({
            data: rawEmails
              .filter((row) => (parseStatusFilter ? row.parse_status === parseStatusFilter : true))
              .slice(0, limitValue),
            error: null,
          })),
        }
      }),
    })),
    update: vi.fn((payload: Pick<RawEmailRow, 'parse_status'>) => ({
      eq: vi.fn((idColumn: string, idValue: string) => ({
        eq: vi.fn(async (salonColumn: string, salonValue: string) => {
          const row = rawEmails.find((item) => item[idColumn as keyof RawEmailRow] === idValue)

          if (!row || idColumn !== 'id' || salonColumn !== 'salon_id' || row.salon_id !== salonValue) {
            return { error: { message: 'Raw email not found' } }
          }

          row.parse_status = payload.parse_status
          return { error: null }
        }),
      })),
    })),
  }
}

function createSupabaseStub(options: {
  rawEmails: RawEmailRow[]
  storageBodies: Record<string, string>
  onParsedEventUpsert?: (payload: any) => { data: Array<{ id: string }>; error: null } | { data: null; error: { message: string } }
}) {
  const insertedParsedEvents: any[] = []

  return {
    insertedParsedEvents,
    client: {
      storage: {
        from: vi.fn((bucket: string) => {
          if (bucket !== 'booksy-raw-emails') {
            throw new Error(`Unexpected bucket ${bucket}`)
          }

          return {
            download: vi.fn(async (path: string) => {
              if (!(path in options.storageBodies)) {
                return { data: null, error: { message: `Missing storage object ${path}` } }
              }

              return {
                data: new Blob([options.storageBodies[path]]),
                error: null,
              }
            }),
          }
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'booksy_raw_emails') {
          return createRawEmailQuery(options.rawEmails)
        }

        if (table === 'booksy_parsed_events') {
          return {
            upsert: vi.fn((payload: any) => {
              insertedParsedEvents.push(payload)
              const result = options.onParsedEventUpsert?.(payload) ?? {
                data: [{ id: `parsed-${insertedParsedEvents.length}` }],
                error: null,
              }

              return {
                select: vi.fn(async () => result),
              }
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
}

describe('Booksy parse worker route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  it('rejects unauthorized requests', async () => {
    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('parses a new booking from plain text MIME and stores a parsed event', async () => {
    const rawEmails: RawEmailRow[] = [
      {
        id: 'raw-1',
        salon_id: 'salon-1',
        subject: 'Anna Kowalska: nowa rezerwacja',
        from_address: 'notifications@booksy.com',
        storage_path: 'mail-1.eml',
        parse_status: 'pending',
      },
    ]
    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-1.eml': loadBooksyFixture('new-booking-plain.eml'),
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 1, skipped: 0, failed: 0 })
    expect(rawEmails[0].parse_status).toBe('parsed')
    expect(supabase.insertedParsedEvents).toHaveLength(1)
    expect(supabase.insertedParsedEvents[0]).toMatchObject({
      salon_id: 'salon-1',
      booksy_raw_email_id: 'raw-1',
      event_type: 'created',
      status: 'pending',
    })
    expect(supabase.insertedParsedEvents[0].payload).toMatchObject({
      event_type: 'created',
      clientContact: 'anna@example.com',
      serviceName: 'Usługa: Strzyżenie damskie',
      startAtUtc: '2026-10-27T16:00:00.000Z',
      parsed: {
        type: 'new',
        clientName: 'Anna Kowalska',
        clientPhone: '123456789',
        clientEmail: 'anna@example.com',
        employeeName: 'Kasia',
        bookingDate: '2026-10-27',
        bookingTime: '16:00',
        duration: 60,
      },
    })
  })

  it('decodes RFC2047 MIME subjects before parsing forwarded Booksy emails', async () => {
    const rawEmails: RawEmailRow[] = [
      {
        id: 'raw-encoded-1',
        salon_id: 'salon-encoded-1',
        subject: '=?windows-1250?Q?Fw:_Katarzyna_Barabasz:_zmieni=B3_rezerwacj=EA_i_czeka_n?= =?windows-1250?Q?a_potwierdzenie?=',
        from_address: 'bartosz.rogala@flowsforge.com',
        storage_path: 'mail-encoded-1.eml',
        parse_status: 'pending',
      },
    ]
    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-encoded-1.eml': loadBooksyFixture('reschedule-multipart-quoted-printable.eml'),
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 1, skipped: 0, failed: 0 })
    expect(rawEmails[0].parse_status).toBe('parsed')
    expect(supabase.insertedParsedEvents[0].payload).toMatchObject({
      event_type: 'rescheduled',
      raw: {
        subject: 'Fw: Katarzyna Barabasz: zmienił rezerwację i czeka na potwierdzenie',
      },
      parsed: {
        type: 'reschedule',
        clientName: 'Katarzyna Barabasz',
      },
    })
  })

  it('parses html-only cancellation MIME and marks the raw email as parsed', async () => {
    const rawEmails: RawEmailRow[] = [
      {
        id: 'raw-2',
        salon_id: 'salon-2',
        subject: 'Jan Nowak: odwołał wizytę',
        from_address: 'mailer@booksy.com',
        storage_path: 'mail-2.eml',
        parse_status: 'pending',
      },
    ]
    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-2.eml': loadBooksyFixture('cancel-html.eml'),
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 1, skipped: 0, failed: 0 })
    expect(rawEmails[0].parse_status).toBe('parsed')
    expect(supabase.insertedParsedEvents[0].payload).toMatchObject({
      event_type: 'cancelled',
      clientContact: 'Jan Nowak',
      startAtUtc: '2026-10-22T18:30:00.000Z',
      parsed: {
        type: 'cancel',
        clientName: 'Jan Nowak',
        bookingDate: '2026-10-22',
        bookingTime: '18:30',
        duration: 60,
      },
    })
  })

  it('parses multipart quoted-printable reschedule emails with "na inny termin"', async () => {
    const rawEmails: RawEmailRow[] = [
      {
        id: 'raw-3',
        salon_id: 'salon-3',
        subject: 'Ewa Lis: zmienił rezerwację',
        from_address: 'updates@booksy.com',
        storage_path: 'mail-3.eml',
        parse_status: 'pending',
      },
    ]
    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-3.eml': loadBooksyFixture('reschedule-multipart-quoted-printable.eml'),
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 1, skipped: 0, failed: 0 })
    expect(rawEmails[0].parse_status).toBe('parsed')
    expect(supabase.insertedParsedEvents[0].payload).toMatchObject({
      event_type: 'rescheduled',
      startAtUtc: '1970-01-01T00:00:00.000Z',
      parsed: {
        type: 'reschedule',
        clientName: 'Ewa Lis',
        oldDate: '2026-10-23',
        oldTime: '10:45',
        bookingDate: 'unknown',
        bookingTime: 'unknown',
      },
    })
  })

  it('extracts employee name for reschedule when worker is in a multiline "pracownik:" block', async () => {
    const rawEmails: RawEmailRow[] = [
      {
        id: 'raw-3b',
        salon_id: 'salon-3b',
        subject: 'Izabela Łazorko: zmienił rezerwację i czeka na potwierdzenie',
        from_address: '"Izabela Łazorko" <no-reply@booksy.com>',
        storage_path: 'mail-3b.eml',
        parse_status: 'pending',
      },
    ]
    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-3b.eml': [
          'Content-Type: text/plain; charset="utf-8"',
          'Content-Transfer-Encoding: quoted-printable',
          '',
          'Izabela Łazorko zmienił rezerwację i czeka na potwierdzenie',
          '',
          'czwartek, 28 maja 2026, 10:15 - 11:30',
          '',
          'Manicure KSENIA: Uzupełnienie stylizacji żelowej/korekta',
          '',
          '180,00 zł+,',
          '',
          '                        10:15 - 11:30',
          '',
          'pracownik:',
          '                        Ksenia',
        ].join('\n'),
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 1, skipped: 0, failed: 0 })
    expect(rawEmails[0].parse_status).toBe('parsed')
    expect(supabase.insertedParsedEvents[0].payload).toMatchObject({
      event_type: 'rescheduled',
      parsed: {
        type: 'reschedule',
        clientName: 'Izabela Łazorko',
        employeeName: 'Ksenia',
        bookingDate: '2026-05-28',
        bookingTime: '10:15',
      },
    })
  })

  it('counts duplicates as skipped when parsed event upsert hits an existing fingerprint', async () => {
    const rawEmails: RawEmailRow[] = [
      {
        id: 'raw-4',
        salon_id: 'salon-4',
        subject: 'Ola Nowak: nowa rezerwacja',
        from_address: 'notifications@booksy.com',
        storage_path: 'mail-4.eml',
        parse_status: 'pending',
      },
    ]
    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-4.eml': [
          'Content-Type: text/plain; charset="utf-8"',
          '',
          'Ola Nowak',
          '123 456 789',
          'ola@example.com',
          '',
          'Usługa: Manicure',
          '90,00 zł',
          '',
          '12 listopada 2026, 09:00 - 09:45',
          '',
          'Pracownik: Ola',
        ].join('\n'),
      },
      onParsedEventUpsert: () => ({ data: [], error: null }),
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 0, skipped: 1, failed: 0 })
    expect(rawEmails[0].parse_status).toBe('parsed')
  })

  it('marks raw emails as failed when MIME content cannot be parsed', async () => {
    const rawEmails: RawEmailRow[] = [
      {
        id: 'raw-5',
        salon_id: 'salon-5',
        subject: 'Nieznany temat',
        from_address: 'random@example.com',
        storage_path: 'mail-5.eml',
        parse_status: 'pending',
      },
    ]
    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-5.eml': loadBooksyFixture('invalid-non-booksy.eml'),
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 0, skipped: 0, failed: 1 })
    expect(rawEmails[0].parse_status).toBe('failed')
    expect(supabase.insertedParsedEvents).toHaveLength(0)
    expect(loggerErrorMock).toHaveBeenCalled()
  })

  it('normalizes forwarded booking bodies so client email and service name come from the Booksy section', async () => {
    const rawEmails = [
      {
        id: 'raw-forward-1',
        salon_id: 'salon-forward-1',
        subject: '=?iso-8859-2?Q?Bart=B3omiej_Mitka:_nowa_rezerwacja_pi=B9tek,_10_kwietnia_2026_15:45?=',
        from_address: 'forwarder@example.com',
        storage_path: 'mail-forward-1.eml',
        parse_status: 'pending',
        ingest_source: 'manual_backfill',
      },
    ] as unknown as RawEmailRow[]

    const supabase = createSupabaseStub({
      rawEmails,
      storageBodies: {
        'mail-forward-1.eml': loadBooksyFixture('forwarded-new-booking.eml'),
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase.client)

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ processed: 1, skipped: 0, failed: 0 })
    expect(rawEmails[0].parse_status).toBe('parsed')
    expect(supabase.insertedParsedEvents[0]).toMatchObject({
      event_type: 'created',
    })
    expect(supabase.insertedParsedEvents[0].confidence_score).toBeCloseTo(0.9, 5)
    expect(supabase.insertedParsedEvents[0].payload).toMatchObject({
      clientContact: 'bartlomiej.mitka7799@gmail.com',
      serviceName: 'Strzyżenie męskie włosy krótkie',
      parsed: {
        clientName: 'Bartłomiej Mitka',
        clientPhone: '514078668',
        clientEmail: 'bartlomiej.mitka7799@gmail.com',
        bookingDate: '2026-04-10',
        bookingTime: '15:45',
        employeeName: 'Karolina',
      },
    })
  })
})
