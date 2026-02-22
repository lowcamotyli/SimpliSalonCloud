import { NextRequest, NextResponse } from 'next/server'
import { handleBooksyWebhook } from '@/app/api/webhooks/booksy/handler'

/**
 * Main Booksy webhook endpoint
 * POST /api/webhooks/booksy
 * 
 * This receives webhook events from Booksy (or Gmail API)
 * and processes them to create bookings
 */
export async function POST(request: NextRequest) {
  try {
    return await handleBooksyWebhook(request)
  } catch (error: unknown) {
    console.error('Booksy webhook error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
