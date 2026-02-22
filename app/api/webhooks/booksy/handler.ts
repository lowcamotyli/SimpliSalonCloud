import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'

const booksyWebhookPayloadSchema = z.object({
  salonId: z.string().uuid('salonId must be a valid UUID'),
  emails: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        subject: z.string().min(1),
        body: z.string().min(1),
      })
    )
    .min(1),
})

type BooksyWebhookPayload = z.infer<typeof booksyWebhookPayloadSchema>

interface BooksyProcessorLike {
  processEmail: (
    subject: string,
    body: string,
    options?: { eventId?: string }
  ) => Promise<{ success: boolean; [key: string]: unknown }>
}

interface BooksyWebhookDeps {
  getWebhookSecret: () => string | undefined
  createProcessor: (salonId: string) => BooksyProcessorLike
}

function secureCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return timingSafeEqual(aBuffer, bBuffer)
}

function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const [scheme, token] = headerValue.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null
  }

  return token
}

function isWebhookAuthorized(request: NextRequest, secret: string): boolean {
  const headerSecret = request.headers.get('x-booksy-webhook-secret')
  const bearerToken = extractBearerToken(request.headers.get('authorization'))
  const candidate = headerSecret ?? bearerToken

  if (!candidate) {
    return false
  }

  return secureCompare(candidate, secret)
}

const defaultDeps: BooksyWebhookDeps = {
  getWebhookSecret: () => process.env.BOOKSY_WEBHOOK_SECRET,
  createProcessor: (salonId: string) => {
    const supabase = createAdminClient()
    return new BooksyProcessor(supabase, salonId)
  },
}

export async function handleBooksyWebhook(
  request: NextRequest,
  deps: BooksyWebhookDeps = defaultDeps
) {
  const webhookSecret = deps.getWebhookSecret()
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'BOOKSY_WEBHOOK_SECRET is not configured' },
      { status: 500 }
    )
  }

  if (!isWebhookAuthorized(request, webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const payloadResult = booksyWebhookPayloadSchema.safeParse(rawBody)
  if (!payloadResult.success) {
    return NextResponse.json(
      {
        error: 'Invalid webhook payload',
        details: payloadResult.error.issues,
      },
      { status: 400 }
    )
  }

  const payload: BooksyWebhookPayload = payloadResult.data
  const processor = deps.createProcessor(payload.salonId)

  const results: Array<{ success: boolean; [key: string]: unknown }> = []

  for (const email of payload.emails) {
    const result = await processor.processEmail(email.subject, email.body, {
      eventId: email.id,
    })
    results.push(result)
  }

  const successCount = results.filter((result) => result.success).length
  const errorCount = results.length - successCount

  return NextResponse.json({
    success: true,
    processed: results.length,
    successful: successCount,
    errors: errorCount,
    results,
  })
}

