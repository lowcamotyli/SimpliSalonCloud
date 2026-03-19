import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = validateCronSecret(request)
  if (authError) return authError

  try {
    const admin = createAdminSupabaseClient()
    const now = new Date().toISOString()

    const { data, error } = await admin
      .from('vouchers')
      .update({
        status: 'expired',
        current_balance: 0,
      })
      .eq('status', 'active')
      .lt('expires_at', now)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ expired: data?.length ?? 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
