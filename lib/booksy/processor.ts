import { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import {
  BooksyManualReviewError,
  findCancellationMatch,
  findRescheduleMatch,
} from '@/lib/booksy/booking-match'
import { classifyBooksyFailure } from '@/lib/booksy/retry-policy'
import {
  AmbiguousMatchError,
  BookingAlreadyAppliedError,
  BookingNotFoundError,
  EmployeeNotFoundError,
  ServiceNotFoundError,
  ValidationError,
} from './errors'

interface ParsedBooking {
  type: 'new' | 'cancel' | 'reschedule'
  source?: string
  clientName: string
  clientPhone: string
  clientEmail?: string
  serviceName: string
  price: number
  bookingDate: string // YYYY-MM-DD
  bookingTime: string // HH:mm
  employeeName?: string
  duration?: number
  // For rescheduling
  oldDate?: string
  oldTime?: string
}

interface ProcessEmailOptions {
  eventId?: string
  messageId?: string  // Gmail message ID — used to save failed emails for manual review
}

type ApplyParsedEventOptions = {
  bookingId?: string
}

interface BooksyAutomationSettings {
  autoCreateClients: boolean
  autoCreateServices: boolean
}

type ParsedEventType = 'created' | 'cancelled' | 'rescheduled' | 'unknown'
type ParsedEventReviewReason = 'ambiguous_match' | 'cancel_not_found' | 'validation' | 'unknown'

export class BooksyProcessor {
  private automationSettingsPromise: Promise<BooksyAutomationSettings> | null = null

  constructor(
    private supabase: SupabaseClient,
    private salonId: string
  ) { }

  /**
   * Parse Booksy email and create booking
   */
  async processEmail(subject: string, body: string, options?: ProcessEmailOptions): Promise<any> {
    let parsed: ReturnType<typeof this.parseEmail> = null

    try {
      logger.info('[Booksy] Processing email start')

      const eventMarker = options?.eventId ? `[booksy_event_id:${options.eventId}]` : null

      if (eventMarker) {
        const existingByEvent = await this.findBookingByEventMarker(eventMarker)
        if (existingByEvent) {
          return { success: true, deduplicated: true, booking: existingByEvent }
        }
      }

      // 1. Parse email
      parsed = this.parseEmail(subject, body)
      if (!parsed) {
        throw new Error('Could not parse email format')
      }
      logger.info('[Booksy] Step 1: Email parsed', { type: parsed.type })

      if (this.isLedgerEnabled()) {
        const parsedEventId = await this.insertParsedEvent(subject, body, parsed, options, eventMarker)
        const applyResult = await this.applyParsedEvent(parsedEventId)

        if (options?.messageId) {
          await this.resolvePendingEmail(options.messageId)
        }

        logger.info('[Booksy] Processing email success')
        return applyResult
      }

      const applyResult = await this.applyParsedPayload(parsed, eventMarker)

      if (options?.messageId) {
        await this.resolvePendingEmail(options.messageId)
      }

      logger.info('[Booksy] Processing email success')
      return applyResult
    } catch (error: any) {
      logger.error('[Booksy] Processing email failed', error)

      // Save to pending queue so the user can action it manually
      if (options?.messageId) {
        const reason = error.message.includes('Service not found')
          ? 'service_not_found'
          : error.message.includes('Employee not found')
            ? 'employee_not_found'
            : error.message.includes('Could not parse')
              ? 'parse_failed'
              : error.message.includes('cancel_not_found') || error.message.includes('to cancel')
                ? 'cancel_not_found'
                : error.message.includes('reschedule_not_found') || error.message.includes('to reschedule')
                  ? 'reschedule_not_found'
                  : 'other'

        await this.savePendingEmail({
          messageId: options.messageId,
          subject,
          body,
          parsed: parsed ?? undefined,
          reason,
          detail: error.message,
        })
      }

      return { success: false, error: error.message, pending: !!options?.messageId }
    }
  }

  async applyParsedEvent(parsedEventId: string, options?: ApplyParsedEventOptions): Promise<any> {
    const { data: parsedEvent, error: parsedEventError } = await this.supabase
      .from('booksy_parsed_events')
      .select('*')
      .eq('id', parsedEventId)
      .eq('salon_id', this.salonId)
      .maybeSingle()

    if (parsedEventError) throw parsedEventError
    if (!parsedEvent) {
      throw new Error(`Parsed event not found: ${parsedEventId}`)
    }

    const idempotencyKey = this.computeApplyIdempotencyKey(parsedEvent.salon_id, parsedEvent.event_fingerprint)
    const { data: existingLedger } = await this.supabase
      .from('booksy_apply_ledger')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingLedger && existingLedger.operation !== 'failed') {
      return { success: true, deduplicated: true, ledger: existingLedger }
    }

    // Failed ledger entries block retries — delete and attempt again.
    if (existingLedger?.operation === 'failed') {
      await this.supabase
        .from('booksy_apply_ledger')
        .delete()
        .eq('id', (existingLedger as unknown as { id: string }).id)
        .eq('salon_id', this.salonId)
    }

    const { data: createdLedger, error: createdLedgerError } = await this.supabase
      .from('booksy_apply_ledger')
      .insert({
        salon_id: this.salonId,
        booksy_parsed_event_id: parsedEvent.id,
        idempotency_key: idempotencyKey,
        operation: 'skipped',
      } as any)
      .select()
      .single()

    if (createdLedgerError) {
      const duplicateLedger =
        createdLedgerError.code === '23505' ||
        String(createdLedgerError.message || '').toLowerCase().includes('duplicate')
      if (duplicateLedger) {
        const { data: duplicate } = await this.supabase
          .from('booksy_apply_ledger')
          .select('*')
          .eq('salon_id', this.salonId)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle()
        return { success: true, deduplicated: true, ledger: duplicate }
      }
      throw createdLedgerError
    }

    try {
      const payload = parsedEvent.payload as {
        parsed?: ParsedBooking
        eventMarker?: string | null
      } | null
      const parsed = payload?.parsed
      if (!parsed) {
        throw new Error('Parsed event payload is missing parsed booking data')
      }

      const applyResult = await this.applyParsedPayload(parsed, payload?.eventMarker ?? null, options)
      if (this.isManualReviewApplyResult(applyResult)) {
        const { error: updateLedgerError } = await this.supabase
          .from('booksy_apply_ledger')
          .update({
            operation: 'skipped',
            target_table: null,
            target_id: null,
            error_message: applyResult.reviewDetail,
            applied_at: new Date().toISOString(),
          } as any)
          .eq('id', createdLedger.id)
          .eq('salon_id', this.salonId)

        if (updateLedgerError) {
          logger.error('[Booksy] Failed to update apply ledger record for manual review', updateLedgerError)
        }

        await this.markParsedEventManualReview(
          parsedEvent.id,
          applyResult.reviewReason,
          applyResult.reviewDetail,
          applyResult.candidateBookings
        )

        return applyResult
      }

      const operation = this.resolveLedgerOperation(parsed, applyResult)
      const targetBookingId = applyResult?.booking?.id ?? null

      const { error: updateLedgerError } = await this.supabase
        .from('booksy_apply_ledger')
        .update({
          operation,
          target_table: 'bookings',
          target_id: targetBookingId,
          error_message: null,
          applied_at: new Date().toISOString(),
        } as any)
        .eq('id', createdLedger.id)
        .eq('salon_id', this.salonId)

      if (updateLedgerError) {
        logger.error('[Booksy] Failed to update apply ledger record', updateLedgerError)
      }

      const { error: updateEventError } = await this.supabase
        .from('booksy_parsed_events')
        .update({ status: 'applied' } as any)
        .eq('id', parsedEvent.id)
        .eq('salon_id', this.salonId)

      if (updateEventError) {
        logger.error('[Booksy] Failed to update parsed event status', updateEventError)
      }

      return applyResult
    } catch (error: any) {
      const manualReview = this.resolveManualReviewTransition(error)
      if (manualReview) {
        const { error: updateLedgerError } = await this.supabase
          .from('booksy_apply_ledger')
          .update({
            operation: 'skipped',
            target_table: null,
            target_id: null,
            error_message: manualReview.reviewDetail,
            applied_at: new Date().toISOString(),
          } as any)
          .eq('id', createdLedger.id)
          .eq('salon_id', this.salonId)

        if (updateLedgerError) {
          logger.error('[Booksy] Failed to update apply ledger record for manual review', updateLedgerError)
        }

        await this.markParsedEventManualReview(
          parsedEvent.id,
          manualReview.reviewReason,
          manualReview.reviewDetail,
          manualReview.candidateBookings
        )

        return {
          success: false,
          manualReview: true,
          type: 'manual_review',
          ...manualReview,
        }
      }

      await this.supabase
        .from('booksy_apply_ledger')
        .update({
          operation: 'failed',
          error_message: error.message ?? 'Unknown apply error',
          applied_at: new Date().toISOString(),
        } as any)
        .eq('id', createdLedger.id)
        .eq('salon_id', this.salonId)

      throw error
    }
  }

  private isManualReviewApplyResult(result: any): result is {
    success: false
    manualReview: true
    type: 'cancel'
    reviewReason: ParsedEventReviewReason
    reviewDetail: string
    candidateBookings: unknown[]
  } {
    return Boolean(
      result &&
      result.manualReview === true &&
      typeof result.reviewReason === 'string' &&
      typeof result.reviewDetail === 'string' &&
      Array.isArray(result.candidateBookings)
    )
  }

  private resolveManualReviewTransition(error: unknown): {
    reviewReason: ParsedEventReviewReason
    reviewDetail: string
    candidateBookings: unknown[]
  } | null {
    const message = error instanceof Error ? error.message : 'Unknown apply error'

    if (error instanceof BooksyManualReviewError) {
      if (error.reviewReason !== 'cancel_not_found' && error.reviewReason !== 'ambiguous_match' && error.reviewReason !== 'reschedule_not_found') {
        return null
      }
      const mappedReason = error.reviewReason === 'cancel_not_found' ? 'cancel_not_found' : 'ambiguous_match'
      return {
        reviewReason: mappedReason,
        reviewDetail: message,
        candidateBookings: error.candidates ?? [],
      }
    }

    if (error instanceof BookingNotFoundError) {
      return {
        reviewReason: 'cancel_not_found',
        reviewDetail: message,
        candidateBookings: [],
      }
    }

    if (error instanceof AmbiguousMatchError) {
      return {
        reviewReason: 'ambiguous_match',
        reviewDetail: message,
        candidateBookings: error.candidates ?? [],
      }
    }

    const classification = classifyBooksyFailure(message)
    if (classification.code === 'validation' || classification.code === 'unknown') {
      return {
        reviewReason: classification.code,
        reviewDetail: message,
        candidateBookings: [],
      }
    }

    return null
  }

  private async markParsedEventManualReview(
    parsedEventId: string,
    reviewReason: ParsedEventReviewReason,
    reviewDetail: string,
    candidateBookings: unknown[]
  ): Promise<void> {
    const { error: updateEventError } = await this.supabase
      .from('booksy_parsed_events')
      .update({
        status: 'manual_review',
        review_reason: reviewReason,
        review_detail: reviewDetail,
        candidate_bookings: candidateBookings,
      } as any)
      .eq('id', parsedEventId)
      .eq('salon_id', this.salonId)

    if (updateEventError) {
      logger.error('[Booksy] Failed to update parsed event manual review details', updateEventError)
    }
  }

  private async insertParsedEvent(
    subject: string,
    body: string,
    parsed: ParsedBooking,
    options: ProcessEmailOptions | undefined,
    eventMarker: string | null
  ): Promise<string> {
    const payload = {
      subject,
      body,
      parsed,
      eventMarker,
      options: {
        eventId: options?.eventId ?? null,
        messageId: options?.messageId ?? null,
      },
    }
    const eventType = this.toParsedEventType(parsed.type)
    const eventFingerprint = this.computeParsedEventFingerprint(payload)
    const rawEmailIdFromOptions = (options as ProcessEmailOptions & { rawEmailId?: string } | undefined)?.rawEmailId
    const rawEmailId = rawEmailIdFromOptions ?? await this.resolveRawEmailId(options?.messageId)

    const insertPayload: Record<string, unknown> = {
      salon_id: this.salonId,
      parser_version: 'v1',
      event_type: eventType,
      confidence_score: 1,
      trust_score: 1,
      event_fingerprint: eventFingerprint,
      payload,
      status: 'pending',
    }

    if (rawEmailId) {
      insertPayload.booksy_raw_email_id = rawEmailId
    }

    const { data: createdEvent, error: createdEventError } = await this.supabase
      .from('booksy_parsed_events')
      .insert(insertPayload as any)
      .select('id')
      .single()

    if (!createdEventError && createdEvent?.id) {
      return createdEvent.id
    }

    const duplicateEvent =
      createdEventError?.code === '23505' ||
      String(createdEventError?.message || '').toLowerCase().includes('duplicate')

    if (duplicateEvent) {
      const { data: existingEvent, error: existingEventError } = await this.supabase
        .from('booksy_parsed_events')
        .select('id')
        .eq('salon_id', this.salonId)
        .eq('event_fingerprint', eventFingerprint)
        .maybeSingle()

      if (existingEventError) throw existingEventError
      if (!existingEvent?.id) {
        throw new BookingAlreadyAppliedError('Parsed event already exists but could not be fetched')
      }

      return existingEvent.id
    }

    throw createdEventError
  }

  private async applyParsedPayload(
    parsed: ParsedBooking,
    eventMarker: string | null,
    options?: ApplyParsedEventOptions
  ): Promise<any> {
    if (parsed.type === 'cancel') {
      logger.info('[Booksy] Handling cancellation for:', { clientName: parsed.clientName })
      return this.handleCancellation(parsed, options?.bookingId)
    }

    if (parsed.type === 'reschedule') {
      logger.info('[Booksy] Handling reschedule for:', { clientName: parsed.clientName })
      if (parsed.bookingDate === 'unknown' || parsed.bookingTime === 'unknown') {
        throw new ValidationError('Zmiana na inny termin (brak podanej nowej daty w e-mailu)')
      }
      return this.handleReschedule(parsed, options?.bookingId)
    }

    logger.info('[Booksy] Step 2: Finding/creating client')
    const client = await this.findOrCreateClient(parsed)
    logger.info('[Booksy] Step 2: Client found/created', { clientId: client.id })

    logger.info('[Booksy] Step 3: Finding employee')
    const employee = await this.resolveEmployee(parsed.employeeName)
    if (!employee) {
      throw new EmployeeNotFoundError(`Employee not found${parsed.employeeName ? `: ${parsed.employeeName}` : ''}`)
    }
    logger.info('[Booksy] Step 3: Employee found', { employeeId: employee.id })

    logger.info('[Booksy] Step 4: Finding service', { serviceName: parsed.serviceName })
    let service = await this.findServiceByName(parsed.serviceName)
    if (!service) {
      const settings = await this.getAutomationSettings()
      if (!settings.autoCreateServices) {
        throw new ServiceNotFoundError(`Service not found: ${parsed.serviceName}`)
      }

      service = await this.createServiceFromParsedBooking(parsed)
    }
    logger.info('[Booksy] Step 4: Service found', { serviceId: service.id })

    logger.info('[Booksy] Step 5: Creating booking')
    const booking = await this.createBooking({
      clientId: client.id,
      employeeId: employee.id,
      serviceId: service.id,
      bookingDate: parsed.bookingDate,
      bookingTime: parsed.bookingTime,
      duration: parsed.duration || service.duration,
      price: parsed.price || service.price,
      notes: eventMarker,
    })
    logger.info('[Booksy] Step 5: Booking created', { bookingId: booking.id })

    return { success: true, booking, parsed }
  }

  private async resolveRawEmailId(messageId?: string): Promise<string | null> {
    if (!messageId) {
      return null
    }

    const { data: rawEmail } = await this.supabase
      .from('booksy_raw_emails')
      .select('id')
      .eq('salon_id', this.salonId)
      .eq('gmail_message_id', messageId)
      .maybeSingle()

    return rawEmail?.id ?? null
  }

  private toParsedEventType(type: ParsedBooking['type']): ParsedEventType {
    if (type === 'new') return 'created'
    if (type === 'cancel') return 'cancelled'
    if (type === 'reschedule') return 'rescheduled'
    return 'unknown'
  }

  private computeParsedEventFingerprint(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  }

  private computeApplyIdempotencyKey(salonId: string, eventFingerprint: string): string {
    return createHash('sha256').update(`${salonId}:${eventFingerprint}`).digest('hex')
  }

  private resolveLedgerOperation(parsed: ParsedBooking, applyResult: any): 'created' | 'updated' | 'skipped' {
    if (applyResult?.deduplicated) {
      return 'skipped'
    }
    if (parsed.type === 'new') {
      return 'created'
    }
    return 'updated'
  }

  private isLedgerEnabled(): boolean {
    return String(process.env.BOOKSY_LEDGER_ENABLED || '').toLowerCase() === 'true'
  }

  /**
   * Handle booking cancellation
   */
  private async handleCancellation(parsed: ParsedBooking, forcedBookingId?: string) {
    if (forcedBookingId) {
      const { data: forcedBooking, error: forcedBookingError } = await this.supabase
        .from('bookings')
        .select('*')
        .eq('id', forcedBookingId)
        .eq('salon_id', this.salonId)
        .maybeSingle()

      if (forcedBookingError) throw forcedBookingError
      if (!forcedBooking) {
        throw new BookingNotFoundError(`Booking to cancel not found: ${forcedBookingId}`)
      }

      const { data: updatedForced, error: updateForcedError } = await this.supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', forcedBooking.id)
        .eq('salon_id', this.salonId)
        .select()
        .single()

      if (updateForcedError) throw updateForcedError

      logger.info('[Booksy] Booking cancelled (manual override)', { bookingId: forcedBooking.id })
      return { success: true, type: 'cancel', booking: updatedForced }
    }

    const isForwarded = parsed.source === 'forwarded'
    const match = await findCancellationMatch(this.supabase, this.salonId, parsed, isForwarded)

    if (match.kind === 'already_applied') {
      logger.info('[Booksy] Booking already cancelled (forwarded email deduplication)', { bookingId: match.booking.id })
      return { success: true, deduplicated: true, type: 'cancel', booking: match.booking }
    }

    if (match.kind === 'ambiguous') {
      throw new AmbiguousMatchError(
        `Cancellation match ambiguous for ${parsed.clientName} at ${parsed.bookingDate} ${parsed.bookingTime}`,
        match.candidates
      )
    }

    if (match.kind === 'none') {
      // Booking not found = already not active in our system (pre-integration or already cancelled).
      // Auto-resolve: treat as applied so it doesn't land in manual review queue.
      logger.info('[Booksy] Cancellation target not found — auto-resolving (pre-integration booking)', {
        clientName: parsed.clientName,
        bookingDate: parsed.bookingDate,
      })
      return { success: true, type: 'cancel', autoResolved: true, reason: 'not_found_pre_integration' }
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', match.booking.id)
      .eq('salon_id', this.salonId)
      .select()
      .single()

    if (updateError) throw updateError

    logger.info('[Booksy] Booking cancelled', { bookingId: match.booking.id })
    return { success: true, type: 'cancel', booking: updated }
  }

  /**
   * Handle booking reschedule
   */
  private async handleReschedule(parsed: ParsedBooking, forcedBookingId?: string) {
    if (parsed.oldDate && parsed.oldDate !== 'unknown' && !parsed.oldTime) {
      throw new BooksyManualReviewError(
        'missing_old_date',
        'Missing old date/time for rescheduling'
      )
    }

    if (forcedBookingId) {
      const { data: forcedBooking, error: forcedBookingError } = await this.supabase
        .from('bookings')
        .select('id')
        .eq('id', forcedBookingId)
        .eq('salon_id', this.salonId)
        .maybeSingle()

      if (forcedBookingError) throw forcedBookingError
      if (!forcedBooking) {
        throw new BookingNotFoundError(`Booking to reschedule not found: ${forcedBookingId}`)
      }

      const { data: updatedForced, error: updateForcedError } = await this.supabase
        .from('bookings')
        .update({
          booking_date: parsed.bookingDate,
          booking_time: parsed.bookingTime,
          updated_at: new Date().toISOString(),
        })
        .eq('id', forcedBooking.id)
        .eq('salon_id', this.salonId)
        .select()
        .single()

      if (updateForcedError) throw updateForcedError

      logger.info('[Booksy] Booking rescheduled (manual override)', {
        bookingId: forcedBooking.id,
        newDate: parsed.bookingDate,
        newTime: parsed.bookingTime,
      })
      return { success: true, type: 'reschedule', booking: updatedForced }
    }

    const isForwarded = parsed.source === 'forwarded'
    const match = await findRescheduleMatch(this.supabase, this.salonId, parsed, isForwarded) as Awaited<ReturnType<typeof findRescheduleMatch>> | {
      kind: 'single_future'
      booking: { id: string }
      candidates: unknown[]
    }

    if (match.kind === 'already_applied') {
      logger.info('[Booksy] Booking already rescheduled (forwarded email deduplication)', { bookingId: match.booking.id })
      return { success: true, deduplicated: true, type: 'reschedule', booking: match.booking }
    }

    if (match.kind === 'ambiguous') {
      throw new AmbiguousMatchError(
        `Reschedule match ambiguous for ${parsed.clientName}`,
        match.candidates
      )
    }

    if (match.kind === 'none') {
      if (match.candidates.length === 0) {
        // No booking at old or new date, no candidates — pre-integration booking. Auto-resolve.
        logger.info('[Booksy] Reschedule target not found with no candidates — auto-resolving (pre-integration booking)', {
          clientName: parsed.clientName,
          oldDate: parsed.oldDate,
        })
        return { success: true, type: 'reschedule', autoResolved: true, reason: 'not_found_pre_integration' }
      }
      throw new AmbiguousMatchError(
        `Booking to reschedule not found: ${parsed.clientName} at ${parsed.oldDate ?? 'unknown'} ${parsed.oldTime ?? 'unknown'}`,
        match.candidates
      )
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('bookings')
      .update({
        booking_date: parsed.bookingDate,
        booking_time: parsed.bookingTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.booking.id)
      .eq('salon_id', this.salonId)
      .select()
      .single()

    if (updateError) throw updateError

    logger.info('[Booksy] Booking rescheduled', { bookingId: match.booking.id, newDate: parsed.bookingDate, newTime: parsed.bookingTime })
    return { success: true, type: 'reschedule', booking: updated }
  }

  /**
   * Parse Booksy email format
   */
  private parseEmail(subject: string, body: string): ParsedBooking | null {
    try {
      // Detect email type from subject
      let type: 'new' | 'cancel' | 'reschedule' = 'new'
      let rawClientName = ''

      if (/nowa rezerwacja/i.test(subject)) {
        type = 'new'
        rawClientName = subject.match(/^(.+?):\s*nowa rezerwacja/i)?.[1]?.trim() ?? ''
      } else if (/odwołał[aa]?\s+wizytę/i.test(subject)) {
        type = 'cancel'
        rawClientName = subject.match(/^(.+?):\s*odwołał/i)?.[1]?.trim() ?? ''
      } else if (/zmienił\s+rezerwację/i.test(subject)) {
        type = 'reschedule'
        rawClientName = subject.match(/^(.+?):\s*zmienił/i)?.[1]?.trim() ?? ''
      } else if (/Zmiany w rezerwacji/i.test(subject)) {
        type = 'reschedule'
        rawClientName = ''
      } else {
        logger.warn('[Booksy] Unknown email type in subject', { subject })
        return null
      }

      let clientName = rawClientName.replace(/^(pd|re|fw|fwd)\s*:\s*/i, '').trim()

      // Clean body text (remove special characters and normalize)
      const cleanBody = body
        .replace(/Ă˘â‚¬"/g, '-')
        .replace(/â€"/g, '-')  // em-dash
        .replace(/â€"/g, '-')  // en-dash
        .replace(/Ă…â€š/g, 'Ĺ‚')
        .replace(/Ă…â€ş/g, 'Ĺ›')
        .replace(/Ă„â€¦/g, 'Ä…')
        .replace(/Ă„â€ˇ/g, 'Ä‡')
        .replace(/Ă„â„˘/g, 'Ä™')
        .replace(/Ă…â€ž/g, 'Ĺ„')
        .replace(/ĂÂł/g, 'Ăł')
        .replace(/Ă…Âş/g, 'Ĺş')
        .replace(/Ă…ÂĽ/g, 'ĹĽ')

      logger.info('[Booksy] Parsing email', { subjectLength: subject.length, bodyLength: body.length })

      if (!clientName && /Zmiany w rezerwacji/i.test(subject)) {
        const bodyClientName = cleanBody
          .match(/([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)\s*\n[^\n]*\n?\s*\d{3}/m)?.[1]
          ?.trim()
        if (bodyClientName) {
          clientName = bodyClientName
        }
      }

      if (!clientName) {
        logger.warn('[Booksy] Could not extract client name from subject')
        return null
      }

      // ── Early return for cancellation ──────────────────────────────────────
      if (type === 'cancel') {
        const dateResult = this.extractDateAndTime(cleanBody)
        if (!dateResult) {
          logger.warn('[Booksy] Could not extract date/time from cancellation email')
          return null
        }
        return {
          type: 'cancel',
          clientName,
          clientPhone: '',
          clientEmail: undefined,
          serviceName: '',
          price: 0,
          bookingDate: dateResult.date,
          bookingTime: dateResult.time,
          duration: dateResult.duration,
        }
      }

      // ── Early return for reschedule ─────────────────────────────────────────
      if (type === 'reschedule') {
        // "z dnia 27 października 2024 10:00" or "z dnia czwartek, 23 października 2025 10:45"
        const oldMatch = cleanBody.match(/z dnia\s+(?:[a-ząćęłńóśźż]+\s*,\s*)?(\d{1,2})\s+(.+?)\s+(\d{4})\s+(?:o\s+)?(\d{2}):(\d{2})/i)
        // "na 28 października 2024, 14:00 — 15:00"
        const newResult = this.extractDateAndTime(cleanBody)

        const isOtherTermin = /na\s+inny\s+termin/i.test(cleanBody)

        // Fallback: "Zmiany w rezerwacji czwartek, 30 kwietnia 2026 o 09:00" — old date is in subject
        const subjectOldMatch = !oldMatch && /Zmiany w rezerwacji/i.test(subject)
          ? subject.match(/(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})\s+o\s+(\d{2}):(\d{2})/i)
          : null

        if (!oldMatch && !subjectOldMatch) {
          logger.warn('[Booksy] Could not extract OLD date/time from reschedule email — proceeding with unknown')
        }

        if (!newResult && !isOtherTermin) {
          logger.warn('[Booksy] Could not extract NEW date/time from reschedule email — proceeding with unknown')
        }

        const oldDate = oldMatch
          ? this.buildDate(oldMatch[1], oldMatch[2], oldMatch[3])
          : subjectOldMatch
            ? this.buildDate(subjectOldMatch[1], subjectOldMatch[2], subjectOldMatch[3])
            : 'unknown'
        const oldTime = oldMatch
          ? `${oldMatch[4]}:${oldMatch[5]}`
          : subjectOldMatch
            ? `${subjectOldMatch[4]}:${subjectOldMatch[5]}`
            : 'unknown'

        // Try to extract service name and price from the appointment detail block.
        let rescheduleServiceName = ''
        let reschedulePrice = 0
        const rescheduleLines = cleanBody.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        const reschedulePriceIdx = rescheduleLines.findIndex((l) => /[\d]+,\d{2}\s*z[łl]/i.test(l))
        if (reschedulePriceIdx >= 0) {
          const priceM = rescheduleLines[reschedulePriceIdx].match(/([\d]+,\d{2})\s*z[łl]/i)
          if (priceM) reschedulePrice = parseFloat(priceM[1].replace(',', '.'))
          for (let i = Math.max(0, reschedulePriceIdx - 2); i < reschedulePriceIdx; i++) {
            const l = rescheduleLines[i]
            if (!l || /https?:\/\//i.test(l) || /mailto:/i.test(l)) continue
            const colon = l.indexOf(':')
            rescheduleServiceName = colon >= 0 ? l.slice(colon + 1).trim() : l.trim()
          }
        }

        return {
          type: 'reschedule',
          clientName,
          clientPhone: '',
          clientEmail: undefined,
          serviceName: rescheduleServiceName,
          price: reschedulePrice,
          bookingDate: newResult ? newResult.date : 'unknown',
          bookingTime: newResult ? newResult.time : 'unknown',
          duration: newResult ? newResult.duration : 0,
          oldDate,
          oldTime,
        }
      }

      // ── 'new' booking — full extraction ────────────────────────────────────

      const phoneMatch = cleanBody.match(/(\d{3}\s?\d{3}\s?\d{3})/m)
      const clientPhone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : ''

      // Extract email (optional)
      const emailMatch = cleanBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/m)
      const clientEmail = emailMatch ? emailMatch[1] : undefined

      // Extract service name and price. Booksy email layouts vary.
      let serviceName = ''
      let price = 0
      // No `s` (dotall) flag — `.` must not match newlines, otherwise the lazy
      // `.+?` captures the entire body up to the first price line (Bug B).
      const serviceMatch = cleanBody.match(/\n\n(.+?)\n([\d,]+)\s*z[łl]/m)
      if (serviceMatch) {
        serviceName = serviceMatch[1].trim()
        price = parseFloat(serviceMatch[2].replace(',', '.'))
      } else {
        const lines = cleanBody
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)

        const priceLineIndex = lines.findIndex((line) => /[\d]+,\d{2}\s*z[łl]/i.test(line))
        if (priceLineIndex >= 0) {
          const priceMatch = lines[priceLineIndex].match(/([\d]+,\d{2})\s*z[łl]/i)
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(',', '.'))
          }

          for (let i = Math.max(0, priceLineIndex - 2); i < priceLineIndex; i++) {
            const line = lines[i]
            if (!line || /https?:\/\//i.test(line) || /mailto:/i.test(line)) continue

            const colonPos = line.indexOf(':')
            if (colonPos >= 0 && colonPos < line.length - 1) {
              serviceName = line.slice(colonPos + 1).trim()
            } else {
              serviceName = line.trim()
            }
          }
        }
      }

      if (!serviceName) {
        logger.warn('[Booksy] Could not reliably extract service name')
      }

      // Extract date and time
      // Format: "27 paĹşdziernika 2024, 16:00 - 17:00" (after cleaning, it's a simple dash)
      // Use .+? instead of \w+ to match Polish characters (Ä…, Ä‡, Ä™, Ĺ‚, Ĺ„, Ăł, Ĺ›, Ĺş, ĹĽ)
      const dateMatch = cleanBody.match(/(\d{1,2})\s+(.+?)\s+(\d{4}),\s+(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/m)

      if (!dateMatch) {
        logger.warn('[Booksy] Could not extract date/time from body')
        return null
      }

      const day = dateMatch[1].padStart(2, '0')
      const monthName = dateMatch[2]
      const year = dateMatch[3]
      const startHour = dateMatch[4]
      const startMinute = dateMatch[5]
      const endHour = dateMatch[6]
      const endMinute = dateMatch[7]

      // Convert Polish month name to number.
      const normalizeText = (value: string) =>
        value
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()

      const monthMap: Record<string, string> = {
        stycznia: '01',
        lutego: '02',
        marca: '03',
        kwietnia: '04',
        maja: '05',
        czerwca: '06',
        lipca: '07',
        sierpnia: '08',
        wrzesnia: '09',
        pazdziernika: '10',
        listopada: '11',
        grudnia: '12',
      }
      const month = monthMap[normalizeText(monthName)] || '01'

      const bookingDate = `${year}-${month}-${day}`
      const bookingTime = `${startHour}:${startMinute}`

      // Calculate duration in minutes
      const startMins = parseInt(startHour) * 60 + parseInt(startMinute)
      const endMins = parseInt(endHour) * 60 + parseInt(endMinute)
      const duration = endMins - startMins

      // Extract employee name
      // Format: "Pracownik:\nKasia"
      const employeeMatch = cleanBody.match(/(?:Pracownik|Specjalista)\s*:\s*(.+?)(?:\n|$)/im)
      const employeeName = employeeMatch ? employeeMatch[1].trim() : undefined

      if (!employeeName) {
        logger.warn('[Booksy] Could not extract employee name - fallback resolution will be used')
      }

      const parsed = {
        type,
        clientName,
        clientPhone,
        clientEmail,
        serviceName,
        price,
        bookingDate,
        bookingTime,
        employeeName,
        duration,
      }

      logger.info('[Booksy] Email parsed', {
        type,
        serviceName: parsed.serviceName,
        date: parsed.bookingDate,
        hasPhone: !!parsed.clientPhone,
        hasEmail: !!parsed.clientEmail,
      })

      return parsed
    } catch (error) {
      logger.error('[Booksy] Parse error', error as Error)
      return null
    }
  }

  /**
   * Find or create client by phone
   */
  private async findOrCreateClient(parsed: ParsedBooking) {
    // Reject bookings with garbage/missing client data to prevent dirty records
    if (!parsed.clientName || parsed.clientName.trim().length < 2) {
      throw new Error(`Invalid client name: "${parsed.clientName}"`)
    }
    // Try to find existing client by phone (or by name if phone missing)
    if (parsed.clientPhone) {
      const { data: existingClient } = await this.supabase
        .from('clients')
        .select('*')
        .eq('salon_id', this.salonId)
        .eq('phone', parsed.clientPhone)
        .maybeSingle()

      if (existingClient) {
        return existingClient
      }
    } else {
      // No phone in email — try name-based lookup
      const { data: existingByName } = await this.supabase
        .from('clients')
        .select('*')
        .eq('salon_id', this.salonId)
        .ilike('full_name', parsed.clientName.trim())
        .maybeSingle()

      if (existingByName) {
        return existingByName
      }
    }

    const settings = await this.getAutomationSettings()
    if (!settings.autoCreateClients) {
      throw new Error(`Client not found: ${parsed.clientName}`)
    }

    // Generate client code
    const { data: codeData } = await this.supabase.rpc('generate_client_code', {
      salon_uuid: this.salonId,
    })
    const generatedCode = typeof codeData === 'string' ? codeData.trim() : ''
    const fallbackCode = `BK${Date.now().toString(36).toUpperCase().slice(-6)}`
    const clientCode = generatedCode || fallbackCode

    // Create new client (phone may be null if not provided in email)
    const { data: newClient, error } = await this.supabase
      .from('clients')
      .insert({
        salon_id: this.salonId,
        client_code: clientCode,
        full_name: parsed.clientName,
        phone: parsed.clientPhone || null,
        email: parsed.clientEmail || null,
      })
      .select()
      .single()

    if (error) {
      const isClientCodeConflict =
        error.code === '23505' &&
        String(error.message || '').includes('clients_salon_id_client_code_key')

      if (!isClientCodeConflict) throw error

      const fallbackClientCode = `BK${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
      const { data: retriedClient, error: retryError } = await this.supabase
        .from('clients')
        .insert({
          salon_id: this.salonId,
          client_code: fallbackClientCode,
          full_name: parsed.clientName,
          phone: parsed.clientPhone || null,
          email: parsed.clientEmail || null,
        })
        .select()
        .single()

      if (retryError) throw retryError
      return retriedClient
    }

    return newClient
  }

  private async getAutomationSettings(): Promise<BooksyAutomationSettings> {
    if (!this.automationSettingsPromise) {
      this.automationSettingsPromise = this.loadAutomationSettings()
    }

    return this.automationSettingsPromise
  }

  private async loadAutomationSettings(): Promise<BooksyAutomationSettings> {
    const defaults: BooksyAutomationSettings = {
      autoCreateClients: true,
      autoCreateServices: false,
    }

    const { data, error } = await this.supabase
      .from('salon_settings')
      .select('booksy_auto_create_clients, booksy_auto_create_services')
      .eq('salon_id', this.salonId)
      .maybeSingle()

    if (error) {
      logger.warn('[Booksy] Failed to load automation settings, using defaults', {
        error: error.message,
        salonId: this.salonId,
      })
      return defaults
    }

    return {
      autoCreateClients: data?.booksy_auto_create_clients ?? defaults.autoCreateClients,
      autoCreateServices: data?.booksy_auto_create_services ?? defaults.autoCreateServices,
    }
  }

  /**
   * Find employee by name (first_name or last_name)
   */
  private async findEmployeeByName(name: string) {
    const { data: employees } = await this.supabase
      .from('employees')
      .select('*')
      .eq('salon_id', this.salonId)
      .is('deleted_at', null)

    if (!employees || employees.length === 0) {
      return null
    }

    const normalizeText = (value: string) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    const nameLower = normalizeText(name)
    const scoreEmployee = (emp: any) => {
      const firstName = normalizeText(emp.first_name || '')
      const lastName = normalizeText(emp.last_name || '')
      const fullName = normalizeText(`${emp.first_name || ''} ${emp.last_name || ''}`)
      const activeBonus = emp.active ? 0.1 : 0
      if (firstName === nameLower || lastName === nameLower || fullName === nameLower) {
        return 3 + activeBonus
      }
      if (firstName.includes(nameLower) || lastName.includes(nameLower) || fullName.includes(nameLower)) {
        return 2 + activeBonus
      }

      const nameTokens = nameLower.split(' ').filter(Boolean)
      const tokenHit = nameTokens.some((t) => firstName.includes(t) || lastName.includes(t) || fullName.includes(t))
      if (tokenHit) {
        return 1 + activeBonus
      }

      return 0
    }

    const ranked = employees
      .map((emp) => ({ emp, score: scoreEmployee(emp) }))
      .sort((a, b) => b.score - a.score)

    if (ranked[0]?.score > 0) {
      return ranked[0].emp
    }

    logger.warn('[Booksy] No employee match', { searchedName: name, candidateCount: employees.length })

    return null
  }

  /**
   * Resolve employee by name, fallback to the only active employee.
   */
  private async resolveEmployee(name?: string) {
    if (name?.trim()) {
      const byName = await this.findEmployeeByName(name)
      if (byName) {
        return byName
      }
    }

    const { data: employees } = await this.supabase
      .from('employees')
      .select('*')
      .eq('salon_id', this.salonId)
      .is('deleted_at', null)

    if (!employees || employees.length === 0) {
      return null
    }

    const activeEmployees = employees.filter((employee) => employee.active)
    if (activeEmployees.length === 1) {
      return activeEmployees[0]
    }

    if (activeEmployees.length === 0 && employees.length === 1) {
      return employees[0]
    }

    return null
  }

  /**
   * Find service by name — 4-level fuzzy matching with Polish diacritic normalization
   */
  private async findServiceByName(name: string) {
    const { data: services, error } = await this.supabase
      .from('services')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('active', true)

    if (error) {
      logger.error('[Booksy] Failed to fetch services', error)
      return null
    }

    if (!services || services.length === 0) {
      logger.warn('[Booksy] No active services found')
      return null
    }

    const normalize = (s: string) =>
      s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

    const raw = name.toLowerCase().trim()
    const norm = normalize(name)

    // 1. Exact match
    let match = services.find((svc) => svc.name.toLowerCase().trim() === raw)

    // 2. Exact match after diacritic normalization (handles encoding mismatches)
    if (!match) {
      match = services.find((svc) => normalize(svc.name) === norm)
    }

    // 3. DB name contains parsed name (substring)
    if (!match) {
      match = services.find((svc) => normalize(svc.name).includes(norm))
    }

    // 4. Parsed name contains DB name (reverse substring — shorter DB name)
    if (!match) {
      match = services.find((svc) => norm.includes(normalize(svc.name)))
    }

    if (match) {
      logger.info('[Booksy] Service matched', { serviceId: match.id })
    } else {
      logger.warn('[Booksy] Service not found', { serviceName: name, availableCount: services.length })
    }

    return match || null
  }

  private sanitizeServiceNameForAutoCreate(name: string): string | null {
    const cleaned = name.replace(/\s+/g, ' ').trim()

    if (cleaned.length < 2 || cleaned.length > 160) {
      return null
    }

    if (/https?:\/\//i.test(cleaned) || /mailto:/i.test(cleaned) || /^\[image:/i.test(cleaned)) {
      return null
    }

    return cleaned
  }

  private async createServiceFromParsedBooking(parsed: ParsedBooking) {
    const serviceName = this.sanitizeServiceNameForAutoCreate(parsed.serviceName)

    if (!serviceName) {
      throw new ServiceNotFoundError(`Service not found: ${parsed.serviceName}`)
    }

    const { data: service, error } = await this.supabase
      .from('services')
      .insert({
        salon_id: this.salonId,
        category: 'Booksy',
        subcategory: 'Import Booksy',
        name: serviceName,
        price: parsed.price && parsed.price > 0 ? parsed.price : 0,
        duration: parsed.duration && parsed.duration > 0 ? parsed.duration : 30,
        surcharge_allowed: true,
        active: true,
      })
      .select()
      .single()

    if (error) {
      logger.error('[Booksy] Failed to auto-create service', error, { serviceName })
      throw error
    }

    logger.info('[Booksy] Service auto-created', { serviceId: service.id, serviceName })
    return service
  }

  /**
   * Create booking
   */
  private async createBooking(data: {
    clientId: string
    employeeId: string
    serviceId: string
    bookingDate: string
    bookingTime: string
    duration: number
    price: number
    notes?: string | null
  }) {
    const { data: existing } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('client_id', data.clientId)
      .eq('employee_id', data.employeeId)
      .eq('service_id', data.serviceId)
      .eq('booking_date', data.bookingDate)
      .eq('booking_time', data.bookingTime)
      .eq('source', 'booksy')
      .neq('status', 'cancelled')
      .maybeSingle()

    if (existing) {
      return existing
    }

    const { data: booking, error } = await this.supabase
      .from('bookings')
      .insert({
        salon_id: this.salonId,
        client_id: data.clientId,
        employee_id: data.employeeId,
        service_id: data.serviceId,
        booking_date: data.bookingDate,
        booking_time: data.bookingTime,
        duration: data.duration,
        base_price: data.price,
        notes: data.notes ?? null,
        status: 'scheduled',
        source: 'booksy',
      })
      .select()
      .single()

    if (error) throw error
    return booking
  }

  private async findBookingByEventMarker(eventMarker: string) {
    const { data: booking } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('source', 'booksy')
      .eq('notes', eventMarker)
      .maybeSingle()

    return booking ?? null
  }

  /**
   * Save a failed email to booksy_pending_emails for manual review
   */
  private async savePendingEmail(data: {
    messageId: string
    subject: string
    body: string
    parsed?: ParsedBooking | null
    reason: 'parse_failed' | 'service_not_found' | 'employee_not_found' | 'cancel_not_found' | 'reschedule_not_found' | 'other'
    detail: string
  }) {
    const { error } = await this.supabase
      .from('booksy_pending_emails')
      .upsert(
        {
          salon_id: this.salonId,
          message_id: data.messageId,
          subject: data.subject,
          body_snippet: data.body.slice(0, 2000),
          parsed_data: data.parsed ?? null,
          failure_reason: data.reason,
          failure_detail: data.detail,
          status: 'pending',
        },
        { onConflict: 'salon_id,message_id' }
      )

    if (error) {
      logger.error('[Booksy] Failed to save pending email', error)
    } else {
      logger.info('[Booksy] Saved to pending queue')
    }
  }

  /**
   * Mark a pending email as resolved (booking was created successfully on retry)
   */
  private async resolvePendingEmail(messageId: string) {
    await this.supabase
      .from('booksy_pending_emails')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('salon_id', this.salonId)
      .eq('message_id', messageId)
  }

  /**
   * Extract date and time range from Booksy email body
   * Matches: "22 października 2025, 18:30 - 19:30" or with em/en dashes
   */
  private extractDateAndTime(body: string): { date: string; time: string; duration: number } | null {
    const m = body.match(/(\d{1,2})\s+(.+?)\s+(\d{4}),\s+(\d{2}):(\d{2})\s*[-–—]\s*(\d{2}):(\d{2})/m)
    if (!m) return null

    const date = this.buildDate(m[1], m[2], m[3])
    const time = `${m[4]}:${m[5]}`
    const startMins = parseInt(m[4]) * 60 + parseInt(m[5])
    const endMins = parseInt(m[6]) * 60 + parseInt(m[7])
    const duration = endMins - startMins

    return { date, time, duration }
  }

  /**
   * Convert Polish day/month-name/year into YYYY-MM-DD
   */
  private buildDate(day: string, monthName: string, year: string): string {
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

    const monthMap: Record<string, string> = {
      stycznia: '01', lutego: '02', marca: '03', kwietnia: '04',
      maja: '05', czerwca: '06', lipca: '07', sierpnia: '08',
      wrzesnia: '09', pazdziernika: '10', listopada: '11', grudnia: '12',
    }

    const month = monthMap[normalize(monthName)] || '01'
    return `${year}-${month}-${day.padStart(2, '0')}`
  }
}

export async function applyParsedEvent(parsedEventId: string, options?: ApplyParsedEventOptions): Promise<any> {
  const supabase = createAdminSupabaseClient()
  const { data: parsedEvent, error: parsedEventError } = await supabase
    .from('booksy_parsed_events')
    .select('salon_id')
    .eq('id', parsedEventId)
    .single()

  if (parsedEventError) {
    throw parsedEventError
  }

  const processor = new BooksyProcessor(supabase as unknown as SupabaseClient, parsedEvent.salon_id)
  return processor.applyParsedEvent(parsedEventId, options)
}
