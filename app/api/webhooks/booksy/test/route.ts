import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { BooksyProcessor } from '@/lib/booksy/processor'

/**
 * Test endpoint for Booksy integration
 * POST /api/webhooks/booksy/test
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
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

    // Test email data
    const testEmails = [
      {
        subject: 'Anna Kowalska: nowa rezerwacja',
        body: `
Anna Kowalska
123456789
anna@example.com

Strzyżenie damskie wł. średnie
250,00 zł

27 października 2024, 16:00 — 17:00

Pracownik:
Kasia

Zarządzaj swoimi rezerwacjami w aplikacji Booksy
        `
      }
    ]

    const processor = new BooksyProcessor(supabase, profile.salon_id)
    const results = []

    for (const email of testEmails) {
      const result = await processor.processEmail(email.subject, email.body)
      results.push(result)
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    })
  } catch (error: any) {
    console.error('Test endpoint error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}