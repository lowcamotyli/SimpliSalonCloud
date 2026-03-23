import { NextResponse } from 'next/server'
import { verifyFormToken } from '@/lib/forms/token'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { resolveGdprConsentText } from '@/lib/forms/gdpr'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    let payload: Awaited<ReturnType<typeof verifyFormToken>>
    try {
      payload = await verifyFormToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    const adminClient = createAdminSupabaseClient()

    const { data: clientForm, error: clientFormError } = await adminClient
      .from('client_forms')
      .select('fill_token_exp, form_template_id, client_id')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (clientFormError) {
      return NextResponse.json({ error: clientFormError.message }, { status: 500 })
    }

    if (!clientForm) {
      return NextResponse.json({ error: 'Nie znaleziono formularza' }, { status: 404 })
    }

    if (clientForm.fill_token_exp && new Date(clientForm.fill_token_exp) < new Date()) {
      return NextResponse.json({ error: 'Token wygasł' }, { status: 410 })
    }

    const [
      { data: template, error: templateError },
      { data: client, error: clientError },
      { data: salon, error: salonError },
      { data: settings, error: settingsError },
    ] = await Promise.all([
      adminClient
        .from('form_templates')
        .select('name, fields, gdpr_consent_text, requires_signature, data_category')
        .eq('id', clientForm.form_template_id)
        .limit(1)
        .maybeSingle(),
      adminClient
        .from('clients')
        .select('full_name')
        .eq('id', clientForm.client_id)
        .limit(1)
        .maybeSingle(),
      adminClient
        .from('salons')
        .select('name, owner_email')
        .eq('id', payload.salonId)
        .limit(1)
        .maybeSingle(),
      adminClient
        .from('salon_settings')
        .select('contact_email, address')
        .eq('salon_id', payload.salonId)
        .limit(1)
        .maybeSingle(),
    ])

    if (templateError) {
      return NextResponse.json({ error: templateError.message }, { status: 500 })
    }
    if (!template) {
      return NextResponse.json({ error: 'Nie znaleziono szablonu formularza' }, { status: 404 })
    }
    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }
    if (!client) {
      return NextResponse.json({ error: 'Nie znaleziono klienta' }, { status: 404 })
    }
    if (salonError) {
      return NextResponse.json({ error: salonError.message }, { status: 500 })
    }
    if (!salon) {
      return NextResponse.json({ error: 'Nie znaleziono salonu' }, { status: 404 })
    }
    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 })
    }

    const gdprConsentText = resolveGdprConsentText(template.gdpr_consent_text, {
      salonName: salon.name,
      salonEmail: settings?.contact_email || salon.owner_email,
      address: (settings?.address as Record<string, string> | null | undefined) ?? null,
    })

    return NextResponse.json({
      template: {
        name: template.name,
        fields: template.fields,
        gdpr_consent_text: gdprConsentText,
        requires_signature: template.requires_signature,
        data_category: template.data_category,
      },
      clientName: client.full_name,
      salonName: salon.name,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
