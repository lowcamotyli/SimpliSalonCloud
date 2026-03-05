import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type Membership = {
  salon_id: string | null
}

type SmsWalletRow = {
  balance: number | null
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: rawProfile, error: profileError } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const profile = rawProfile as Membership | null

    if (!profile?.salon_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawWallet, error: walletError } = await (supabase as any)
      .from('sms_wallet')
      .select('balance')
      .eq('salon_id', profile.salon_id)
      .maybeSingle()

    if (walletError) {
      return NextResponse.json({ error: walletError.message }, { status: 500 })
    }

    const wallet = rawWallet as SmsWalletRow | null

    return NextResponse.json({ balance: Number(wallet?.balance ?? 0) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
