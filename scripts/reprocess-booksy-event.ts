import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { applyParsedEvent } from '@/lib/booksy/processor'

type ParsedEventRow = {
  id: string
  salon_id: string
  status: string
  event_type: string
  payload: { parsed?: { clientName?: string; bookingDate?: string; bookingTime?: string } | null; eventMarker?: string | null } | null
  created_at: string
}

async function main() {
  const messageId = process.argv[2]
  const envFile = process.argv[3] ?? '.env.vercel.production'

  if (!messageId) {
    console.error('Usage: npx tsx scripts/reprocess-booksy-event.ts <gmail_message_id> [env_file]')
    process.exit(1)
  }

  dotenv.config({ path: envFile })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`)
    process.exit(1)
  }

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: rawRows, error: rawError } = await admin
    .from('booksy_raw_emails')
    .select('id, salon_id, created_at')
    .eq('gmail_message_id', messageId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (rawError) throw rawError
  if (!rawRows || rawRows.length === 0) {
    throw new Error(`No booksy_raw_emails row found for gmail_message_id=${messageId}`)
  }

  const raw = rawRows[0]

  const { data: parsedRows, error: parsedError } = await (admin.from('booksy_parsed_events') as any)
    .select('id, salon_id, status, event_type, payload, created_at')
    .eq('salon_id', raw.salon_id)
    .eq('booksy_raw_email_id', raw.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (parsedError) throw parsedError
  if (!parsedRows || parsedRows.length === 0) {
    throw new Error(`No booksy_parsed_events row found for raw_email_id=${raw.id}`)
  }

  const event = parsedRows[0] as ParsedEventRow
  const parsed = event.payload?.parsed ?? null

  console.log('Selected parsed event:', {
    id: event.id,
    salon_id: event.salon_id,
    status: event.status,
    event_type: event.event_type,
    clientName: parsed?.clientName ?? null,
    bookingDate: parsed?.bookingDate ?? null,
    bookingTime: parsed?.bookingTime ?? null,
    created_at: event.created_at,
  })

  const resetAt = new Date().toISOString()
  const { error: resetLedgerError } = await (admin.from('booksy_apply_ledger') as any)
    .update({
      operation: 'failed',
      error_message: '[manual_reprocess] reset for one-off replay after PROD hotfix',
      applied_at: resetAt,
    })
    .eq('booksy_parsed_event_id', event.id)
    .eq('salon_id', event.salon_id)
    .in('operation', ['skipped', 'updated', 'created'])

  if (resetLedgerError) throw resetLedgerError

  const result = await applyParsedEvent(event.id)
  console.log('applyParsedEvent result:', result)

  const { data: ledgerRows, error: ledgerError } = await (admin.from('booksy_apply_ledger') as any)
    .select('id, operation, target_id, error_message, applied_at')
    .eq('booksy_parsed_event_id', event.id)
    .eq('salon_id', event.salon_id)
    .order('applied_at', { ascending: false })
    .limit(1)

  if (ledgerError) throw ledgerError
  const latestLedger = Array.isArray(ledgerRows) ? ledgerRows[0] : null

  console.log('Latest ledger row:', latestLedger ?? null)

  if (latestLedger?.target_id) {
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, booking_date, booking_time, status, created_at')
      .eq('id', latestLedger.target_id)
      .eq('salon_id', event.salon_id)
      .maybeSingle()

    if (bookingError) throw bookingError
    console.log('Created/updated booking:', booking ?? null)
  }
}

main().catch((error) => {
  console.error('Reprocess failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})

