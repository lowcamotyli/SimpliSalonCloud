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

function computeConfidence(fromAddress: string | null, eventType: ParsedEventPayload['event_type']): number {
  let score = 0.7

  if ((fromAddress ?? '').toLowerCase().includes('booksy')) {
    score += 0.15
  }

  if (eventType !== 'unknown') {
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

  const extracted = extractMimeText(rawMime)
  const bodyText = extracted.text?.trim() || (extracted.html ? stripHtml(extracted.html) : '')

  if (!bodyText) {
    throw new Error('Unable to extract MIME body text')
  }

  const processor = new BooksyProcessor({} as never, raw.salon_id) as unknown as {
    parseEmail: (subject: string, body: string) => ParsedBooking | null
  }
  const parsed = processor.parseEmail(raw.subject, bodyText)

  if (!parsed) {
    throw new Error('BooksyProcessor could not parse email')
  }

  const eventType = toEventType(parsed.type)
  const clientContact = resolveClientContact(parsed)
  const serviceName = parsed.serviceName || ''
  const startAtUtc = toStartAtUtc(parsed)

  return {
    event_type: eventType,
    clientContact,
    serviceName,
    startAtUtc,
    parsed,
    raw: {
      subject: raw.subject,
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

  const { data: rawEmails, error } = await supabase
    .from('booksy_raw_emails')
    .select('*')
    .eq('parse_status', 'pending')
    .limit(PARSE_BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const raw of rawEmails ?? []) {
    try {
      if (!raw.storage_path) {
        throw new Error('Raw email storage_path missing')
      }

      const rawMime = await downloadRawMime(supabase, raw.storage_path)
      const parsedPayload = parseRawEmail(raw, rawMime)
      const confidenceScore = computeConfidence(raw.from_address, parsedPayload.event_type)
      const trustScore = confidenceScore
      const eventFingerprint = computeFingerprint(
        raw.salon_id,
        parsedPayload.event_type,
        parsedPayload.clientContact,
        parsedPayload.serviceName,
        parsedPayload.startAtUtc
      )

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
      } else {
        processed += 1
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

  return NextResponse.json({ processed, skipped, failed })
}
