import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Receiver } from '@upstash/qstash'
import { processMessage } from '@/lib/messaging/campaign-processor'

const workerSchema = z.object({
  salonId: z.string().uuid(),
  campaignId: z.string().uuid(),
  clientId: z.string().uuid(),
  channel: z.enum(['email', 'sms']),
})

async function verifyUpstashSignature(request: NextRequest, body: string) {
  const signature = request.headers.get('upstash-signature')
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY

  if (!signature || !currentSigningKey) {
    return false
  }

  try {
    const receiver = nextSigningKey
      ? new Receiver({ currentSigningKey, nextSigningKey } as any)
      : new Receiver({ currentSigningKey } as any)
    const verified = await (receiver as any).verify({
      signature,
      body,
      url: request.url,
    })

    return !!verified
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text()
    const signatureOk = await verifyUpstashSignature(request, bodyText)

    if (!signatureOk) {
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 })
    }

    const payload = workerSchema.parse(JSON.parse(bodyText))
    const result = await processMessage(payload)

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process campaign worker job' },
      { status: 500 }
    )
  }
}

