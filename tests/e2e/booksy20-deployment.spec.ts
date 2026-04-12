import { expect, test, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

async function login(page: Page) {
  if (!email || !password) {
    throw new Error('Missing E2E_EMAIL or E2E_PASSWORD environment variables')
  }

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Hasło').fill(password)
  await page.getByRole('button', { name: /zaloguj/i }).click()
  await page.waitForURL(new RegExp(`/${slug}/`), { timeout: 30_000 })
}

async function fetchThroughPage(
  page: Page,
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) {
  const response = await page.evaluate(
    async ({ input: target, init: requestInit }) => {
      const result = await fetch(target, requestInit)
      const text = await result.text()

      return {
        status: result.status,
        text,
        contentType: result.headers.get('content-type') || '',
      }
    },
    { input, init }
  )

  return {
    ...response,
    json: response.contentType.includes('application/json') && response.text
      ? JSON.parse(response.text)
      : null,
  }
}

test.describe('Booksy2.0 deployment checks', () => {
  test('protected Booksy settings route redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`/${slug}/settings/integrations/booksy`)
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('cron and internal Booksy endpoints reject unauthenticated requests', async ({ request }) => {
    test.setTimeout(120_000)

    const guardedGets = [
      '/api/cron/booksy',
      '/api/integrations/booksy/health',
      '/api/integrations/booksy/watch',
      '/api/integrations/booksy/pending?status=pending',
    ]

    for (const path of guardedGets) {
      const response = await request.get(path)
      expect([401, 403]).toContain(response.status())
    }

    const guardedPosts = [
      '/api/internal/booksy/process-notifications',
      '/api/internal/booksy/parse',
      '/api/internal/booksy/apply',
      '/api/internal/booksy/reconcile',
      '/api/integrations/booksy/reconcile',
      '/api/integrations/booksy/replay',
      '/api/integrations/booksy/watch',
    ]

    for (const path of guardedPosts) {
      const response = await request.post(path, {
        data: {},
      })
      expect([401, 403]).toContain(response.status())
    }
  })

  test('multi-mailbox Booksy settings page renders deployment sections and operator controls', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page)
    await page.goto(`/${slug}/settings/integrations/booksy`)

    await expect(page.getByRole('heading', { name: 'Integracja Booksy' })).toBeVisible()
    await expect(page.getByText('Zarządzaj wieloma skrzynkami Gmail dla synchronizacji rezerwacji z Booksy.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Skrzynki Booksy' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dodaj skrzynkę' })).toBeVisible()
    await expect(page.getByText('Emaile do zaakceptowania')).toBeVisible()
    await expect(page.getByText('Ostatnie rezerwacje z Booksy')).toBeVisible()
    await expect(page.getByText('Jak działa integracja?')).toBeVisible()
    await expect(page.getByText('Podłącz skrzynki Gmail')).toBeVisible()
    await expect(page.getByText('Monitoruj stan skrzynek')).toBeVisible()
    await expect(page.getByText('Synchronizacja rezerwacji')).toBeVisible()
    await expect(page.getByText('Bezpieczeństwo danych')).toBeVisible()

    const mailboxCards = page.locator('text=/auth:\\s|watch:\\s/')

    if (await mailboxCards.count()) {
      const firstCard = page.locator('[class*="card"], [data-slot="card"]').filter({ hasText: /auth:\s|watch:\s/ }).first()
      await expect(firstCard.getByText(/auth:\s/i)).toBeVisible()
      await expect(firstCard.getByText(/watch:\s/i)).toBeVisible()
      await expect(firstCard.getByRole('button', { name: 'Odśwież watch' })).toBeVisible()
      await expect(firstCard.getByRole('button', { name: 'Replay 24h' })).toBeVisible()
      await expect(firstCard.getByRole('button', { name: 'Pełny reconcile 14 dni' })).toBeVisible()
    }
  })

  test('authenticated Booksy APIs expose deployment envelopes', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page)

    const health = await fetchThroughPage(page, '/api/integrations/booksy/health')
    expect(health.status).toBe(200)
    expect(health.json).toHaveProperty('overall')
    expect(Array.isArray(health.json?.mailboxes)).toBe(true)

    const pending = await fetchThroughPage(page, '/api/integrations/booksy/pending?status=pending')
    expect(pending.status).toBe(200)
    expect(Array.isArray(pending.json?.pending)).toBe(true)
    expect(typeof pending.json?.count).toBe('number')

    const watch = await fetchThroughPage(page, '/api/integrations/booksy/watch')
    expect(watch.status).toBe(200)
    expect(watch.json).toHaveProperty('watch_status')
    expect(watch.json).toHaveProperty('watch_expiration')
    expect(watch.json).toHaveProperty('last_notification_at')
  })

  test('add mailbox CTA reaches OAuth handoff route', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page)
    await page.goto(`/${slug}/settings/integrations/booksy`)

    await page.getByRole('button', { name: 'Dodaj skrzynkę' }).click()
    await page.waitForURL(/api\/integrations\/booksy\/auth|accounts\.google\.com/i, {
      timeout: 30_000,
    })

    await expect(page).toHaveURL(/api\/integrations\/booksy\/auth|accounts\.google\.com/i)
  })
})

test.describe('Booksy2.0 extended coverage', () => {
  test('internal endpoints reject wrong CRON_SECRET', async ({ request }) => {
    const internalEndpoints = [
      '/api/internal/booksy/process-notifications',
      '/api/internal/booksy/parse',
      '/api/internal/booksy/apply',
      '/api/internal/booksy/reconcile',
    ]

    for (const path of internalEndpoints) {
      const response = await request.post(path, {
        headers: {
          Authorization: 'Bearer wrong-secret-xyz',
        },
        data: {},
      })

      expect([401, 403]).toContain(response.status())
    }
  })

  test('internal endpoints accept valid CRON_SECRET', async ({ request }) => {
    const cronSecret = process.env.E2E_CRON_SECRET

    test.skip(!cronSecret, 'E2E_CRON_SECRET not set')

    const internalEndpoints = [
      '/api/internal/booksy/process-notifications',
      '/api/internal/booksy/parse',
      '/api/internal/booksy/apply',
      '/api/internal/booksy/reconcile',
    ]

    for (const path of internalEndpoints) {
      const response = await request.post(path, {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
        data: {},
      })

      expect(response.status()).not.toBe(401)
      expect(response.status()).not.toBe(403)
    }
  })

  test('Booksy stats and logs endpoints return correct envelopes', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page)

    const stats = await fetchThroughPage(page, '/api/integrations/booksy/stats')
    expect(stats.status).toBe(200)
    expect(stats.json).toEqual(
      expect.objectContaining({
        syncStats: expect.objectContaining({
          total: expect.any(Number),
          success: expect.any(Number),
          errors: expect.any(Number),
        }),
        connectionStatus: expect.any(String),
        bookings: expect.objectContaining({
          total: expect.any(Number),
          scheduled: expect.any(Number),
          cancelled: expect.any(Number),
        }),
      })
    )
    expect(stats.json?.lastSyncAt === null || typeof stats.json?.lastSyncAt === 'string').toBe(true)

    const logs = await fetchThroughPage(page, '/api/integrations/booksy/logs')
    expect(logs.status).toBe(200)
    expect(logs.json).toEqual(
      expect.objectContaining({
        bookings: expect.any(Array),
      })
    )
  })

  test('Gmail PubSub webhook rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/webhooks/booksy/gmail')

    expect(response.status()).not.toBe(200)
    expect([400, 401, 500]).toContain(response.status())
  })
})
