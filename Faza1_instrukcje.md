# Faza 1 — Public API endpointy (4 pliki)

Repo: `lowcamotyli/SimpliSalonCloud`, branch `main`.
Każdy plik to nowy `route.ts` w `app/api/public/`.
Imports: `validateApiKey` z `@/lib/middleware/api-key-auth`, supabase z `@/lib/supabase/admin`.

---

## 1. Nowy plik: `app/api/public/services/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request)
  if (authError) return authError

  const supabase = createAdminSupabaseClient()
  const salonId = process.env.PUBLIC_SALON_ID!

  const { data, error } = await supabase
    .from('services')
    .select('id, name, category, subcategory, duration, price')
    .eq('salon_id', salonId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('category')
    .order('name')

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })

  return NextResponse.json({ services: data })
}
```

---

## 2. Nowy plik: `app/api/public/employees/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request)
  if (authError) return authError

  const supabase = createAdminSupabaseClient()
  const salonId = process.env.PUBLIC_SALON_ID!

  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name')
    .eq('salon_id', salonId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('first_name')

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })

  return NextResponse.json({ employees: data })
}
```

---

## 3. Nowy plik: `app/api/public/availability/route.ts`

Query params: `?date=2026-02-10&serviceId=<uuid>`
Zwraca wolne sloty dla tego dnia (co 30 min, w godzinach 8:00–20:00), wykluczając zajęte.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { availabilityQuerySchema } from '@/lib/validators/public-booking.validators'

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
  const salonId = process.env.PUBLIC_SALON_ID!

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
```

---

## 4. Nowy plik: `app/api/public/bookings/route.ts`

POST — tworzy rezerwację. Sprawdza overlap, tworzy client jeśli nie istnieje (po telefonie), wstawia booking ze `source: 'website'`.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { publicBookingSchema } from '@/lib/validators/public-booking.validators'

export async function POST(request: NextRequest) {
  const authError = validateApiKey(request)
  if (authError) return authError

  const body = await request.json()
  const parsed = publicBookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }

  const { name, phone, email, serviceId, date, time } = parsed.data
  const supabase = createAdminSupabaseClient()
  const salonId = process.env.PUBLIC_SALON_ID!

  // pobierz usługę (duration, price)
  const { data: service } = await supabase
    .from('services')
    .select('duration, price')
    .eq('id', serviceId)
    .eq('salon_id', salonId)
    .single()

  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  // overlap check — zajęte sloty tego dnia
  const { data: bookings } = await supabase
    .from('bookings')
    .select('booking_time, duration')
    .eq('salon_id', salonId)
    .eq('booking_date', date)
    .not('status', 'eq', 'cancelled')
    .is('deleted_at', null)

  const [h, m] = time.split(':').map(Number)
  const newStart = h * 60 + m
  const newEnd = newStart + service.duration

  const conflict = bookings?.some((b) => {
    const [bh, bm] = b.booking_time.split(':').map(Number)
    const bStart = bh * 60 + bm
    const bEnd = bStart + b.duration
    return newStart < bEnd && newEnd > bStart
  })

  if (conflict) {
    return NextResponse.json({ error: 'Time slot not available' }, { status: 409 })
  }

  // find or create client po telefonie
  let { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('salon_id', salonId)
    .eq('phone', phone)
    .is('deleted_at', null)
    .single()

  if (!client) {
    const { data: newClient } = await supabase
      .from('clients')
      .insert({ salon_id: salonId, full_name: name, phone, email: email || null })
      .select('id')
      .single()
    client = newClient
  }

  // create booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      salon_id: salonId,
      client_id: client!.id,
      service_id: serviceId,
      booking_date: date,
      booking_time: time,
      duration: service.duration,
      base_price: service.price,
      status: 'pending',
      source: 'website',
    })
    .select('id, status, booking_date, booking_time')
    .single()

  if (error) return NextResponse.json({ error: 'Booking failed' }, { status: 500 })

  return NextResponse.json({ booking }, { status: 201 })
}
```

---

**Struktura po tej fazie:**
```
app/api/public/
├── services/route.ts      GET  → lista usług
├── employees/route.ts     GET  → lista pracowników
├── availability/route.ts  GET  → wolne sloty
└── bookings/route.ts      POST → nowa rezerwacja
```
