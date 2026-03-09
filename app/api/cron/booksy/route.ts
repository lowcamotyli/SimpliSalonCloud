import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'
import { GmailClient } from '@/lib/booksy/gmail-client'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { logger } from '@/lib/logger'

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
      logger.info('Booksy cron: no active salons', { action: 'booksy_cron' })
      return NextResponse.json({
        success: true,
        message: 'No active salons with Booksy enabled'
      })
    }

    logger.info('Booksy cron started', { action: 'booksy_cron_start', salons: salons.length })
    const results = []

    for (const salon of salons) {
      const settings = (salon as any).salon_settings
      if (!settings?.booksy_gmail_tokens) {
        continue
      }

      try {
        const salonSyncStart = Date.now()
        // Initialize Gmail client with tokens (handles refresh automatically if set up)
        const gmailClient = new GmailClient(settings.booksy_gmail_tokens)

        // Search for new Booksy emails
        const messages = await gmailClient.searchBooksyEmails(20, settings.booksy_sender_filter ?? '@booksy.com')

        // Process each message
        const processor = new BooksyProcessor(supabase, salon.id)
        const salonEmailResults: any[] = []

        for (const message of messages) {
          try {
            const result = await processor.processEmail(
              message.subject,
              message.body
            )

            // Mark as processed
            await gmailClient.markAsProcessed(message.id, result.success)

            results.push({ salon: salon.slug, messageId: message.id, result })
            salonEmailResults.push({ messageId: message.id, subject: message.subject, success: result.success, action: (result as any).action })
          } catch (error: any) {
            logger.error('Booksy cron: message processing failed', error, { salonId: salon.id, messageId: message.id })
            await gmailClient.markAsProcessed(message.id, false)
            salonEmailResults.push({ messageId: message.id, subject: message.subject, success: false, error: error.message })
          }
        }

        const salonSuccess = salonEmailResults.filter(r => r.success).length
        supabase.from('booksy_sync_logs').insert({
          salon_id: salon.id,
          triggered_by: 'cron',
          started_at: new Date(salonSyncStart).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - salonSyncStart,
          emails_found: messages.length,
          emails_success: salonSuccess,
          emails_error: salonEmailResults.length - salonSuccess,
          sync_results: salonEmailResults,
        }).then(null, (e: any) => logger.error('Failed to save cron sync log', e, { salonId: salon.id }))
      } catch (error: any) {
        if (error?.code === 'GMAIL_REAUTH_REQUIRED' || GmailClient.isInvalidGrantError(error)) {
          logger.warn('Booksy cron: Gmail re-auth required', { action: 'booksy_cron_reauth', salonId: salon.id, salonSlug: salon.slug })
          continue
        }
        logger.error('Booksy cron: salon processing failed', error, { salonId: salon.id, salonSlug: salon.slug })
      }
    }

    logger.info('Booksy cron completed', { action: 'booksy_cron_end', processed: results.length })
    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    })
  } catch (error: any) {
    logger.error('Booksy cron fatal error', error, { action: 'booksy_cron_fatal' })
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
