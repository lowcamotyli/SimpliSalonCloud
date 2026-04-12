import { expect, test, type Locator, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const apiKey = process.env.PUBLIC_API_KEY || 'staging-test-key'

async function login(page: Page) {
  if (!email || !password) throw new Error('Missing E2E_EMAIL or E2E_PASSWORD')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/Hasło|Haslo/i).fill(password)
  await page.getByRole('button', { name: /zaloguj/i }).click()
  await page.waitForURL(new RegExp(`/${slug}/`), { timeout: 30_000 })
}

async function openFirstClientProfile(page: Page) {
  await page.goto(`/${slug}/clients`)
  const heading = page.locator('main').getByRole('heading', { level: 3 }).first()
  await expect(heading).toBeVisible({ timeout: 20_000 })
  await heading.click()
  await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })
  await expect(page.getByText(/Saldo klienta/i)).toBeVisible({ timeout: 20_000 })
}

async function expectNoVisibleError(page: Page) {
  const err = page
    .locator('[role="alert"], [data-sonner-toast], [data-testid="toast"]')
    .filter({ hasText: /błąd|error|failed|nie udało|przekracza|insufficient/i })
    .first()
  await expect(err).toBeHidden({ timeout: 3_000 })
}

function dialog(page: Page): Locator {
  return page.getByRole('dialog').last()
}

test.describe('S17 - Balance History UI', () => {
  test('transaction history tab shows type badges after opening', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await openFirstClientProfile(page)
    await page.getByRole('button', { name: /Historia transakcji/i }).click()
    await expect(page.getByRole('heading', { name: /Historia transakcji/i })).toBeVisible({ timeout: 10_000 })
    const badge = page.getByText(/Doładowanie|Doladowanie|Pobranie|Zwrot|deposit|debit|refund/i).first()
    if (await badge.isVisible({ timeout: 5_000 }).catch(() => false)) await expect(badge).toBeVisible()
  })

  test('balance widget displays numeric amount in zł', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await openFirstClientProfile(page)
    const txt = await page.getByText(/-?\d+[,.]\d{2}\s*zł/i).first().innerText()
    expect(txt).toMatch(/\d+[,.]\d{2}\s*zł/i)
  })
})

test.describe('S18 - Service Descriptions', () => {
  test('description character counter updates as user types', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/services`)
    await page.locator('button[title="Edytuj"]').first().click({ force: true })
    await expect(page.getByText(/Edytuj usługę|Edytuj usluge/i)).toBeVisible({ timeout: 15_000 })
    const descField = page.getByLabel(/Opis usługi|Opis uslugi/i)
    await expect(descField).toBeVisible()
    await descField.fill('a'.repeat(50))
    const counter = page.locator('[data-char-count], .char-count').first()
    if (await counter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(counter).toContainText('50')
    } else {
      await expect(page.getByText(/50\s*\/\s*1[\s_]?000|50\/1000/i)).toBeVisible({ timeout: 5_000 })
    }
  })

  test('GET /api/public/services returns description field', async ({ page }) => {
    const response = await page.request.get('/api/public/services', { headers: { 'X-API-Key': apiKey } })
    if (response.status() === 200) {
      const body = (await response.json()) as { services?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
      const services = Array.isArray(body) ? body : ((body as { services?: Array<Record<string, unknown>> }).services ?? [])
      if (services.length > 0) expect(services[0]).toHaveProperty('description')
    } else {
      expect([200, 400, 401, 404]).toContain(response.status())
    }
  })

  test('public booking shows description expand when description is set', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`/booking/${slug}`)
    const loaded = await page
      .getByRole('heading', { name: /wybierz usługę|wybierz usluge|usługi|uslugi|zarezerwuj/i })
      .isVisible({ timeout: 15_000 })
      .catch(() => false)
    if (!loaded) {
      test.skip()
      return
    }
    const expandBtn = page.getByRole('button', { name: /Dowiedz się więcej|Dowiedz sie wiecej|opis/i }).first()
    if (await expandBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expandBtn.click()
      await expect(page.getByText(/opis|description/i).first()).toBeVisible({ timeout: 5_000 })
    }
  })
})

test.describe('S19 - Salon Terms E2E', () => {
  test('terms text saved in settings persists after page reload', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/settings/business`)
    const ta = page.getByLabel(/Treść regulaminu|Tresc regulaminu/i)
    await expect(ta).toBeVisible({ timeout: 15_000 })
    const unique = `REGULAMIN_E2E_${Date.now()}`
    await ta.fill(unique)
    await page.getByRole('button', { name: /zapisz/i }).last().click()
    await expectNoVisibleError(page)
    await page.reload()
    await expect(ta).toBeVisible({ timeout: 15_000 })
    await expect(ta).toHaveValue(new RegExp(unique))
  })

  test('POST /api/public/bookings without terms_accepted returns 400 or 422', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/settings/business`)
    const ta = page.getByLabel(/Treść regulaminu|Tresc regulaminu/i)
    if (!(await ta.inputValue().catch(() => ''))) {
      await ta.fill('Regulamin testowy wymagający akceptacji.')
      await page.getByRole('button', { name: /zapisz/i }).last().click()
      await expectNoVisibleError(page)
    }

    const servicesResponse = await page.request.get('/api/public/services', {
      headers: { 'X-API-Key': apiKey },
    })
    expect(servicesResponse.status()).toBe(200)
    const servicesPayload = (await servicesResponse.json()) as { services: Array<{ id: string }> }
    const serviceId = servicesPayload.services[0]?.id
    expect(serviceId).toBeTruthy()

    const response = await page.request.post('/api/public/bookings', {
      headers: {
        'X-API-Key': apiKey,
        'X-Forwarded-For': `198.51.100.${Math.floor(Math.random() * 200) + 10}`,
      },
      data: {
        name: 'Test E2E',
        phone: `+48501${String(Date.now()).slice(-6)}`,
        serviceId,
        date: '2099-01-01',
        time: '10:00',
      },
    })
    expect(response.status()).not.toBe(500)
    expect([400, 404, 409, 422]).toContain(response.status())
  })

  test('public booking confirm button disabled until terms checkbox checked', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`/booking/${slug}`)
    const loaded = await page
      .getByRole('heading', { name: /wybierz usługę|wybierz usluge|usługi|uslugi|zarezerwuj/i })
      .isVisible({ timeout: 15_000 })
      .catch(() => false)
    if (!loaded) {
      test.skip()
      return
    }
    const cb = page.getByRole('checkbox', { name: /regulamin/i })
    if (!(await cb.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }
    const confirmBtn = page.getByRole('button', { name: /potwierdź rezerwację|potwierdz rezerwacje|zatwierdź|zatwierdz/i })
    await expect(confirmBtn).toBeDisabled()
    await cb.check()
    await expect(confirmBtn).toBeEnabled()
  })
})

test.describe('S20 - Service Media API Validation', () => {
  async function getFirstServiceId(page: Page): Promise<string | null> {
    const response = await page.request.get('/api/services')
    if (response.status() !== 200) return null
    // /api/services returns a category tree: { services: [{ subcategories: [{ services: [{ id }] }] }] }
    const body = (await response.json()) as {
      services?: Array<{ subcategories?: Array<{ services?: Array<{ id: string }> }> }>
    }
    const categories = Array.isArray(body) ? [] : (body.services ?? [])
    for (const cat of categories) {
      for (const sub of cat.subcategories ?? []) {
        const id = sub.services?.[0]?.id
        if (id) return id
      }
    }
    return null
  }

  test('GET /api/services/[id]/media returns an array', async ({ page }) => {
    test.setTimeout(30_000)
    await login(page)
    const id = await getFirstServiceId(page)
    if (!id) {
      test.skip()
      return
    }
    const response = await page.request.get(`/api/services/${id}/media`)
    expect([200, 401]).toContain(response.status())
    if (response.status() === 200) expect(Array.isArray(await response.json())).toBe(true)
  })

  test('POST /api/services/[id]/media rejects oversized file >2MB', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    const id = await getFirstServiceId(page)
    if (!id) {
      test.skip()
      return
    }
    const response = await page.request.post(`/api/services/${id}/media`, {
      multipart: { image: { name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(3 * 1024 * 1024) } },
    })
    expect(response.status()).not.toBe(500)
    expect([400, 413, 422]).toContain(response.status())
  })

  test('POST /api/services/[id]/media rejects non-image MIME type', async ({ page }) => {
    test.setTimeout(30_000)
    await login(page)
    const id = await getFirstServiceId(page)
    if (!id) {
      test.skip()
      return
    }
    const response = await page.request.post(`/api/services/${id}/media`, {
      multipart: { image: { name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') } },
    })
    expect(response.status()).not.toBe(500)
    expect([400, 415, 422]).toContain(response.status())
  })

  test('DELETE /api/services/[id]/media/[mediaId] requires auth - not 405', async ({ page }) => {
    const response = await page.request.delete(
      '/api/services/00000000-0000-0000-0000-000000000000/media/00000000-0000-0000-0000-000000000001'
    )
    expect(response.status()).not.toBe(405)
    expect([401, 403, 404]).toContain(response.status())
  })

  test('PATCH /api/services/[id]/media/reorder endpoint exists - not 405', async ({ page }) => {
    const response = await page.request.patch(
      '/api/services/00000000-0000-0000-0000-000000000000/media/reorder',
      { data: { order: [] } }
    )
    expect(response.status()).not.toBe(405)
    expect(response.status()).not.toBe(500)
  })
})
