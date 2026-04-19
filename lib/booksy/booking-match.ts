import type { SupabaseClient } from '@supabase/supabase-js'

type ParsedBookingLike = {
  clientName: string
  serviceName: string
  bookingDate: string
  bookingTime: string
  oldDate?: string
  oldTime?: string
}

type BookingRow = {
  id: string
  booking_date: string
  booking_time: string
  status: string
  clients?: { full_name?: string | null } | null
  services?: { name?: string | null } | null
}

type AppointmentRow = {
  id: string
  start_time: string
  status: string
  clients?: { full_name?: string | null } | null
  services?: { name?: string | null } | null
}

type FutureBookingCandidate = {
  id: string
  appointmentDate: string
  startTime: string
  clientName: string | null
  serviceName: string | null
  score: number
}

export type BooksyBookingCandidate = {
  bookingId: string
  bookingDate: string
  bookingTime: string
  status: string
  clientName: string | null
  serviceName: string | null
  score: number
  mismatches: string[]
}

export type BooksyBookingMatchResult =
  | { kind: 'exact'; booking: BookingRow; candidates: BooksyBookingCandidate[] }
  | { kind: 'already_applied'; booking: BookingRow; candidates: BooksyBookingCandidate[] }
  | { kind: 'ambiguous'; candidates: BooksyBookingCandidate[] }
  | { kind: 'none'; candidates: BooksyBookingCandidate[] }

export class BooksyManualReviewError extends Error {
  constructor(
    public readonly reviewReason: string,
    message: string,
    public readonly candidates: BooksyBookingCandidate[] = []
  ) {
    super(message)
    this.name = 'BooksyManualReviewError'
  }
}

export function isBooksyManualReviewError(error: unknown): error is BooksyManualReviewError {
  return error instanceof BooksyManualReviewError
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function normalizeTime(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5)
}

function minutes(value: string | null | undefined): number | null {
  const match = normalizeTime(value).match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    return null
  }

  return Number(match[1]) * 60 + Number(match[2])
}

function namesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)

  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  )
}

function serviceMatches(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)

  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  )
}

function appointmentDate(value: string | null | undefined): string {
  const source = value ?? ''
  const withDate = source.match(/^(\d{4}-\d{2}-\d{2})/)
  if (withDate) {
    return withDate[1]
  }

  const parsed = new Date(source)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return ''
}

function appointmentTime(value: string | null | undefined): string {
  const source = value ?? ''
  const withTime = source.match(/[T\s](\d{2}:\d{2})/)
  if (withTime) {
    return withTime[1]
  }

  return normalizeTime(source)
}

function futureCandidateScore(clientName: string | null, serviceName: string | null, parsed: ParsedBookingLike): number {
  let score = 70
  const normalizedClient = normalize(clientName)
  const normalizedExpectedClient = normalize(parsed.clientName)
  const normalizedService = normalize(serviceName)
  const normalizedExpectedService = normalize(parsed.serviceName)

  if (normalizedClient && normalizedExpectedClient && normalizedClient === normalizedExpectedClient) {
    score += 15
  }

  if (normalizedService && normalizedExpectedService && normalizedService === normalizedExpectedService) {
    score += 15
  }

  return score
}

function toFutureCandidate(appointment: AppointmentRow, parsed: ParsedBookingLike): FutureBookingCandidate {
  const clientName = appointment.clients?.full_name ?? null
  const serviceName = appointment.services?.name ?? null

  return {
    id: appointment.id,
    appointmentDate: appointmentDate(appointment.start_time),
    startTime: appointmentTime(appointment.start_time),
    clientName,
    serviceName,
    score: futureCandidateScore(clientName, serviceName, parsed),
  }
}

function futureCandidateToBooking(candidate: FutureBookingCandidate, status: string): BookingRow {
  return {
    id: candidate.id,
    booking_date: candidate.appointmentDate,
    booking_time: candidate.startTime,
    status,
    clients: { full_name: candidate.clientName },
    services: { name: candidate.serviceName },
  }
}

function toCandidate(booking: BookingRow, parsed: ParsedBookingLike, expectedDate: string, expectedTime: string): BooksyBookingCandidate {
  const bookingTime = normalizeTime(booking.booking_time)
  const bookingMinutes = minutes(bookingTime)
  const expectedMinutes = minutes(expectedTime)
  const mismatches: string[] = []
  let score = 0

  if (booking.booking_date === expectedDate) {
    score += 0.2
  } else {
    mismatches.push('date')
  }

  if (bookingTime === expectedTime) {
    score += 0.25
  } else if (bookingMinutes !== null && expectedMinutes !== null && Math.abs(bookingMinutes - expectedMinutes) <= 30) {
    score += 0.12
    mismatches.push('time_near')
  } else {
    mismatches.push('time')
  }

  if (namesMatch(booking.clients?.full_name, parsed.clientName)) {
    score += 0.35
  } else {
    mismatches.push('client')
  }

  if (serviceMatches(booking.services?.name, parsed.serviceName)) {
    score += 0.15
  } else {
    mismatches.push('service')
  }

  if (!['cancelled', 'no_show'].includes(booking.status)) {
    score += 0.05
  }

  return {
    bookingId: booking.id,
    bookingDate: booking.booking_date,
    bookingTime,
    status: booking.status,
    clientName: booking.clients?.full_name ?? null,
    serviceName: booking.services?.name ?? null,
    score: Number(score.toFixed(2)),
    mismatches,
  }
}

function topCandidates(bookings: BookingRow[], parsed: ParsedBookingLike, expectedDate: string, expectedTime: string): BooksyBookingCandidate[] {
  return bookings
    .map((booking) => toCandidate(booking, parsed, expectedDate, expectedTime))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
}

async function loadBookings(
  supabase: SupabaseClient,
  salonId: string,
  date: string,
  statuses: string[]
): Promise<BookingRow[]> {
  const { data, error } = await (supabase
    .from('bookings') as any)
    .select('id, booking_date, booking_time, status, clients(full_name), services(name)')
    .eq('salon_id', salonId)
    .eq('booking_date', date)
    .in('status', statuses)

  if (error) {
    throw error
  }

  return data ?? []
}

function findExact(bookings: BookingRow[], parsed: ParsedBookingLike, expectedTime: string): BookingRow | null {
  return bookings.find((booking) =>
    normalizeTime(booking.booking_time) === expectedTime &&
    namesMatch(booking.clients?.full_name, parsed.clientName)
  ) ?? null
}

export async function findCancellationMatch(
  supabase: SupabaseClient,
  salonId: string,
  parsed: ParsedBookingLike,
  isForwarded?: boolean
): Promise<BooksyBookingMatchResult> {
  const activeStatuses = isForwarded
    ? ['cancelled', 'completed', 'scheduled', 'confirmed']
    : ['scheduled', 'confirmed', 'completed']
  const activeBookings = await loadBookings(supabase, salonId, parsed.bookingDate, activeStatuses)
  const activeCandidates = topCandidates(activeBookings, parsed, parsed.bookingDate, parsed.bookingTime)
  const exact = findExact(activeBookings, parsed, parsed.bookingTime)

  if (exact) {
    if (exact.status === 'cancelled') {
      return { kind: 'already_applied', booking: exact, candidates: activeCandidates }
    }

    return { kind: 'exact', booking: exact, candidates: activeCandidates }
  }

  const cancelledBookings = await loadBookings(supabase, salonId, parsed.bookingDate, ['cancelled'])
  const alreadyCancelled = findExact(cancelledBookings, parsed, parsed.bookingTime)

  if (alreadyCancelled) {
    return {
      kind: 'already_applied',
      booking: alreadyCancelled,
      candidates: topCandidates(cancelledBookings, parsed, parsed.bookingDate, parsed.bookingTime),
    }
  }

  const minConfidence = isForwarded ? 0.4 : 0.6
  const strongCandidates = activeCandidates.filter((candidate) => candidate.score >= minConfidence)
  if (strongCandidates.length > 1) {
    return { kind: 'ambiguous', candidates: strongCandidates }
  }

  return { kind: 'none', candidates: activeCandidates }
}

export async function findRescheduleMatch(
  supabase: SupabaseClient,
  salonId: string,
  parsed: ParsedBookingLike,
  isForwarded?: boolean
): Promise<BooksyBookingMatchResult> {
  const appointmentStatuses = isForwarded
    ? ['cancelled', 'completed', 'scheduled', 'confirmed']
    : ['scheduled', 'confirmed']
  const targetDate = parsed.oldDate && parsed.oldDate !== 'unknown' ? parsed.oldDate : parsed.bookingDate
  const targetTime = parsed.oldTime && parsed.oldTime !== 'unknown' ? parsed.oldTime : parsed.bookingTime

  if (!parsed.oldDate || parsed.oldDate === 'unknown' || parsed.oldTime === 'unknown') {
    const now = new Date()
    const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const nowDate = now.toISOString().slice(0, 10)
    const endDate = end.toISOString().slice(0, 10)
    const { data, error } = await (supabase
      .from('bookings') as any)
      .select('id, booking_date, booking_time, status, clients(full_name), services(name)')
      .eq('salon_id', salonId)
      .in('status', appointmentStatuses)
      .gte('booking_date', nowDate)
      .lte('booking_date', endDate)

    if (error) {
      throw error
    }

    const matchingCandidates: FutureBookingCandidate[] = []
    for (const [, booking] of ((data ?? []) as BookingRow[]).entries()) {
      const clientName = booking.clients?.full_name ?? null
      const serviceName = booking.services?.name ?? null
      if (!namesMatch(clientName, parsed.clientName)) {
        continue
      }
      if (!serviceMatches(serviceName, parsed.serviceName)) {
        continue
      }
      matchingCandidates.push({
        id: booking.id,
        appointmentDate: booking.booking_date,
        startTime: normalizeTime(booking.booking_time),
        clientName,
        serviceName,
        score: futureCandidateScore(clientName, serviceName, parsed),
      })
    }

    const top5ByScore = [...matchingCandidates]
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)

    if (top5ByScore.length === 0) {
      return { kind: 'none', candidates: [] } as BooksyBookingMatchResult
    }

    if (top5ByScore.length === 1) {
      let match: FutureBookingCandidate | null = null
      for (const [, candidate] of top5ByScore.entries()) {
        match = candidate
      }

      if (match) {
        return {
          kind: 'single_future',
          match,
          score: 70,
          candidates: [match],
          booking: futureCandidateToBooking(match, 'scheduled'),
        } as unknown as BooksyBookingMatchResult
      }
    }

    if (top5ByScore.length > 1) {
      return { kind: 'ambiguous', candidates: top5ByScore } as unknown as BooksyBookingMatchResult
    }
  }

  const oldBookings = await loadBookings(supabase, salonId, targetDate, appointmentStatuses)
  const candidates = topCandidates(oldBookings, parsed, targetDate, targetTime)
  const exact = findExact(oldBookings, parsed, targetTime)

  if (exact) {
    return { kind: 'exact', booking: exact, candidates }
  }

  const newBookings = await loadBookings(supabase, salonId, parsed.bookingDate, appointmentStatuses)
  const alreadyRescheduled = findExact(newBookings, parsed, parsed.bookingTime)

  if (alreadyRescheduled) {
    return {
      kind: 'already_applied',
      booking: alreadyRescheduled,
      candidates: topCandidates(newBookings, parsed, parsed.bookingDate, parsed.bookingTime),
    }
  }

  return { kind: 'none', candidates }
}
