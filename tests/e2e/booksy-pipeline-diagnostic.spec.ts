import { expect, test, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const cronSecret = process.env.E2E_CRON_SECRET

type FetchResult = {
  status: number
  json: any
  text: string
}

type FetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

async function login(page: Page) {
  if (!email || !password) {
    throw new Error('Missing E2E_EMAIL or E2E_PASSWORD environment variables')
  }

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/haslo|hasło/i).fill(password)
  await page.getByRole('button', { name: /zaloguj/i }).click()
  await page.waitForURL(new RegExp(`/${slug}(/|$)`), { timeout: 30_000 })
}

async function fetchAsUser(page: Page, url: string, init?: FetchInit): Promise<FetchResult> {
  return page.evaluate(
    async ({ url: targetUrl, init: requestInit }) => {
      const headers = { ...(requestInit?.headers || {}) }
      const hasBody = typeof requestInit?.body !== 'undefined'
      const response = await fetch(targetUrl, {
        ...requestInit,
        headers: hasBody ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: hasBody ? JSON.stringify(requestInit?.body) : undefined,
      })
      const text = await response.text()

      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }

      return { status: response.status, json, text }
    },
    { url, init }
  )
}

async function fetchInternal(page: Page, path: string, body?: unknown): Promise<Omit<FetchResult, 'text'>> {
  if (!cronSecret) {
    throw new Error('E2E_CRON_SECRET not set')
  }

  const result = await fetchAsUser(page, path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'x-cron-secret': cronSecret,
    },
    body: body || {},
  })

  return { status: result.status, json: result.json }
}

test.describe('Booksy Pipeline — diagnostyka forwardowanych maili', () => {
  test('1. Health check — lista skrzynek i ich stan', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page)
    const result = await fetchAsUser(page, '/api/integrations/booksy/health')

    expect(result.status).toBe(200)

    const mailboxes = result.json?.mailboxes || []
    console.log('overall:', result.json?.overall)
    console.log('mailboxes count:', mailboxes.length)

    for (const mailbox of mailboxes) {
      console.log('mailbox:', {
        accountId: mailbox.accountId,
        email: mailbox.email,
        authStatus: mailbox.authStatus,
        watchStatus: mailbox.watchStatus,
        rawBacklog: mailbox.rawBacklog,
        parseFailureRate: mailbox.parseFailureRate,
        manualQueueDepth: mailbox.manualQueueDepth,
        applyFailures: mailbox.applyFailures,
        overall: mailbox.overall,
      })
    }

    expect(mailboxes.length).toBeGreaterThan(0)

    if (!mailboxes.some((mailbox: any) => mailbox.authStatus === 'active')) {
      console.warn('Brak skrzynki z authStatus === active')
    }
  })

  test('2. Pending queue — stan PRZED triggerowaniem reconcile', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page)
    const result = await fetchAsUser(page, '/api/integrations/booksy/pending?status=pending')

    expect(result.status).toBe(200)

    const items = result.json?.pending || result.json?.items || []
    console.log('pending count:', result.json?.count ?? items.length)

    for (const item of items) {
      console.log('pending item:', {
        source: item.source,
        subject: item.subject,
        failure_reason: item.failure_reason,
        failure_detail: item.failure_detail,
        created_at: item.created_at,
        parsed_data: JSON.stringify(item.parsed_data),
      })
    }

    if (items.length === 0) {
      console.log('INFO: Pending queue jest pusta przed reconcile.')
    }
  })

  test('3. Reconcile — zaciągnij forwarded maile z Gmail (14 dni)', async ({ page }) => {
    test.setTimeout(180_000)
    test.skip(!cronSecret, 'E2E_CRON_SECRET not set')

    await login(page)

    const health = await fetchAsUser(page, '/api/integrations/booksy/health')
    expect(health.status).toBe(200)

    const activeMailboxes = (health.json?.mailboxes || []).filter(
      (mailbox: any) => mailbox.authStatus === 'active'
    )

    if (activeMailboxes.length === 0) {
      test.skip(true, 'No active mailboxes')
      return
    }

    for (const mailbox of activeMailboxes) {
      const result = await fetchInternal(page, '/api/internal/booksy/reconcile', {
        accountId: mailbox.accountId,
        windowDays: 14,
        includeForwarded: true,
      })
      const data = result.json || {}

      console.log('reconcile:', {
        status: result.status,
        success: data.success,
        windowDays: data.windowDays,
        includeForwarded: data.includeForwarded,
        emailsChecked: data.emailsChecked,
        emailsMissing: data.emailsMissing,
        emailsBackfilled: data.emailsBackfilled,
      })

      for (const entry of data.results || []) {
        if (entry.error) {
          console.log('reconcile result error:', entry.error)
        } else {
          console.log('reconcile result ok:', entry)
        }
      }

      if (data.emailsChecked === 0) {
        console.warn(
          'DIAGNOZA: Gmail nie zwrocil maili. Mozliwe powody: forwarded mail nie pasuje do Gmail search queries; mail jest starszy niz 14 dni; sprawdzana jest zla skrzynka; auth token wygasl.'
        )
      }

      if (data.emailsChecked > 0 && data.emailsBackfilled === 0) {
        console.log('INFO: Gmail zwrocil maile, ale niczego nie backfillowano.')
      }

      expect(result.status).toBe(200)
    }
  })

  test('4. Parse — parsuj zaciągnięte raw emails', async ({ page }) => {
    test.setTimeout(120_000)
    test.skip(!cronSecret, 'E2E_CRON_SECRET not set')

    await login(page)

    const result = await fetchInternal(page, '/api/internal/booksy/parse')
    const data = result.json || {}

    console.log('parse:', {
      status: result.status,
      parsed: data.parsed,
      skipped: data.skipped,
      failed: data.failed,
      manualReview: data.manualReview,
    })

    for (const entry of data.results || []) {
      const icon = entry.status === 'parsed' || entry.status === 'success' ? 'check' : entry.status === 'manual_review' || entry.status === 'skipped' ? 'warning' : 'cross'
      console.log('parse result:', {
        icon,
        subjectOrRawEmailId: entry.subject || entry.rawEmailId,
        eventType: entry.eventType,
        confidence: entry.confidence,
        error: entry.error,
      })
    }

    if (data.parsed === 0 && data.failed === 0 && data.manualReview === 0) {
      console.warn('Brak raw emails do parsowania albo parse endpoint niczego nie przetworzyl.')
    }

    if (data.failed > 0) {
      console.error('Parse ma niepowodzenia:', data.failed)
    }

    if (data.manualReview > 0) {
      console.warn("Manual review > 0: elementy powinny byc widoczne w UI 'Emaile do zaakceptowania'.")
    }

    expect(result.status).toBe(200)
  })

  test('5. Apply — zastosuj parsed events do bookings', async ({ page }) => {
    test.setTimeout(120_000)
    test.skip(!cronSecret, 'E2E_CRON_SECRET not set')

    await login(page)

    const result = await fetchInternal(page, '/api/internal/booksy/apply')
    const data = result.json || {}

    console.log('apply:', {
      status: result.status,
      applied: data.applied,
      skipped: data.skipped,
      failed: data.failed,
    })

    for (const entry of data.results || []) {
      const icon = entry.status === 'applied' || entry.status === 'success' ? 'check' : entry.status === 'skipped' ? 'warning' : 'cross'
      console.log('apply result:', {
        icon,
        label: entry.clientName || entry.serviceName || entry.parsedEventId,
        bookingId: entry.bookingId,
        error: entry.error,
      })
    }

    if (data.failed > 0) {
      console.error(
        'Apply ma niepowodzenia. Typowe przyczyny: konflikt terminu, brak klienta/uslugi/pracownika, niepoprawna data lub blad walidacji rezerwacji.'
      )
    }

    expect(result.status).toBe(200)
  })

  test('6. UI reconcile — pelny pipeline przez przycisk w UI', async ({ page }) => {
    test.setTimeout(240_000)

    await login(page)

    const health = await fetchAsUser(page, '/api/integrations/booksy/health')
    expect(health.status).toBe(200)

    const mailbox = (health.json?.mailboxes || []).find((entry: any) => entry.authStatus === 'active')

    if (!mailbox) {
      test.skip(true, 'No active mailboxes')
      return
    }

    const result = await fetchAsUser(page, '/api/integrations/booksy/reconcile', {
      method: 'POST',
      body: { accountId: mailbox.accountId },
    })
    const data = result.json || {}

    console.log('UI reconcile HTTP status:', result.status)
    console.log('data.reconcile:', JSON.stringify(data.reconcile, null, 2))
    console.log('data.parse:', JSON.stringify(data.parse, null, 2))
    console.log('data.apply:', JSON.stringify(data.apply, null, 2))

    if (result.status !== 200) {
      console.error('UI reconcile response text:', result.text)
    }

    expect(result.status).toBe(200)
    expect(data.success).toBe(true)
  })

  test('7. Pending queue — stan PO pipeline', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page)
    const result = await fetchAsUser(page, '/api/integrations/booksy/pending?status=pending')

    expect(result.status).toBe(200)

    const items = result.json?.pending || result.json?.items || []
    const bySource = {
      pending_email: items.filter((item: any) => item.source === 'pending_email').length,
      manual_review: items.filter((item: any) => item.source === 'manual_review').length,
    }

    console.log('pending count by source:', bySource)

    for (const item of items) {
      const parsedData = item.parsed_data || {}
      console.log('pending item after pipeline:', {
        source: item.source,
        subject: item.subject,
        created_at: item.created_at,
        failure_detail: item.failure_detail,
        clientName: parsedData.clientName,
        clientPhone: parsedData.clientPhone,
        clientEmail: parsedData.clientEmail,
        serviceName: parsedData.serviceName,
        employeeName: parsedData.employeeName,
        bookingDate: parsedData.bookingDate,
        bookingTime: parsedData.bookingTime,
        price: parsedData.price,
      })
    }

    if (items.length > 0) {
      console.log(`SUMMARY: Sprawdz kolejke manualna w /${slug}/settings/integrations/booksy`)
    } else {
      console.log(
        'INFO: Brak pending items. Diagnostyka: sprawdz Gmail search/reconcile, raw emails i parse/apply logi.'
      )
    }
  })

  test('8. UI — weryfikacja strony ustawien Booksy', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page)
    await page.goto(`/${slug}/settings/integrations/booksy`)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'Integracja Booksy' })).toBeVisible()
    await expect(page.getByText('Emaile do zaakceptowania')).toBeVisible()

    const mailboxCards = page.locator('[class*="card"]').filter({ hasText: /auth:/ })
    const cardCount = await mailboxCards.count()
    console.log('mailbox card count:', cardCount)

    for (const [index] of Array.from({ length: cardCount }).entries()) {
      const text = await mailboxCards.nth(index).innerText()
      console.log('mailbox card status:', {
        index,
        auth: text.match(/auth:\s*([^\n\r]+)/i)?.[1]?.trim(),
        watch: text.match(/watch:\s*([^\n\r]+)/i)?.[1]?.trim(),
      })
    }

    if (cardCount === 0) {
      console.warn('Brak kart skrzynek Booksy w UI.')
    }

    const emptyStateCount = await page.getByText(/brak maili|brak elementow|brak rezerwacji/i).count()
    console.log('empty state matches:', emptyStateCount)

    const screenshotPath = 'output/playwright/booksy-settings-diagnostic.png'
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log('screenshot:', screenshotPath)
  })

  test('9. UI — klikniecie Replay 24h i obserwacja odpowiedzi', async ({ page }) => {
    test.setTimeout(240_000)

    await login(page)
    await page.goto(`/${slug}/settings/integrations/booksy`)
    await page.waitForLoadState('networkidle')

    const replayButton = page.getByRole('button', { name: 'Replay 24h' }).first()

    if ((await replayButton.count()) === 0) {
      console.warn('Brak widocznego przycisku Replay 24h.')
      test.skip(true, 'No Replay 24h button visible')
      return
    }

    const replayResponses: Array<{ url: string; status: number; body: string }> = []
    page.on('response', async (response) => {
      if (!response.url().includes('/api/integrations/booksy/replay')) {
        return
      }

      let body = ''
      try {
        body = await response.text()
      } catch (error) {
        body = `Unable to read body: ${String(error)}`
      }

      replayResponses.push({
        url: response.url(),
        status: response.status(),
        body,
      })
    })

    await replayButton.click()
    await expect(replayButton).not.toHaveText('Trwa...', { timeout: 180_000 })
    await page.waitForTimeout(500)

    for (const response of replayResponses) {
      let parsed: unknown = response.body
      try {
        parsed = response.body ? JSON.parse(response.body) : null
      } catch {
        parsed = response.body
      }

      console.log('replay API response:', {
        url: response.url,
        status: response.status,
        body: parsed,
      })
    }

    const screenshotPath = 'output/playwright/booksy-after-replay.png'
    await page.screenshot({ path: screenshotPath, fullPage: false })
    console.log('screenshot:', screenshotPath)
  })
})
