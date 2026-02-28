import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'
import { GmailClient } from '@/lib/booksy/gmail-client'
import { validateCronSecret } from '@/lib/middleware/cron-auth'

/**
 * Cron job to process Booksy emails
 * Runs every 15 minutes (configured in vercel.json)
 * 
 * Auth: Vercel Cron Secret
 */
export async function GET(request: NextRequest) {
  try {
    const authError = validateCronSecret(request)
    if (authError) return authError

    const supabase = createAdminClient()

    // Get all active salons with Booksy integration enabled
    const { data: salons } = await supabase
      .from('salons')
      .select(`
        id, 
        slug, 
        salon_settings!inner(
          booksy_enabled,
          booksy_gmail_tokens,
          booksy_sender_filter
        )
      `)
      .eq('subscription_status', 'active')
      .eq('salon_settings.booksy_enabled', true)

    if (!salons || salons.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active salons with Booksy enabled'
      })
    }

    const results = []

    for (const salon of salons) {
      const settings = (salon as any).salon_settings
      if (!settings?.booksy_gmail_tokens) {
        continue
      }

      try {
        // Initialize Gmail client with tokens (handles refresh automatically if set up)
        const gmailClient = new GmailClient(settings.booksy_gmail_tokens)

        // Search for new Booksy emails
        const messages = await gmailClient.searchBooksyEmails(20, settings.booksy_sender_filter ?? '@booksy.com')

        // Process each message
        const processor = new BooksyProcessor(supabase, salon.id)

        for (const message of messages) {
          try {
            const result = await processor.processEmail(
              message.subject,
              message.body
            )

            // Mark as processed
            await gmailClient.markAsProcessed(message.id, result.success)

            results.push({
              salon: salon.slug,
              messageId: message.id,
              result,
            })
          } catch (error: any) {
            console.error('Error processing message:', error)
            await gmailClient.markAsProcessed(message.id, false)
          }
        }
      } catch (error: any) {
        if (error?.code === 'GMAIL_REAUTH_REQUIRED' || GmailClient.isInvalidGrantError(error)) {
          console.warn(`Booksy Gmail re-auth required for salon ${salon.slug}`)
          continue
        }
        console.error(`Error processing salon ${salon.slug}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    })
  } catch (error: any) {
    console.error('Booksy cron error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
