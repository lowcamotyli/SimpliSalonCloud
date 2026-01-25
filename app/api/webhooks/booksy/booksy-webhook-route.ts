import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'

/**
 * Main Booksy webhook endpoint
 * POST /api/webhooks/booksy
 * 
 * This receives webhook events from Booksy (or Gmail API)
 * and processes them to create bookings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate webhook data
    if (!body.salonId || !body.emails) {
      return NextResponse.json(
        { error: 'Missing salonId or emails' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const processor = new BooksyProcessor(supabase, body.salonId)

    const results = []

    for (const email of body.emails) {
      if (!email.subject || !email.body) {
        continue
      }

      const result = await processor.processEmail(email.subject, email.body)
      results.push(result)
    }

    const successCount = results.filter((r) => r.success).length
    const errorCount = results.filter((r) => !r.success).length

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful: successCount,
      errors: errorCount,
      results,
    })
  } catch (error: any) {
    console.error('Booksy webhook error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
