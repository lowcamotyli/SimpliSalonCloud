# Faza 0 — Przygotowanie (4 pliki)

Repo: `lowcamotyli/SimpliSalonCloud`, branch `main`. Nie modyfikuj nic innego.

---

## 1. `.env.example.txt` — dodaj na koniec tego pliku dwie linię:

```
PUBLIC_SALON_ID=your-salon-uuid-here
PUBLIC_API_KEY=your-random-secret-key-here
```

---

## 2. Nowy plik: `supabase/migrations/20260204000000_add_website_source.sql`

```sql
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_source_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_source_check
  CHECK (source IN ('manual', 'booksy', 'api', 'website'));
```

---

## 3. Nowy plik: `lib/validators/public-booking.validators.ts`

```typescript
import { z } from 'zod'

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  serviceId: z.string().uuid(),
})

export const publicBookingSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\+?[0-9]{9,15}$/),
  email: z.string().email().optional(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
})

export type PublicBookingInput = z.infer<typeof publicBookingSchema>
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>
```

---

## 4. Nowy plik: `lib/middleware/api-key-auth.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

export function validateApiKey(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.PUBLIC_API_KEY

  if (!expectedKey) {
    console.error('PUBLIC_API_KEY not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
```

---

**Po skonieczeniu:** każdy kolejny endpoint w `/api/public/*` będzie importował `validateApiKey` z tego middleware i schemy z validators.
