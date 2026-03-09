import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'
import { checkProtectedApiRateLimit } from '@/lib/middleware/rate-limit'
import { sendEmailMessage } from '@/lib/messaging/email-sender'
import { sendSmsMessage } from '@/lib/messaging/sms-sender'

const quickSendSchema = z.object({
  salonId: z.string().uuid(),
  clientId: z.string().uuid(),
  channel: z.enum(['email', 'sms']),
  templateId: z.string().uuid().optional().nullable(),
  subject: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().max(8000).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = quickSendSchema.parse(await request.json())

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (membership.role !== 'owner' && membership.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rateLimit = await checkProtectedApiRateLimit(`crm:quick-send:${user.id}:${payload.salonId}`)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many quick send requests. Please try again later.' },
        { status: 429 }
      )
    }

    if (payload.channel === 'email') {
      const emailFeature = await checkFeatureAccess(payload.salonId, 'email_notifications')
      if (!emailFeature.allowed) {
        return NextResponse.json(
          { error: emailFeature.reason || 'Email feature is not available', upgradeUrl: emailFeature.upgradeUrl },
          { status: 403 }
        )
      }
    }

    if (payload.channel === 'sms') {
      const smsFeature = await checkFeatureAccess(payload.salonId, 'sms_notifications')
      if (!smsFeature.allowed) {
        return NextResponse.json(
          { error: smsFeature.reason || 'SMS feature is not available', upgradeUrl: smsFeature.upgradeUrl },
          { status: 403 }
        )
      }
    }

    const { data: client, error: clientError } = await (supabase as any)
      .from('clients')
      .select('id, salon_id, full_name, email, phone, email_opt_in, sms_opt_in')
      .eq('id', payload.clientId)
      .eq('salon_id', payload.salonId)
      .is('deleted_at', null)
      .maybeSingle()

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const { data: salon, error: salonError } = await (supabase as any)
      .from('salons')
      .select('name')
      .eq('id', payload.salonId)
      .single()

    if (salonError || !salon) {
      return NextResponse.json({ error: 'Salon not found' }, { status: 404 })
    }

    let template: any = null
    if (payload.templateId) {
      const { data: templateData, error: templateError } = await (supabase as any)
        .from('message_templates')
        .select('id, salon_id, channel, subject, body')
        .eq('id', payload.templateId)
        .eq('salon_id', payload.salonId)
        .maybeSingle()

      if (templateError) {
        return NextResponse.json({ error: templateError.message }, { status: 500 })
      }

      if (!templateData) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      if (templateData.channel !== 'both' && templateData.channel !== payload.channel) {
        return NextResponse.json({ error: 'Template channel mismatch' }, { status: 400 })
      }

      template = templateData
    }

    const finalSubject = payload.channel === 'email' ? (payload.subject?.trim() || template?.subject || null) : null
    const finalBody = payload.body?.trim() || template?.body || ''

    if (!finalBody) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    if (payload.channel === 'email' && !finalSubject) {
      return NextResponse.json({ error: 'Subject is required for email messages' }, { status: 400 })
    }

    const recipient = payload.channel === 'email' ? client.email : client.phone
    if (!recipient) {
      return NextResponse.json({ error: 'Client has no recipient contact for selected channel' }, { status: 400 })
    }

    if (payload.channel === 'email' && client.email_opt_in === false) {
      return NextResponse.json({ error: 'Client has email opt-out enabled' }, { status: 400 })
    }

    if (payload.channel === 'sms' && client.sms_opt_in === false) {
      return NextResponse.json({ error: 'Client has SMS opt-out enabled' }, { status: 400 })
    }

    const firstName = client.full_name.split(' ')[0] || ''
    const unsubscribeLink = `${request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/unsubscribe?c=${client.id}&s=${payload.salonId}`

    const finalSubjectParsed = finalSubject
      ? finalSubject
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{salon_name\}\}/g, salon.name)
      : null

    const finalBodyParsed = finalBody
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{salon_name\}\}/g, salon.name)
      .replace(/\{\{unsubscribe_link\}\}/g, unsubscribeLink)

    const admin = createAdminSupabaseClient()

    const { data: log, error: logError } = await (admin as any)
      .from('message_logs')
      .insert({
        salon_id: payload.salonId,
        client_id: client.id,
        channel: payload.channel,
        recipient,
        subject: finalSubjectParsed,
        body: finalBodyParsed,
        status: 'pending',
      })
      .select('id')
      .single()

    if (logError || !log?.id) {
      return NextResponse.json({ error: logError?.message || 'Failed to create message log' }, { status: 500 })
    }

    if (payload.channel === 'email') {
      const htmlContent = finalBodyParsed.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br />')
      const formattedHtml = htmlContent.startsWith('<p>') ? htmlContent : `<p>${htmlContent}</p>`

      const htmlWrapper = `
      <!DOCTYPE html>
      <html lang="pl">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            line-height: 1.6; 
            color: #1f2937; 
            background-color: #f3f4f6; 
            margin: 0; 
            padding: 0; 
            -webkit-font-smoothing: antialiased;
          }
          .wrapper { width: 100%; background-color: #f3f4f6; padding: 40px 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0 20px; }
          .card { 
            background-color: #ffffff; 
            border-radius: 16px; 
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.05); 
          }
          .header { 
            background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);
            padding: 32px 40px; 
            text-align: center; 
            border-bottom: 1px solid #f3f4f6;
          }
          .header h1 { 
            color: #111827; 
            font-size: 24px; 
            font-weight: 700; 
            margin: 0; 
            letter-spacing: -0.025em;
          }
          .content { 
            padding: 40px; 
            font-size: 16px; 
            color: #374151; 
          }
          .content p {
            margin-top: 0;
            margin-bottom: 16px;
          }
          .content p:last-child {
            margin-bottom: 0;
          }
          .footer { 
            background-color: #f9fafb;
            text-align: center; 
            font-size: 13px; 
            color: #6b7280; 
            padding: 32px 40px; 
            border-top: 1px solid #f3f4f6; 
          }
          .unsubscribe { 
            display: inline-block;
            margin-top: 16px;
            color: #9ca3af; 
            text-decoration: none; 
            font-size: 12px;
            transition: color 0.15s ease-in-out;
          }
          .unsubscribe:hover {
            color: #4b5563;
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="card">
              ${salon.name ? `<div class="header"><h1>${salon.name}</h1></div>` : ''}
              <div class="content">
                ${formattedHtml}
              </div>
              <div class="footer">
                Wiadomość wysłana z systemu <strong style="color: #374151;">${salon.name || 'SimpliSalon'}</strong>.<br>
                Prosimy nie odpowiadać bezpośrednio na ten adres email.
                <br>
                <a href="${unsubscribeLink}" class="unsubscribe">Zrezygnuj z otrzymywania powiadomień</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
      `

      const result = await sendEmailMessage({
        salonId: payload.salonId,
        messageLogId: log.id,
        to: recipient,
        subject: finalSubjectParsed as string,
        text: finalBodyParsed,
        html: htmlWrapper,
      })

      return NextResponse.json({ ok: true, channel: 'email', messageLogId: log.id, providerId: result.providerId })
    }

    const result = await sendSmsMessage({
      salonId: payload.salonId,
      messageLogId: log.id,
      to: recipient,
      body: finalBodyParsed,
    })

    return NextResponse.json({ ok: true, channel: 'sms', messageLogId: log.id, providerId: result.providerId })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send quick message' },
      { status: 500 }
    )
  }
}

