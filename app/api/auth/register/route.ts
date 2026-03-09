import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkPublicApiRateLimit, getClientIp } from '@/lib/middleware/rate-limit'

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(1),
    salonName: z.string().min(1),
    salonSlug: z
        .string()
        .min(2)
        .regex(/^[a-z0-9-]+$/, 'Slug może zawierać tylko małe litery, cyfry i myślniki'),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
    // Strict rate limit: 5 registrations per minute per IP (anti-abuse)
    const ip = getClientIp(req.headers)
    const rl = await checkPublicApiRateLimit(`register:${ip}`, { limit: 5 })
    if (!rl.success) {
        return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
            { status: 400 }
        )
    }

    const { email, password, fullName, salonName, salonSlug } = parsed.data

    const supabase = createAdminSupabaseClient()

    // 1. Create auth user via admin API (server-side only, service role)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // user still needs to verify email
    })

    if (authError) {
        if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
            return NextResponse.json({ error: 'Konto z podanym adresem email już istnieje', field: 'email' }, { status: 409 })
        }
        return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
        return NextResponse.json({ error: 'Nie udało się utworzyć użytkownika' }, { status: 500 })
    }

    const userId = authData.user.id

    // 2. Create salon (server-side — not trusted from client)
    const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .insert({
            slug: salonSlug,
            name: salonName,
            owner_email: email,
        } as any)
        .select('id')
        .single()

    if (salonError) {
        // Rollback: delete the auth user to avoid ghost accounts
        await supabase.auth.admin.deleteUser(userId)

        if (salonError.code === '23505') {
            return NextResponse.json({ error: 'Ten URL salonu jest już zajęty', field: 'salonSlug' }, { status: 409 })
        }
        return NextResponse.json({ error: 'Nie udało się utworzyć salonu' }, { status: 500 })
    }

    const salonId = (salonData as any).id

    // 3. Create profile with role: owner (role is assigned server-side — never trusted from client)
    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            user_id: userId,
            salon_id: salonId,
            full_name: fullName,
            role: 'owner',
        } as any)

    if (profileError) {
        // Rollback: delete salon and auth user
        await supabase.from('salons').delete().eq('id', salonId)
        await supabase.auth.admin.deleteUser(userId)
        return NextResponse.json({ error: 'Nie udało się utworzyć profilu' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
}
