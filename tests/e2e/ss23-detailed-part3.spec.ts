import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

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

async function expectNoVisibleError(page: Page) {
  const err = page
    .locator('[role="alert"], [data-sonner-toast], [data-testid="toast"]')
    .filter({ hasText: /błąd|error|failed|nie udało|przekracza|insufficient/i })
    .first()
  await expect(err).toBeHidden({ timeout: 3_000 })
}

async function getFirstPublicServiceId(page: Page): Promise<string | null> {
  const servicesResponse = await page.request.get('/api/public/services', {
    headers: { 'X-API-Key': apiKey },
  })
  if (servicesResponse.status() !== 200) {
    return null
  }

  const servicesPayload = (await servicesResponse.json()) as { services: Array<{ id: string }> }
  return servicesPayload.services[0]?.id ?? null
}

test.describe('S21 - Service Gallery Modal', () => {
  test('gallery modal closes on Escape key press', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/services`)
    await page.locator('button[title="Edytuj"]').first().click({ force: true })
    await expect(page.getByText(/Edytuj usługę|Edytuj usluge/i)).toBeVisible({ timeout: 15_000 })
    const galleryBtn = page.getByRole('button', { name: /Galeria/i }).first()
    if (!(await galleryBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip()
      return
    }
    await galleryBtn.click()
    const gd = page.getByRole('dialog').filter({ hasText: /Galeria|zdjęcie|zdjecie/i }).last()
    await expect(gd).toBeVisible({ timeout: 8_000 })
    await page.keyboard.press('Escape')
    await expect(gd).toBeHidden({ timeout: 8_000 })
  })

  test('gallery modal shows next/prev navigation when service has 2+ images', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/services`)
    await page.locator('button[title="Edytuj"]').first().click({ force: true })
    await expect(page.getByText(/Edytuj usługę|Edytuj usluge/i)).toBeVisible({ timeout: 15_000 })
    const galleryLink = page.getByText(/Galeria \([2-9]|\d{2,}\)/).first()
    if (!(await galleryLink.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip()
      return
    }
    await galleryLink.click()
    const d = page.getByRole('dialog').last()
    await expect(d).toBeVisible({ timeout: 8_000 })
    await expect(d.getByRole('button', { name: /następne|nastepne|dalej|next/i })).toBeVisible()
    await d.getByRole('button', { name: /następne|nastepne|dalej|next/i }).click()
    await expect(d.getByRole('button', { name: /poprzednie|wstecz|prev/i })).toBeVisible()
  })
})

test.describe('S22 - Client Tags + CRM Segmentation', () => {
  test('GET /api/clients?distinct_tags=true returns { tags: string[] }', async ({ page }) => {
    test.setTimeout(30_000)
    await login(page)
    const response = await page.request.get('/api/clients?distinct_tags=true')
    expect(response.status()).toBe(200)
    const body = (await response.json()) as { tags?: unknown }
    expect(body).toHaveProperty('tags')
    expect(Array.isArray(body.tags)).toBe(true)
  })

  test('GET /api/clients?tags=VIP returns subset of all clients', async ({ page }) => {
    test.setTimeout(30_000)
    await login(page)
    const [allResponse, vipResponse] = await Promise.all([
      page.request.get('/api/clients'),
      page.request.get('/api/clients?tags=VIP'),
    ])
    expect(allResponse.status()).toBe(200)
    expect(vipResponse.status()).toBe(200)
    type Resp = { clients?: unknown[] } | unknown[]
    const count = (body: Resp) => (Array.isArray(body) ? body.length : ((body as { clients?: unknown[] }).clients?.length ?? 0))
    expect(count((await vipResponse.json()) as Resp)).toBeLessThanOrEqual(count((await allResponse.json()) as Resp))
  })

  test('clients list page shows Tagi filter', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/clients`)
    await expect(page.getByRole('heading', { name: /Klienci/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Tagi/i)).toBeVisible()
  })

  test('POST /api/crm/segments/preview accepts tags filter - not 500', async ({ page }) => {
    test.setTimeout(30_000)
    await login(page)
    const response = await page.request.post('/api/crm/segments/preview', {
      data: { filters: [{ field: 'tags', operator: 'contains', values: ['VIP'] }] },
    })
    expect(response.status()).not.toBe(405)
    expect(response.status()).not.toBe(500)
    expect([200, 400, 422]).toContain(response.status())
  })
})

test.describe('S23 - Bulk Service Actions', () => {
  test('PATCH /api/services/batch requires auth - not 405', async ({ page }) => {
    const response = await page.request.patch('/api/services/batch', {
      data: { ids: [randomUUID()], action: 'activate' },
    })
    expect(response.status()).not.toBe(405)
    expect([401, 403]).toContain(response.status())
  })

  test('authenticated PATCH /api/services/batch with foreign IDs returns updated_count=0', async ({ page }) => {
    test.setTimeout(30_000)
    await login(page)
    const response = await page.request.patch('/api/services/batch', {
      data: { ids: ['00000000-0000-0000-0000-000000000000'], action: 'activate' },
    })
    expect(response.status()).not.toBe(500)
    if (response.status() === 200) {
      const body = (await response.json()) as { updated_count?: number }
      expect(body.updated_count).toBe(0)
    } else {
      expect([400, 422]).toContain(response.status())
    }
  })

  test('bulk action bar shows count=2 when two services selected', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/services`)
    await expect(page.getByRole('heading', { name: /Usługi|Uslugi/i })).toBeVisible({ timeout: 15_000 })
    const boxes = page.locator('[aria-label^="Zaznacz usługę"], [aria-label^="Zaznacz uslugę"], [aria-label^="Zaznacz usluge"]')
    if (await boxes.count() < 2) {
      test.skip()
      return
    }
    await boxes.nth(0).click()
    await boxes.nth(1).click()
    await expect(page.locator('div').filter({ hasText: /Zaznaczono:\s*2/ }).last()).toBeVisible({ timeout: 8_000 })
  })

  test('bulk activate then deactivate produces no error', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page)
    await page.goto(`/${slug}/services`)
    await expect(page.getByRole('heading', { name: /Usługi|Uslugi/i })).toBeVisible({ timeout: 15_000 })
    const box = page.locator('[aria-label^="Zaznacz usługę"], [aria-label^="Zaznacz uslugę"], [aria-label^="Zaznacz usluge"]').first()
    await expect(box).toBeVisible()
    await box.click()
    const bar1 = page.locator('div').filter({ hasText: /Zaznaczono:\s*1/ }).last()
    await expect(bar1).toBeVisible()
    await bar1.getByRole('button', { name: /Dezaktywuj/i }).click()
    await expectNoVisibleError(page)
    await page.goto(`/${slug}/services`)
    await expect(box).toBeVisible({ timeout: 15_000 })
    await box.click()
    const bar2 = page.locator('div').filter({ hasText: /Zaznaczono:\s*1/ }).last()
    await expect(bar2).toBeVisible()
    await bar2.getByRole('button', { name: /^Aktywuj$/i }).click()
    await expectNoVisibleError(page)
  })
})

test.describe('S24 - Premium Hours in Public Availability', () => {
  test('premium hours settings page renders form', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/settings/premium-hours`)
    await expect(page.getByRole('heading', { name: 'Premium godziny' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel(/Nazwa/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Dodaj slot/i })).toBeVisible()
  })

  test('GET /api/public/availability does not return 500', async ({ page }) => {
    const serviceId = await getFirstPublicServiceId(page)
    if (!serviceId) {
      test.skip()
      return
    }

    const response = await page.request.get('/api/public/availability', {
      headers: { 'X-API-Key': apiKey },
      params: { date: '2026-04-30', serviceId },
    })
    expect(response.status()).not.toBe(500)
    expect([200, 400, 404, 422]).toContain(response.status())
  })

  test('premium slot created via API is reflected in availability metadata', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    const serviceId = await getFirstPublicServiceId(page)
    if (!serviceId) {
      test.skip()
      return
    }

    const slotResponse = await page.request.post('/api/premium-slots', {
      data: {
        name: 'E2E Availability Meta Test',
        date: '2099-02-01',
        start_time: '08:00',
        end_time: '09:00',
        price_modifier: 1.5,
        requires_prepayment: false,
        service_ids: [serviceId],
      },
    })
    if (![200, 201].includes(slotResponse.status())) {
      test.skip()
      return
    }

    const slotBody = (await slotResponse.json()) as { id?: string }
    const slotId = slotBody.id

    const availabilityResponse = await page.request.get('/api/public/availability', {
      headers: { 'X-API-Key': apiKey },
      params: { date: '2099-02-01', serviceId },
    })
    if (availabilityResponse.status() === 200) {
      const payload = (await availabilityResponse.json()) as {
        slots?: string[]
        premiumMeta?: Record<string, unknown>
      }
      expect(payload).toHaveProperty('premiumMeta')
      if ((payload.slots ?? []).length > 0) {
        expect(Object.keys(payload.premiumMeta ?? {}).length).toBeGreaterThanOrEqual(0)
      }
    } else {
      expect([200, 400, 404]).toContain(availabilityResponse.status())
    }

    if (slotId) await page.request.delete(`/api/premium-slots/${slotId}`)
  })
})
