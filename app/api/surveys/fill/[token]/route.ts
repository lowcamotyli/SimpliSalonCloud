import { NextResponse } from 'next/server'
import { verifySurveyToken } from '@/lib/messaging/survey-token'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    let tokenPayload: { bookingId: string; salonId: string }

    try {
      tokenPayload = await verifySurveyToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const adminClient = createAdminSupabaseClient()

    const { data: survey, error: surveyError } = await adminClient
      .from('satisfaction_surveys')
      .select('id, booking_id, salon_id, submitted_at, fill_token_exp')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (surveyError) {
      return NextResponse.json({ error: surveyError.message }, { status: 500 })
    }

    if (!survey) {
      const { data: submittedSurvey, error: submittedSurveyError } = await adminClient
        .from('satisfaction_surveys')
        .select('id, booking_id, salon_id, submitted_at, fill_token_exp')
        .eq('booking_id', tokenPayload.bookingId)
        .eq('salon_id', tokenPayload.salonId)
        .limit(1)
        .maybeSingle()

      if (submittedSurveyError) {
        return NextResponse.json({ error: submittedSurveyError.message }, { status: 500 })
      }

      if (submittedSurvey?.submitted_at) {
        return NextResponse.json({ alreadyFilled: true })
      }
    }

    if (!survey) {
      return NextResponse.json({ error: 'Nie znaleziono ankiety' }, { status: 404 })
    }

    if (survey.submitted_at) {
      return NextResponse.json({ alreadyFilled: true })
    }

    if (survey.fill_token_exp && new Date(survey.fill_token_exp) < new Date()) {
      return NextResponse.json({ error: 'Ankieta wygasla' }, { status: 410 })
    }

    const { data: salon, error: salonError } = await adminClient
      .from('salons')
      .select('name')
      .eq('id', survey.salon_id)
      .limit(1)
      .maybeSingle()

    if (salonError) {
      return NextResponse.json({ error: salonError.message }, { status: 500 })
    }

    if (!salon) {
      return NextResponse.json({ error: 'Nie znaleziono salonu' }, { status: 404 })
    }

    return NextResponse.json({
      survey: {
        id: survey.id,
        booking_id: survey.booking_id,
      },
      salon: {
        name: salon.name,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
