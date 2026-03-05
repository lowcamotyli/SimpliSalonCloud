import { createHmac, timingSafeEqual } from 'crypto'

function normalizeSecret(secret: string | undefined): string {
  return (secret || '').trim()
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function verifySmsWebhookSignature(request: Request): Promise<boolean> {
  const smsApiSecret = normalizeSecret(process.env.SMSAPI_WEBHOOK_TOKEN)
  const bulkgateSecret = normalizeSecret(process.env.BULKGATE_WEBHOOK_SECRET)
  const rawBody = await request.text()

  const smsApiSignature = (request.headers.get('x-smsapi-signature') || '').replace(/^sha256=/i, '').trim()
  const smsApiTimestamp = (request.headers.get('x-smsapi-timestamp') || '').trim()
  if (smsApiSecret && smsApiSignature && smsApiTimestamp) {
    const expected = createHmac('sha256', smsApiSecret)
      .update(`${smsApiTimestamp}.${rawBody}`)
      .digest('hex')
    return safeEqual(smsApiSignature, expected)
  }

  const bulkgateSignature = (request.headers.get('x-bulkgate-signature') || '').trim()
  if (bulkgateSecret && bulkgateSignature) {
    const expected = createHmac('sha256', bulkgateSecret).update(rawBody).digest('hex')
    return safeEqual(bulkgateSignature, expected)
  }

  return false
}
