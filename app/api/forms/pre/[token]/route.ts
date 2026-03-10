import { NextResponse } from 'next/server'
import { BUILTIN_TEMPLATES, type FormField } from '@/lib/forms/builtin-templates'
import { verifyFormToken } from '@/lib/forms/token'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

function isValuePresent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return true
}

function getPreAppointmentTemplate(): {
  name: string
  fields: FormField[]
  requires_signature: boolean
} | null {
  const template = BUILTIN_TEMPLATES.find(
    (item) => item.name === 'Formularz przed wizytą'
  )

  if (!template) {
    return null
  }

  return {
    name: template.name,
    fields: template.fields,
    requires_signature: template.requires_signature,
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    try {
      await verifyFormToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const adminClient = createAdminSupabaseClient()

    const { data: responseRow, error: rowError } = await adminClient
      .from('pre_appointment_responses')
      .select('booking_id, client_id, salon_id, fill_token_exp, submitted_at')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 })
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

    const template = getPreAppointmentTemplate()

    if (!template) {
      return NextResponse.json(
        { error: 'Nie znaleziono wbudowanego szablonu formularza' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      template,
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

    try {
      await verifyFormToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const adminClient = createAdminSupabaseClient()

    const { data: responseRow, error: rowError } = await adminClient
      .from('pre_appointment_responses')
      .select('id, fill_token_exp, submitted_at')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 })
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

    const template = getPreAppointmentTemplate()

    if (!template) {
      return NextResponse.json(
        { error: 'Nie znaleziono wbudowanego szablonu formularza' },
        { status: 500 }
      )
    }

    const missingFields = template.fields
      .filter((field) => field.required)
      .filter((field) => !isValuePresent((answers as Record<string, unknown>)[field.id]))
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
