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
  parsed: ParsedBookingLike
): Promise<BooksyBookingMatchResult> {
  const activeBookings = await loadBookings(supabase, salonId, parsed.bookingDate, ['scheduled', 'confirmed', 'completed'])
  const activeCandidates = topCandidates(activeBookings, parsed, parsed.bookingDate, parsed.bookingTime)
  const exact = findExact(activeBookings, parsed, parsed.bookingTime)

  if (exact) {
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

  const strongCandidates = activeCandidates.filter((candidate) => candidate.score >= 0.75)
  if (strongCandidates.length > 1) {
    return { kind: 'ambiguous', candidates: strongCandidates }
  }

  return { kind: 'none', candidates: activeCandidates }
}

export async function findRescheduleMatch(
  supabase: SupabaseClient,
  salonId: string,
  parsed: ParsedBookingLike
): Promise<BooksyBookingMatchResult> {
  const targetDate = parsed.oldDate && parsed.oldDate !== 'unknown' ? parsed.oldDate : parsed.bookingDate
  const targetTime = parsed.oldTime && parsed.oldTime !== 'unknown' ? parsed.oldTime : parsed.bookingTime

  if (!parsed.oldDate || parsed.oldDate === 'unknown') {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await (supabase
      .from('bookings') as any)
      .select('id, booking_date, booking_time, status, clients(full_name), services(name)')
      .eq('salon_id', salonId)
      .gte('booking_date', today)
      .in('status', ['scheduled', 'confirmed'])

    if (error) {
      throw error
    }

    const clientMatches = (data ?? []).filter((booking: BookingRow) => namesMatch(booking.clients?.full_name, parsed.clientName))
    const candidates = topCandidates(clientMatches, parsed, targetDate, targetTime)

    if (clientMatches.length === 1) {
      return { kind: 'exact', booking: clientMatches[0], candidates }
    }

    if (clientMatches.length > 1) {
      return { kind: 'ambiguous', candidates }
    }
  }

  const oldBookings = await loadBookings(supabase, salonId, targetDate, ['scheduled', 'confirmed'])
  const candidates = topCandidates(oldBookings, parsed, targetDate, targetTime)
  const exact = findExact(oldBookings, parsed, targetTime)

  if (exact) {
    return { kind: 'exact', booking: exact, candidates }
  }

  const newBookings = await loadBookings(supabase, salonId, parsed.bookingDate, ['scheduled', 'confirmed'])
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
