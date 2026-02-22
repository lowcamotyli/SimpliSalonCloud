import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'
import { GmailClient } from '@/lib/booksy/gmail-client'

/**
 * POST /api/integrations/booksy/sync
 * Manually triggers a Booksy email sync for the current user's salon
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()

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

        // Get salon settings
        const { data: settings, error: settingsError } = await admin
            .from('salon_settings')
            .select('booksy_enabled, booksy_gmail_tokens, booksy_sync_stats')
            .eq('salon_id', profile.salon_id)
            .single()

        if (settingsError) throw settingsError

        if (!settings?.booksy_enabled) {
            return NextResponse.json({ error: 'Booksy integration is not enabled' }, { status: 400 })
        }

        if (!settings?.booksy_gmail_tokens) {
            return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
        }

        const gmailClient = new GmailClient(settings.booksy_gmail_tokens as any)
        const messages = await gmailClient.searchBooksyEmails(20)

        const processor = new BooksyProcessor(admin, profile.salon_id)
        const results = []

        for (const message of messages) {
            try {
                const result = await processor.processEmail(message.subject, message.body)
                await gmailClient.markAsProcessed(message.id, result.success)
                results.push({ messageId: message.id, subject: message.subject, result })
            } catch (error: any) {
                console.error('Error processing message:', error)
                await gmailClient.markAsProcessed(message.id, false)
                results.push({ messageId: message.id, subject: message.subject, result: { success: false, error: error.message } })
            }
        }

        const successCount = results.filter(r => r.result.success).length
        const errorCount = results.filter(r => !r.result.success).length

        // Update sync stats and last_sync_at
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
        console.error('Booksy sync error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
