import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { availabilityQuerySchema } from '@/lib/validators/public-booking.validators'
import { getSalonId } from '@/lib/utils/salon'

export async function GET(request: NextRequest) {
    const authError = validateApiKey(request)
    if (authError) return authError

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = availabilityQuerySchema.safeParse(params)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
    }

    const { date, serviceId } = parsed.data
    const supabase = createAdminSupabaseClient()
    const salonId = getSalonId(request)

    // pobierz duration usługi
    const { data: service } = await supabase
        .from('services')
        .select('duration')
        .eq('id', serviceId)
        .eq('salon_id', salonId)
        .single()

    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

    // pobierz zajęte sloty tego dnia (niezanulowane)
    const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_time, duration, employee_id')
        .eq('salon_id', salonId)
        .eq('booking_date', date)
        .not('status', 'eq', 'cancelled')
        .is('deleted_at', null)

    // generuj sloty co 30 min, 8:00–20:00
    const slots: string[] = []
    for (let h = 8; h < 20; h++) {
        for (const m of [0, 30]) {
            const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            // sprawdź czy slot + duration nie wchodzi w zajęty booking
            const slotStart = h * 60 + m
            const slotEnd = slotStart + service.duration
            if (slotEnd > 20 * 60) continue // nie wykracza poza zamknięcie

            const conflict = bookings?.some((b) => {
                const [bh, bm] = b.booking_time.split(':').map(Number)
                const bStart = bh * 60 + bm
                const bEnd = bStart + b.duration
                return slotStart < bEnd && slotEnd > bStart
            })

            if (!conflict) slots.push(time)
        }
    }

    return NextResponse.json({ date, serviceId, slots })
}
