import fs from 'node:fs'
import { expect, test } from '@playwright/test'

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^"|"$/g, '')
  }

  return env
}

const env = loadEnv('.env.local')
const cronSecret = env.CRON_SECRET
const fakeAccountId = '00000000-0000-0000-0000-000000000000'

function cronHeaders(): Record<string, string> {
  if (!cronSecret) {
    throw new Error('Missing CRON_SECRET in .env.local')
  }

  return {
    Authorization: `Bearer ${cronSecret}`,
    'x-cron-secret': cronSecret,
    'Content-Type': 'application/json',
  }
}

test.describe('Booksy internal endpoints smoke', () => {
  test('repair requires auth and scope', async ({ request }) => {
    const unauthorized = await request.post('/api/internal/booksy/repair', {
      data: { dryRun: true },
    })
    expect(unauthorized.status()).toBe(401)

    test.skip(!cronSecret, 'CRON_SECRET not set')

    const missingScope = await request.post('/api/internal/booksy/repair', {
      headers: cronHeaders(),
      data: { dryRun: true },
    })

    expect(missingScope.status()).toBe(400)
    await expect(missingScope.json()).resolves.toMatchObject({
      error: expect.stringContaining('scope'),
    })
  })

  test('scoped internal endpoints accept payload and do not fail for empty scope', async ({ request }) => {
    test.skip(!cronSecret, 'CRON_SECRET not set')
    const headers = cronHeaders()
    const scopeBody = { accountIds: [fakeAccountId] }

    const notifications = await request.post('/api/internal/booksy/process-notifications', {
      headers,
      data: {
        ...scopeBody,
        includeRetryableFailed: true,
      },
    })
    expect(notifications.status()).toBe(200)
    await expect(notifications.json()).resolves.toMatchObject({
      success: true,
      processedMailboxes: expect.any(Number),
      processedNotifications: expect.any(Number),
    })

    const parse = await request.post('/api/internal/booksy/parse', {
      headers,
      data: scopeBody,
    })
    expect(parse.status()).toBe(200)
    await expect(parse.json()).resolves.toMatchObject({
      processed: expect.any(Number),
      failed: expect.any(Number),
      skipped: expect.any(Number),
    })

    const apply = await request.post('/api/internal/booksy/apply', {
      headers,
      data: scopeBody,
    })
    expect(apply.status()).toBe(200)
    await expect(apply.json()).resolves.toMatchObject({
      applied: expect.any(Number),
      manual_review: expect.any(Number),
      discarded: expect.any(Number),
      skipped: expect.any(Number),
      failures: expect.any(Array),
    })
  })
})
