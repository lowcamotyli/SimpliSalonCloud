import { NextResponse } from 'next/server'
import { verifyFormToken } from '@/lib/forms/token'
import { isFieldVisible, isValuePresent } from '@/lib/forms/field-visibility'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { FormField } from '@/types/forms'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    let tokenPayload: { bookingId?: string; salonId: string; clientId: string; formTemplateId: string }

    try {
      tokenPayload = await verifyFormToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const adminClient = createAdminSupabaseClient()

    const { data: responseRow, error: rowError } = await adminClient
      .from('pre_appointment_responses')
      .select('booking_id, client_id, salon_id, form_template_id, fill_token_exp, submitted_at')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 })
    }

    if (!responseRow && tokenPayload.bookingId) {
      const { data: submittedRow, error: submittedRowError } = await adminClient
        .from('pre_appointment_responses')
        .select('booking_id, client_id, salon_id, form_template_id, fill_token_exp, submitted_at')
        .eq('booking_id', tokenPayload.bookingId)
        .eq('salon_id', tokenPayload.salonId)
        .eq('client_id', tokenPayload.clientId)
        .limit(1)
        .maybeSingle()

      if (submittedRowError) {
        return NextResponse.json({ error: submittedRowError.message }, { status: 500 })
      }

      if (submittedRow?.submitted_at) {
        return NextResponse.json({ alreadySubmitted: true })
      }
    }

    if (!responseRow) {
      return NextResponse.json({ error: 'Nie znaleziono formularza' }, { status: 404 })
    }

    if (responseRow.fill_token_exp && new Date(responseRow.fill_token_exp) < new Date()) {
      return NextResponse.json({ error: 'Token wygasł' }, { status: 410 })
    }

    if (responseRow.submitted_at) {
      return NextResponse.json({ alreadySubmitted: true })
    }

    const [
      { data: client, error: clientError },
      { data: salon, error: salonError },
    ] = await Promise.all([
      adminClient
        .from('clients')
        .select('full_name')
        .eq('id', responseRow.client_id)
        .limit(1)
        .maybeSingle(),
      adminClient
        .from('salons')
        .select('name')
        .eq('id', responseRow.salon_id)
        .limit(1)
        .maybeSingle(),
    ])

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

    const { data: templateRow, error: templateError } = await adminClient
      .from('form_templates')
      .select('name, fields, requires_signature')
      .eq('id', responseRow.form_template_id)
      .limit(1)
      .maybeSingle()

    if (templateError) {
      return NextResponse.json({ error: templateError.message }, { status: 500 })
    }

    if (!templateRow) {
      return NextResponse.json({ error: 'Nie znaleziono szablonu formularza' }, { status: 404 })
    }

    return NextResponse.json({
      template: templateRow,
      clientName: client.full_name,
      salonName: salon.name,
      bookingId: responseRow.booking_id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    let tokenPayload: { bookingId?: string; salonId: string; clientId: string; formTemplateId: string }

    try {
      tokenPayload = await verifyFormToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const adminClient = createAdminSupabaseClient()

    const { data: responseRow, error: rowError } = await adminClient
      .from('pre_appointment_responses')
      .select('id, form_template_id, fill_token_exp, submitted_at')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 })
    }

    if (!responseRow && tokenPayload.bookingId) {
      const { data: submittedRow, error: submittedRowError } = await adminClient
        .from('pre_appointment_responses')
        .select('id, form_template_id, fill_token_exp, submitted_at')
        .eq('booking_id', tokenPayload.bookingId)
        .eq('salon_id', tokenPayload.salonId)
        .eq('client_id', tokenPayload.clientId)
        .limit(1)
        .maybeSingle()

      if (submittedRowError) {
        return NextResponse.json({ error: submittedRowError.message }, { status: 500 })
      }

      if (submittedRow?.submitted_at) {
        return NextResponse.json(
          { error: 'Formularz juz zostal wypelniony' },
          { status: 409 }
        )
      }
    }

    if (!responseRow) {
      return NextResponse.json({ error: 'Nie znaleziono formularza' }, { status: 404 })
    }

    if (responseRow.fill_token_exp && new Date(responseRow.fill_token_exp) < new Date()) {
      return NextResponse.json({ error: 'Token wygasł' }, { status: 410 })
    }

    if (responseRow.submitted_at) {
      return NextResponse.json(
        { error: 'Formularz już został wypełniony' },
        { status: 409 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const requestBody =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null
    const answers = requestBody?.answers

    if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
      return NextResponse.json({ error: 'Missing answers field' }, { status: 400 })
    }

    const { data: templateRow, error: templateError } = await adminClient
      .from('form_templates')
      .select('fields')
      .eq('id', responseRow.form_template_id)
      .limit(1)
      .maybeSingle()

    if (templateError || !templateRow) {
      return NextResponse.json({ error: 'Nie znaleziono szablonu formularza' }, { status: 404 })
    }

    const formFields = (templateRow.fields ?? []) as unknown as FormField[]
    const answerMap = answers as Record<string, unknown>
    const missingFields = formFields
      .filter((field) => field.required)
      .filter((field) => field.type !== 'section_header')
      .filter((field) => isFieldVisible(field, answerMap))
      .filter((field) => !isValuePresent(answerMap[field.id]))
      .map((field) => field.id)

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: 'Wymagane pola są puste', missingFields },
        { status: 400 }
      )
    }

    const { error: updateError } = await adminClient
      .from('pre_appointment_responses')
      .update({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        answers: answers as any,
        submitted_at: new Date().toISOString(),
        fill_token: null,
      })
      .eq('id', responseRow.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
