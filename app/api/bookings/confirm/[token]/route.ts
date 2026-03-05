import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { verifyBookingConfirmToken } from '@/lib/messaging/booking-confirm-token'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function htmlResponse(title: string, message: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; background:#f8fafc; margin:0; }
      main { max-width:560px; margin:10vh auto; background:#fff; border-radius:12px; padding:32px; box-shadow:0 8px 30px rgba(15,23,42,.08); }
      h1 { margin:0 0 12px; color:#0f172a; font-size:24px; }
      p { margin:0; color:#475569; line-height:1.55; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`

  return new NextResponse(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const action = request.nextUrl.searchParams.get('action') === 'cancel' ? 'cancel' : 'confirm'
    const nextStatus = action === 'cancel' ? 'cancelled' : 'confirmed'

    const payload = await verifyBookingConfirmToken(token)
    const admin = createAdminSupabaseClient()

    let query = (admin as any)
      .from('bookings')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', payload.bookingId)
      .eq('salon_id', payload.salonId)

    // Guard: only confirm bookings that are still in an active state.
    // Prevents re-confirming already cancelled/completed bookings via a stale link.
    if (action === 'confirm') {
      query = query.in('status', ['pending', 'scheduled'])
    }

    const { data, error } = await query.select('id').maybeSingle()

    if (error) {
      return htmlResponse('Wystąpił błąd', error.message, 500)
    }

    if (!data?.id) {
      return htmlResponse('Wizyta nie znaleziona', 'Ten link jest nieprawidłowy lub wygasł.', 404)
    }

    if (action === 'cancel') {
      return htmlResponse('Wizyta anulowana', 'Dziękujemy. Wizyta została anulowana.')
    }

    return htmlResponse('Wizyta potwierdzona', 'Dziękujemy. Wizyta została potwierdzona.')
  } catch {
    return htmlResponse('Nieprawidłowy link', 'Token potwierdzenia jest błędny lub wygasł.', 400)
  }
}
