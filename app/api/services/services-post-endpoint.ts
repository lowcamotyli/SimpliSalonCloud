// Dodaj to do istniejącego /api/services/route.ts
// Po funkcji GET

import { z } from 'zod'

const createServiceSchema = z.object({
  category: z.string().min(2, 'Kategoria: minimum 2 znaki'),
  subcategory: z.string().min(2, 'Podkategoria: minimum 2 znaki'),
  name: z.string().min(2, 'Nazwa: minimum 2 znaki'),
  price: z.number().positive('Cena musi być większa od 0'),
  duration: z.number().int().min(15, 'Czas trwania: minimum 15 minut'),
  is_active: z.boolean().default(true),
})

// POST /api/services - Create new service
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = createServiceSchema.parse(body)

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        salon_id: profile.salon_id,
        category: validatedData.category,
        subcategory: validatedData.subcategory,
        name: validatedData.name,
        price: validatedData.price,
        duration: validatedData.duration,
        is_active: validatedData.is_active,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ service }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/services error:', error)
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
