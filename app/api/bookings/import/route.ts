import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError, NotFoundError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

const REQUIRED_COLUMNS = [
  'data', 'godzina', 'klient_imie', 'klient_telefon',
  'usluga', 'pracownik', 'czas_min', 'cena'
]

const VALID_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'pending']

interface ImportRow {
  booking_date: string
  booking_time: string
  client_name: string
  client_phone: string
  client_email: string
  employee_id: string
  service_id: string
  duration: number
  price: number
  status: string
  notes: string
}

interface ImportError {
  row: number
  reason: string
}

// POST /api/bookings/import — bulk import bookings from pre-mapped JSON
export const POST = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const salonId = (profile as any).salon_id as string

  const body = await request.json()
  const rows: ImportRow[] = body.rows

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ValidationError('No rows to import')
  }

  if (rows.length > 500) {
    throw new ValidationError('Maximum 500 rows per import')
  }

  logger.info('Starting booking import', {
    salonId,
    userId: user.id,
    rowCount: rows.length,
  })

  const imported: string[] = []
  const errors: ImportError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    try {
      // Validate required fields
      if (!row.booking_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.booking_date)) {
        errors.push({ row: rowNum, reason: 'Nieprawidłowy format daty (wymagany: YYYY-MM-DD)' })
        continue
      }
      if (!row.booking_time || !/^\d{2}:\d{2}$/.test(row.booking_time)) {
        errors.push({ row: rowNum, reason: 'Nieprawidłowy format godziny (wymagany: HH:MM)' })
        continue
      }
      if (!row.employee_id) {
        errors.push({ row: rowNum, reason: 'Brak przypisanego pracownika' })
        continue
      }
      if (!row.service_id) {
        errors.push({ row: rowNum, reason: 'Brak przypisanej usługi' })
        continue
      }
      if (!row.client_name || row.client_name.trim().length < 2) {
        errors.push({ row: rowNum, reason: 'Brak imienia klienta (min. 2 znaki)' })
        continue
      }

      const price = Number(row.price)
      const duration = Number(row.duration)
      if (isNaN(price) || price < 0) {
        errors.push({ row: rowNum, reason: 'Nieprawidłowa cena' })
        continue
      }
      if (isNaN(duration) || duration <= 0) {
        errors.push({ row: rowNum, reason: 'Nieprawidłowy czas trwania' })
        continue
      }

      const status = VALID_STATUSES.includes(row.status) ? row.status : 'completed'

      // Find or create client
      let clientId: string | null = null
      const clientPhone = (row.client_phone || '').replace(/[\s\-\+()]/g, '')

      if (clientPhone) {
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id')
          .eq('salon_id', salonId)
          .eq('phone', clientPhone)
          .maybeSingle()

        if (existingClient) {
          clientId = (existingClient as any).id
        }
      }

      if (!clientId) {
        // Create new client
        const clientCode = `C${Date.now().toString().slice(-6)}${i}`

        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            salon_id: salonId,
            client_code: clientCode,
            full_name: row.client_name.trim(),
            phone: clientPhone || '000000000',
            email: row.client_email || null,
            visit_count: 0,
          } as any)
          .select('id')
          .single()

        if (clientError) {
          logger.warn('Failed to create client during import', {
            row: rowNum,
            error: clientError.message,
          })
          errors.push({ row: rowNum, reason: `Błąd tworzenia klienta: ${clientError.message}` })
          continue
        }
        clientId = (newClient as any).id
      }

      // Insert booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          salon_id: salonId,
          employee_id: row.employee_id,
          client_id: clientId,
          service_id: row.service_id,
          booking_date: row.booking_date,
          booking_time: row.booking_time,
          duration: duration,
          base_price: price,
          status: status,
          notes: row.notes || null,
          source: 'import',
          created_by: user.id,
        } as any)
        .select('id')
        .single()

      if (bookingError) {
        logger.warn('Failed to insert booking during import', {
          row: rowNum,
          error: bookingError.message,
        })
        errors.push({ row: rowNum, reason: `Błąd zapisu rezerwacji: ${bookingError.message}` })
        continue
      }

      imported.push((booking as any).id)

      // Increment client visit count
      if (clientId) {
        try {
          await supabase.rpc('increment_client_visits', { client_uuid: clientId } as any)
        } catch {
          // non-critical, ignore
        }
      }
    } catch (err: any) {
      errors.push({ row: rowNum, reason: err.message || 'Nieznany błąd' })
    }
  }

  logger.info('Booking import completed', {
    salonId,
    imported: imported.length,
    errors: errors.length,
    total: rows.length,
  })

  return NextResponse.json({
    imported: imported.length,
    skipped: errors.length,
    total: rows.length,
    errors,
  })
})
