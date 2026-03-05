import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createPrzelewy24Client } from '@/lib/payments/przelewy24-client'

type SmsPackageSize = 100 | 500 | 1000

interface SmsTopupRequest {
  packageSize: SmsPackageSize
}

const SMS_PACKAGE_PRICES_CENTS: Record<SmsPackageSize, number> = {
  100: 1500,
  500: 6500,
  1000: 12000,
}

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

    let body: SmsTopupRequest
    try {
      body = (await request.json()) as SmsTopupRequest
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { packageSize } = body
    if (!packageSize || !(packageSize in SMS_PACKAGE_PRICES_CENTS)) {
      return NextResponse.json(
        { error: 'Invalid packageSize. Allowed: 100, 500, 1000' },
        { status: 400 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile?.salon_id) {
      return NextResponse.json({ error: 'User not associated with salon' }, { status: 403 })
    }

    const salonId = profile.salon_id
    const admin = createAdminSupabaseClient() as any

    const { data: salon, error: salonError } = await admin
      .from('salons')
      .select('id, name, slug, owner_email, billing_email')
      .eq('id', salonId)
      .single()

    if (salonError || !salon) {
      throw new Error(`Failed to fetch salon: ${salonError?.message || 'Salon not found'}`)
    }

    const email = salon.billing_email || salon.owner_email || user.email
    if (!email) {
      return NextResponse.json({ error: 'Salon email is missing' }, { status: 400 })
    }

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      throw new Error('APP_URL or NEXT_PUBLIC_APP_URL is required')
    }

    const amount = SMS_PACKAGE_PRICES_CENTS[packageSize]
    const subtotalCents = Math.round(amount / 1.23)
    const taxCents = amount - subtotalCents
    const sessionId = `sms_${salonId}_${Date.now()}`
    const description = `Doladowanie SMS - ${packageSize} smsow`

    const p24 = createPrzelewy24Client()
    const { paymentUrl } = await p24.createTransaction({
      sessionId,
      amount,
      description,
      email,
      client: salon.name,
      returnUrl: `${appUrl}/${salon.slug}/billing`,
      statusUrl: `${appUrl}/api/billing/webhook`,
    })

    const { error: invoiceInsertError } = await admin.from('invoices').insert({
      salon_id: salonId,
      status: 'open',
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: amount,
      currency: 'PLN',
      billing_name: salon.name,
      billing_email: email,
      payment_method: 'p24',
      p24_transaction_id: sessionId,
      line_items: [
        {
          description,
          quantity: packageSize,
          unit_price: amount / packageSize,
          total: amount,
        },
      ],
    })

    if (invoiceInsertError) {
      throw new Error(`Failed to create pending invoice: ${invoiceInsertError.message}`)
    }

    return NextResponse.json({ redirectUrl: paymentUrl })
  } catch (error) {
    console.error('[BILLING SMS TOPUP] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to create SMS top-up checkout',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
