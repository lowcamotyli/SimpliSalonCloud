import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { BooksyProcessor } from '@/lib/booksy/processor'

/**
 * Test endpoint for Booksy integration
 * POST /api/webhooks/booksy/test
 *
 * Auth: current logged-in user session.
 * Optional payload:
 * {
 *   "emails": [
 *     { "id": "evt-1", "subject": "...", "body": "..." }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = (await createServerSupabaseClient()) as any

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const typedProfile = profile as { salon_id: string }

    const defaultTestEmails: Array<{ id?: string; subject: string; body: string }> = [
      {
        id: 'booksy-test-new-1',
        subject: 'Anna Kowalska: nowa rezerwacja',
        body: [
          'Anna Kowalska',
          '123456789',
          'anna@example.com',
          '',
          'Strzyzenie damskie wl. srednie',
          '250,00 zl',
          '',
          '27 pazdziernika 2026, 16:00 - 17:00',
          '',
          'Pracownik: Kasia',
          '',
          'Zarzadzaj swoimi rezerwacjami w aplikacji Booksy',
        ].join('\n'),
      },
    ]

    let requestBody: unknown = {}
    try {
      requestBody = await request.json()
    } catch {
      // Empty/invalid JSON body is allowed - fallback to defaults.
    }

    const maybeEmails = (requestBody as {
      emails?: Array<{ id?: string; subject?: string; body?: string }>
    })?.emails

    const customEmails = Array.isArray(maybeEmails)
      ? maybeEmails
          .filter(
            (email) =>
              typeof email?.subject === 'string' &&
              email.subject.trim().length > 0 &&
              typeof email?.body === 'string' &&
              email.body.trim().length > 0
          )
          .map((email) => ({
            id: email.id,
            subject: email.subject!.trim(),
            body: email.body!.trim(),
          }))
      : []

    const testEmails = customEmails.length > 0 ? customEmails : defaultTestEmails

    const processor = new BooksyProcessor(supabase, typedProfile.salon_id)
    const results = []

    for (const email of testEmails) {
      const result = await processor.processEmail(email.subject, email.body, {
        eventId: email.id,
      })
      results.push(result)
    }

    const successCount = results.filter((result) => result?.success).length

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful: successCount,
      errors: results.length - successCount,
      usedCustomEmails: customEmails.length > 0,
      results,
    })
  } catch (error: any) {
    console.error('Booksy test endpoint error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
