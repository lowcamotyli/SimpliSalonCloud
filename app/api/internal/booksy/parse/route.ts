import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BooksyProcessor } from '@/lib/booksy/processor'
import { computeFingerprint } from '@/lib/booksy/fingerprint'
import { logger } from '@/lib/logger'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/supabase'

export const runtime = 'nodejs'

const RAW_EMAIL_BUCKET = 'booksy-raw-emails'
const PARSE_BATCH_LIMIT = 50
const INFORMATIONAL_SUBJECTS: RegExp[] = [
  /potwierdzenie propozycji zmiany terminu/i,
  /Twoje Faktury/i,
]

type AdminSupabaseClient = SupabaseClient<Database>
type RawEmailRow = Tables<'booksy_raw_emails'>

type ParsedBooking = {
  type: 'new' | 'cancel' | 'reschedule'
  clientName: string
  clientPhone: string
  clientEmail?: string
  serviceName: string
  bookingDate: string
  bookingTime: string
}

type ParsedEventPayload = {
  event_type: 'created' | 'cancelled' | 'rescheduled' | 'unknown'
  clientContact: string
  serviceName: string
  startAtUtc: string
  parsed: ParsedBooking
  raw: {
    subject: string
    fromAddress: string | null
    storagePath: string
  }
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization') ?? ''

  if (!secret) {
    return false
  }

  const expectedValues = [secret, `Bearer ${secret}`]

  return expectedValues.some((expected) => (
    authorization.length === expected.length &&
    timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
  ))
}

function splitMime(rawMime: string): { headers: Record<string, string>; body: string } {
  const normalized = rawMime.replace(/\r\n/g, '\n')
  const separator = normalized.indexOf('\n\n')

  if (separator === -1) {
    return { headers: {}, body: normalized }
  }

  const headerText = normalized.slice(0, separator)
  const body = normalized.slice(separator + 2)
  const headers: Record<string, string> = {}
  let currentHeader: string | null = null

  for (const line of headerText.split('\n')) {
    if (/^\s/.test(line) && currentHeader) {
      headers[currentHeader] = `${headers[currentHeader]} ${line.trim()}`
      continue
    }

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      continue
    }

    currentHeader = line.slice(0, colonIndex).trim().toLowerCase()
    headers[currentHeader] = line.slice(colonIndex + 1).trim()
  }

  return { headers, body }
}

function getHeaderParameter(headerValue: string | undefined, key: string): string | null {
  if (!headerValue) {
    return null
  }

  const pattern = new RegExp(`${key}="?([^";]+)"?`, 'i')
  return headerValue.match(pattern)?.[1] ?? null
}

function decodeQuotedPrintable(input: string): Buffer {
  const normalized = input.replace(/=\r?\n/g, '')
  const bytes: number[] = []

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16))
      index += 2
      continue
    }

    bytes.push(char.charCodeAt(0))
  }

  return Buffer.from(bytes)
}

function decodeBodyContent(body: string, encoding: string | undefined, charset: string | null): string {
  const normalizedEncoding = encoding?.toLowerCase() ?? '7bit'
  let buffer: Buffer

  if (normalizedEncoding.includes('base64')) {
    buffer = Buffer.from(body.replace(/\s+/g, ''), 'base64')
  } else if (normalizedEncoding.includes('quoted-printable')) {
    buffer = decodeQuotedPrintable(body)
  } else {
    buffer = Buffer.from(body, 'utf8')
  }

  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

function decodeMimeEncodedWord(match: string, charset: string, encoding: string, text: string): string {
  try {
    let buffer: Buffer

    if (String(encoding).toLowerCase() === 'b') {
      buffer = Buffer.from(text, 'base64')
    } else {
      buffer = decodeQuotedPrintable(String(text).replace(/_/g, ' '))
    }

    return new TextDecoder(String(charset).toLowerCase()).decode(buffer)
  } catch {
    return match
  }
}

function decodeMimeHeader(value: string): string {
  const encodedWordPattern = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g

  if (!encodedWordPattern.test(value)) {
    return value
  }

  encodedWordPattern.lastIndex = 0

  let result = ''
  let cursor = 0
  let previousWasEncoded = false
  let match: RegExpExecArray | null

  while ((match = encodedWordPattern.exec(value)) !== null) {
    const between = value.slice(cursor, match.index)
    if (!(previousWasEncoded && /^\s*$/.test(between))) {
      result += between
    }

    result += decodeMimeEncodedWord(match[0], match[1], match[2], match[3])
    cursor = match.index + match[0].length
    previousWasEncoded = true
  }

  result += value.slice(cursor)
  return result.replace(/\s{2,}/g, ' ').trim()
}

function extractMimeText(rawMime: string): { text: string | null; html: string | null } {
  const { headers, body } = splitMime(rawMime)
  const contentType = headers['content-type']?.toLowerCase() ?? 'text/plain'
  const boundary = getHeaderParameter(headers['content-type'], 'boundary')

  if (contentType.startsWith('multipart/') && boundary) {
    const boundaryMarker = `--${boundary}`
    const parts = body
      .split(boundaryMarker)
      .map((part) => part.trim())
      .filter((part) => part && part !== '--')

    let text: string | null = null
    let html: string | null = null

    for (const part of parts) {
      const cleanedPart = part.endsWith('--') ? part.slice(0, -2).trim() : part
      const extracted = extractMimeText(cleanedPart)
      text = text ?? extracted.text
      html = html ?? extracted.html

      if (text) {
        break
      }
    }

    return { text, html }
  }

  const charset = getHeaderParameter(headers['content-type'], 'charset')
  const decoded = decodeBodyContent(body, headers['content-transfer-encoding'], charset)

  if (contentType.includes('text/html')) {
    return { text: null, html: decoded }
  }

  return { text: decoded, html: null }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function normalizeBooksyBody(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n')
  const startMarkers = [
    'Rezerwacja z booksy',
    'Twój klient oczekuje na potwierdzenie rezerwacji',
    'Twoj klient oczekuje na potwierdzenie rezerwacji',
    'Klient ',
  ]

  const markerPositions = startMarkers
    .map((marker) => normalized.indexOf(marker))
    .filter((index) => index >= 0)
  const start = markerPositions.length > 0 ? Math.min(...markerPositions) : 0

  let focused = normalized.slice(start)

  const footerMarkers = [
    'Zarządzaj swoimi rezerwacjami',
    'Zarzadzaj swoimi rezerwacjami',
    'Rozwijaj biznes razem z Booksy',
  ]

  for (const marker of footerMarkers) {
    const footerIndex = focused.indexOf(marker)
    if (footerIndex >= 0) {
      focused = focused.slice(0, footerIndex)
    }
  }

  return focused
    .replace(/\[([^\]]+)\]<[^>]+>/g, '$1')
    .replace(/<mailto:([^>]+)>/gi, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/^\[[^\]]+\]$/gm, '')
    .replace(/^(From|Sent|To|Subject|Od|Data|Do|Temat):.*$/gim, '')
    .replace(/^\s*[-_]{2,}.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function extractServiceNameFromBody(body: string): string | null {
  const directMatch = body.match(/(?:^|\n)([^\n:]+:\s*[^\n]+)\n\d+,\d{2}\s*z/i)
  if (directMatch?.[1]) {
    return directMatch[1].split(':').slice(1).join(':').trim()
  }

  const lines = body
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const priceLineIndex = lines.findIndex((line) => /\d+,\d{2}\s*z/i.test(line))

  if (priceLineIndex <= 0) {
    return null
  }

  for (let index = priceLineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (
      !line ||
      /^tw[oó]j klient/i.test(line) ||
      /^[a-z]+,\s+\d{1,2}\s+[a-ząćęłńóśźż]+/i.test(line) ||
      /^\d{3}\s?\d{3}\s?\d{3}$/.test(line) ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)
    ) {
      continue
    }

    if (line.includes(':')) {
      return line.split(':').slice(1).join(':').trim()
    }

    return line.trim()
  }

  return null
}

function refineParsedBooking(parsed: ParsedBooking, body: string): ParsedBooking {
  const refined: ParsedBooking = { ...parsed }

  if (
    !parsed.serviceName ||
    (parsed.serviceName.includes(':') && !/^us[łl]uga:/i.test(parsed.serviceName)) ||
    parsed.serviceName.includes('\n') ||
    /twoj klient|twój klient|rezerwacja z booksy/i.test(parsed.serviceName)
  ) {
    const extractedServiceName = extractServiceNameFromBody(body)
    if (extractedServiceName) {
      refined.serviceName = extractedServiceName
    }
  }

  return refined
}

function toEventType(type: ParsedBooking['type']): ParsedEventPayload['event_type'] {
  if (type === 'new') return 'created'
  if (type === 'cancel') return 'cancelled'
  if (type === 'reschedule') return 'rescheduled'
  return 'unknown'
}

function toStartAtUtc(parsed: ParsedBooking): string {
  if (!parsed.bookingDate || !parsed.bookingTime || parsed.bookingDate === 'unknown' || parsed.bookingTime === 'unknown') {
    return new Date(0).toISOString()
  }

  const candidate = new Date(`${parsed.bookingDate}T${parsed.bookingTime}:00Z`)
  return Number.isNaN(candidate.getTime()) ? new Date(0).toISOString() : candidate.toISOString()
}

function resolveClientContact(parsed: ParsedBooking): string {
  if (parsed.clientEmail?.trim()) {
    return parsed.clientEmail.trim()
  }

  if (parsed.clientPhone.trim()) {
    return parsed.clientPhone.trim()
  }

  return parsed.clientName.trim()
}

function computeConfidence(raw: RawEmailRow, eventType: ParsedEventPayload['event_type']): number {
  let score = 0.7

  if ((raw.from_address ?? '').toLowerCase().includes('booksy')) {
    score += 0.15
  }

  if (eventType !== 'unknown') {
    score += 0.1
  }

  if (raw.ingest_source === 'manual_backfill') {
    score += 0.1
  }

  return Math.min(1, score)
}

async function downloadRawMime(supabase: AdminSupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RAW_EMAIL_BUCKET)
    .download(storagePath)

  if (error) {
    throw new Error(`Failed to download raw MIME: ${error.message}`)
  }

  return Buffer.from(await data.arrayBuffer()).toString('utf8')
}

function parseRawEmail(raw: RawEmailRow, rawMime: string): ParsedEventPayload {
  if (!raw.subject?.trim()) {
    throw new Error('Raw email subject missing')
  }

  const decodedSubject = decodeMimeHeader(raw.subject)

  const extracted = extractMimeText(rawMime)
  const rawTextBody = extracted.text?.trim() ?? ''
  const rawHtmlBody = extracted.html ? stripHtml(extracted.html) : ''

  // Prefer text/plain but fall back to HTML when text has no Booksy content.
  // Gmail-forwarded HTML-only Booksy emails have text/plain = forwarding headers only.
  const normalizedFromText = normalizeBooksyBody(rawTextBody)
  const normalizedBodyText = normalizedFromText || normalizeBooksyBody(rawHtmlBody)

  if (!normalizedBodyText) {
    throw new Error('Unable to extract MIME body text')
  }

  const processor = new BooksyProcessor({} as never, raw.salon_id) as unknown as {
    parseEmail: (subject: string, body: string) => ParsedBooking | null
  }
  const parsed = processor.parseEmail(decodedSubject, normalizedBodyText)

  if (!parsed) {
    throw new Error('BooksyProcessor could not parse email')
  }

  const refinedParsed = refineParsedBooking(parsed, normalizedBodyText)

  const eventType = toEventType(refinedParsed.type)
  const clientContact = resolveClientContact(refinedParsed)
  const serviceName = refinedParsed.serviceName || ''
  const startAtUtc = toStartAtUtc(refinedParsed)

  return {
    event_type: eventType,
    clientContact,
    serviceName,
    startAtUtc,
    parsed: refinedParsed,
    raw: {
      subject: decodedSubject,
      fromAddress: raw.from_address,
      storagePath: raw.storage_path ?? '',
    },
  }
}

async function markRawEmail(
  supabase: AdminSupabaseClient,
  raw: RawEmailRow,
  parseStatus: TablesUpdate<'booksy_raw_emails'>['parse_status']
): Promise<void> {
  const { error } = await supabase
    .from('booksy_raw_emails')
    .update({ parse_status: parseStatus })
    .eq('id', raw.id)
    .eq('salon_id', raw.salon_id)

  if (error) {
    throw new Error(`Failed to update raw email parse_status: ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  logger.info('Booksy parse worker: run started', {
    action: 'booksy_parse_start',
    batchLimit: PARSE_BATCH_LIMIT,
  })

  const { data: rawEmails, error } = await supabase
    .from('booksy_raw_emails')
    .select('*')
    .eq('parse_status', 'pending')
    .limit(PARSE_BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logger.info('Booksy parse worker: pending raw emails loaded', {
    action: 'booksy_parse_loaded_pending',
    pendingCount: rawEmails?.length ?? 0,
    rawEmailIds: (rawEmails ?? []).map((raw) => raw.id),
  })

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const raw of rawEmails ?? []) {
    const decodedSubjectForSkip = decodeMimeHeader(raw.subject ?? '')
    if (INFORMATIONAL_SUBJECTS.some((pattern) => pattern.test(decodedSubjectForSkip))) {
      try {
        await markRawEmail(supabase, raw, 'parsed')
      } catch {
        // ignore mark error
      }
      skipped += 1
      continue
    }

    try {
      logger.info('Booksy parse worker: processing raw email', {
        action: 'booksy_parse_processing_raw',
        rawEmailId: raw.id,
        salonId: raw.salon_id,
        gmailMessageId: raw.gmail_message_id,
        subjectPreview: raw.subject?.slice(0, 160) ?? null,
        decodedSubjectPreview: decodeMimeHeader(raw.subject ?? '').slice(0, 160),
        fromAddress: raw.from_address,
        storagePath: raw.storage_path,
        ingestSource: raw.ingest_source,
      })

      if (!raw.storage_path) {
        throw new Error('Raw email storage_path missing')
      }

      const rawMime = await downloadRawMime(supabase, raw.storage_path)
      logger.info('Booksy parse worker: raw MIME downloaded', {
        action: 'booksy_parse_mime_downloaded',
        rawEmailId: raw.id,
        salonId: raw.salon_id,
        rawMimeBytes: Buffer.byteLength(rawMime, 'utf8'),
      })

      const parsedPayload = parseRawEmail(raw, rawMime)
      const normalizedBodyPreview = normalizeBooksyBody(
        extractMimeText(rawMime).text?.trim() || (
          extractMimeText(rawMime).html ? stripHtml(extractMimeText(rawMime).html as string) : ''
        )
      ).slice(0, 240)
      logger.info('Booksy parse worker: normalized Booksy body prepared', {
        action: 'booksy_parse_body_normalized',
        rawEmailId: raw.id,
        salonId: raw.salon_id,
        bodyPreview: normalizedBodyPreview,
      })

      const confidenceScore = computeConfidence(raw, parsedPayload.event_type)
      const trustScore = confidenceScore
      const eventFingerprint = computeFingerprint(
        raw.salon_id,
        parsedPayload.event_type,
        parsedPayload.clientContact,
        parsedPayload.serviceName,
        parsedPayload.startAtUtc
      )

      logger.info('Booksy parse worker: parsed event payload computed', {
        action: 'booksy_parse_payload_computed',
        rawEmailId: raw.id,
        salonId: raw.salon_id,
        eventType: parsedPayload.event_type,
        clientContact: parsedPayload.clientContact,
        serviceName: parsedPayload.serviceName,
        startAtUtc: parsedPayload.startAtUtc,
        fingerprint: eventFingerprint,
        confidenceScore,
      })

      const insertPayload: TablesInsert<'booksy_parsed_events'> = {
        salon_id: raw.salon_id,
        booksy_raw_email_id: raw.id,
        event_type: parsedPayload.event_type,
        confidence_score: confidenceScore,
        trust_score: trustScore,
        event_fingerprint: eventFingerprint,
        payload: parsedPayload as Database['public']['Tables']['booksy_parsed_events']['Insert']['payload'],
        status: 'pending',
      }

      const { data: insertedRows, error: insertError } = await supabase
        .from('booksy_parsed_events')
        .upsert(insertPayload, {
          onConflict: 'salon_id,event_fingerprint',
          ignoreDuplicates: true,
        })
        .select('id')

      if (insertError) {
        throw new Error(`Failed to insert parsed event: ${insertError.message}`)
      }

      await markRawEmail(supabase, raw, 'parsed')

      if ((insertedRows?.length ?? 0) === 0) {
        skipped += 1
        logger.info('Booksy parse worker: parsed event deduplicated', {
          action: 'booksy_parse_deduplicated',
          rawEmailId: raw.id,
          salonId: raw.salon_id,
          fingerprint: eventFingerprint,
        })
      } else {
        processed += 1
        logger.info('Booksy parse worker: parsed event inserted', {
          action: 'booksy_parse_inserted',
          rawEmailId: raw.id,
          salonId: raw.salon_id,
          parsedEventIds: insertedRows.map((row) => row.id),
          fingerprint: eventFingerprint,
        })
      }
    } catch (routeError) {
      failed += 1

      logger.error('Booksy parse worker: failed to parse raw email', routeError, {
        action: 'booksy_parse_failed',
        rawEmailId: raw.id,
        salonId: raw.salon_id,
      })

      try {
        await markRawEmail(supabase, raw, 'failed')
      } catch (markError) {
        logger.error('Booksy parse worker: failed to mark raw email as failed', markError, {
          action: 'booksy_parse_mark_failed_error',
          rawEmailId: raw.id,
          salonId: raw.salon_id,
        })
      }
    }
  }

  logger.info('Booksy parse worker: run completed', {
    action: 'booksy_parse_completed',
    processed,
    skipped,
    failed,
  })

  return NextResponse.json({ processed, skipped, failed })
}
