import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkProtectedApiRateLimit } from '@/lib/middleware/rate-limit'

function parseDate(value: string | null): Date | null {
  if (!value) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseDateRange(searchParams: URLSearchParams) {
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const fromInput = searchParams.get('from')
  const toInput = searchParams.get('to')

  const fromDate = parseDate(fromInput) ?? defaultFrom
  const toDate = parseDate(toInput) ?? now

  if (fromInput && !parseDate(fromInput)) {
    throw new Error('Invalid from date')
  }

  if (toInput && !parseDate(toInput)) {
    throw new Error('Invalid to date')
  }

  if (fromDate > toDate) {
    throw new Error('from date cannot be later than to date')
  }

  const fromUtc = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 0, 0, 0, 0))
  const toUtc = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate(), 23, 59, 59, 999))

  return {
    fromIso: fromUtc.toISOString(),
    toIso: toUtc.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = await checkProtectedApiRateLimit(`reports:nps:${user.id}`, { limit: 60 })
    if (!rateLimit.success) {
      const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': rateLimit.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(rateLimit.reset / 1000).toString(),
          },
        }
      )
    }

    const role = user.app_metadata?.role
    const salonId = user.app_metadata?.salon_id as string | undefined

    if (!salonId || !['owner', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { fromIso, toIso } = parseDateRange(request.nextUrl.searchParams)

    const { data, error } = await (supabase as any)
      .from('satisfaction_surveys')
      .select('rating, nps_score, comment, submitted_at')
      .eq('salon_id', salonId)
      .gte('submitted_at', fromIso)
      .lte('submitted_at', toIso)
      .order('submitted_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const surveys = data ?? []
    const totalResponses = surveys.length

    let promoters = 0
    let passives = 0
    let detractors = 0
    let npsSum = 0

    let npsRespondents = 0
    for (const survey of surveys) {
      if (survey.nps_score === null || survey.nps_score === undefined) continue
      const score = Number(survey.nps_score)
      npsSum += score
      npsRespondents += 1

      if (score >= 9) promoters += 1
      else if (score >= 7) passives += 1
      else detractors += 1
    }

    const avgNps = npsRespondents > 0 ? Number((npsSum / npsRespondents).toFixed(1)) : 0
    const npsScore = npsRespondents > 0
      ? Number((((promoters - detractors) / npsRespondents) * 100).toFixed(1))
      : 0

    return NextResponse.json({
      stats: {
        avg_nps: avgNps,
        total_responses: totalResponses,
        promoters,
        passives,
        detractors,
        nps_score: npsScore,
      },
      comments: surveys.slice(0, 10).map((survey: any) => ({
        rating: survey.rating,
        nps_score: survey.nps_score,
        comment: survey.comment,
        submitted_at: survey.submitted_at,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch NPS report' },
      { status: 400 }
    )
  }
}
