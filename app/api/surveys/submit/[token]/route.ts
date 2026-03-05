import { NextResponse } from 'next/server'
import { verifySurveyToken } from '@/lib/messaging/survey-token'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

interface SubmitSurveyPayload {
  rating: number
  nps_score: number
  comment?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    try {
      await verifySurveyToken(token)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const adminClient = createAdminSupabaseClient()

    const { data: survey, error: surveyError } = await adminClient
      .from('satisfaction_surveys')
      .select('id, submitted_at, fill_token_exp')
      .eq('fill_token', token)
      .limit(1)
      .maybeSingle()

    if (surveyError) {
      return NextResponse.json({ error: surveyError.message }, { status: 500 })
    }

    if (!survey) {
      return NextResponse.json({ error: 'Nie znaleziono ankiety' }, { status: 404 })
    }

    if (survey.submitted_at) {
      return NextResponse.json({ error: 'Ankieta juz wypelniona' }, { status: 409 })
    }

    if (survey.fill_token_exp && new Date(survey.fill_token_exp) < new Date()) {
      return NextResponse.json({ error: 'Ankieta wygasla' }, { status: 410 })
    }

    let body: SubmitSurveyPayload
    try {
      body = (await request.json()) as SubmitSurveyPayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const rating = body?.rating
    const npsScore = body?.nps_score
    const comment = body?.comment

    const ratingValid = Number.isInteger(rating) && rating >= 1 && rating <= 5
    if (!ratingValid) {
      return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
    }

    const npsValid = Number.isInteger(npsScore) && npsScore >= 0 && npsScore <= 10
    if (!npsValid) {
      return NextResponse.json({ error: 'nps_score must be an integer between 0 and 10' }, { status: 400 })
    }

    if (comment !== undefined && typeof comment !== 'string') {
      return NextResponse.json({ error: 'comment must be a string' }, { status: 400 })
    }

    const { error: updateError } = await adminClient
      .from('satisfaction_surveys')
      .update({
        rating,
        nps_score: npsScore,
        comment: comment ?? null,
        submitted_at: new Date().toISOString(),
        fill_token: null,
      })
      .eq('id', survey.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
