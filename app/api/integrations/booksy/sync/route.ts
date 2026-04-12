import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'
import { GmailClient } from '@/lib/booksy/gmail-client'
import { logger } from '@/lib/logger'

async function saveReauthLog(admin: ReturnType<typeof createAdminClient>, salonId: string) {
  await admin.from('booksy_sync_logs').insert({
    salon_id: salonId,
    triggered_by: 'manual',
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: 0,
    emails_found: 0,
    emails_success: 0,
    emails_error: 1,
    sync_results: [
      {
        success: false,
        code: 'GMAIL_REAUTH_REQUIRED',
        error: 'Gmail authorization expired. Reconnect Gmail account.',
      },
    ],
  })
}

/**
 * POST /api/integrations/booksy/sync
 * Manually triggers a Booksy email sync for the current user's salon
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await (supabase
      .from('profiles') as any)
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile?.salon_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const admin = createAdminClient()

    const { data: settings, error: settingsError } = await (admin
      .from('salon_settings') as any)
      .select('*')
      .eq('salon_id', profile.salon_id)
      .single()

    if (settingsError) throw settingsError

    if (!settings?.booksy_enabled) {
      return NextResponse.json({ error: 'Booksy integration is not enabled' }, { status: 400 })
    }

    if (!settings?.booksy_gmail_tokens) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    const gmailTokens = { ...((settings.booksy_gmail_tokens as any) ?? {}) }
    const gmailClient = new GmailClient(gmailTokens, {
      onTokens: async (tokens) => {
        await admin
          .from('salon_settings')
          .update({
            booksy_gmail_tokens: tokens,
            updated_at: new Date().toISOString(),
          })
          .eq('salon_id', profile.salon_id)
      },
      ledger: {
        supabase: admin,
        salonId: profile.salon_id,
      },
    })

    let messages
    try {
      messages = await gmailClient.searchBooksyEmails(20, settings.booksy_sender_filter ?? '@booksy.com', {
        syncFromDate: settings.booksy_sync_from_date ?? null,
      })
    } catch (error: any) {
      if (error?.code === 'GMAIL_REAUTH_REQUIRED' || GmailClient.isInvalidGrantError(error)) {
        await saveReauthLog(admin, profile.salon_id)
        return NextResponse.json(
          {
            error: 'Sesja Gmail wygasla. Polacz konto Gmail ponownie.',
            code: 'GMAIL_REAUTH_REQUIRED',
          },
          { status: 401 }
        )
      }
      throw error
    }

    const processor = new BooksyProcessor(admin, profile.salon_id)
    const results = []
    const syncStart = Date.now()

    logger.info('Booksy manual sync started', {
      action: 'booksy_sync_start',
      salonId: profile.salon_id,
      found: messages.length,
      syncFromDate: settings.booksy_sync_from_date ?? null,
    })

    for (const message of messages) {
      try {
        const result = await processor.processEmail(message.subject, message.body, { messageId: message.id })
        await gmailClient.markAsProcessed(message.id, result.success)
        results.push({ messageId: message.id, subject: message.subject, result })
      } catch (error: any) {
        logger.error('Booksy: manual sync message failed', error, {
          salonId: profile.salon_id,
          messageId: message.id,
          subject: message.subject,
        })
        await gmailClient.markAsProcessed(message.id, false)
        results.push({
          messageId: message.id,
          subject: message.subject,
          result: { success: false, error: error.message },
        })
      }
    }

    const successCount = results.filter(r => r.result.success).length
    const errorCount = results.filter(r => !r.result.success).length
    const durationMs = Date.now() - syncStart

    logger.info('Booksy manual sync completed', {
      action: 'booksy_sync_end',
      salonId: profile.salon_id,
      processed: results.length,
      success: successCount,
      errors: errorCount,
      duration: durationMs,
    })

    admin.from('booksy_sync_logs').insert({
      salon_id: profile.salon_id,
      triggered_by: 'manual',
      started_at: new Date(syncStart).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      emails_found: messages.length,
      emails_success: successCount,
      emails_error: errorCount,
      sync_results: results.map(r => ({
        messageId: r.messageId,
        subject: r.subject,
        success: r.result.success,
        action: (r.result as any).action,
        error: (r.result as any).error,
      })),
    }).then(null, (e: unknown) => logger.error('Failed to save sync log', e, { salonId: profile.salon_id }))

    const currentStats = (settings.booksy_sync_stats as any) ?? { total: 0, success: 0, errors: 0 }
    await admin
      .from('salon_settings')
      .update({
        booksy_last_sync_at: new Date().toISOString(),
        booksy_sync_stats: {
          total: (currentStats.total ?? 0) + results.length,
          success: (currentStats.success ?? 0) + successCount,
          errors: (currentStats.errors ?? 0) + errorCount,
        },
      })
      .eq('salon_id', profile.salon_id)

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful: successCount,
      errors: errorCount,
      results,
    })
  } catch (error: any) {
    logger.error('Booksy sync error', error, { action: 'booksy_sync_error' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
