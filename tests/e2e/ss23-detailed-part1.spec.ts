import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

async function login(page: Page) {
  if (!email || !password) throw new Error('Missing E2E_EMAIL or E2E_PASSWORD')
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Hasło').fill(password)
  await page.getByRole('button', { name: /zaloguj/i }).click()
  await page.waitForURL(new RegExp(`/${slug}/`), { timeout: 30_000 })
}

async function openFirstClientProfile(page: Page) {
  await page.goto(`/${slug}/clients`)
  const heading = page.locator('main').getByRole('heading', { level: 3 }).first()
  await expect(heading).toBeVisible({ timeout: 20_000 })
  await heading.click()
  await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })
  await expect(page.getByText('Saldo klienta')).toBeVisible({ timeout: 20_000 })
}

function dialog(page: Page): Locator {
  return page.getByRole('dialog').last()
}

function extractUuidFromUrl(page: Page): string {
  const match = page.url().match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)
  if (!match) throw new Error(`No UUID in URL: ${page.url()}`)
  return match[0]
}

test.describe('S13 — Conflict Override UI', () => {
  test('conflict checkbox appears after 409 and enables override button', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/calendar`)
    await page.route('**/api/bookings', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'conflict', conflictTypes: ['employee'] }),
        })
      } else {
        await route.continue()
      }
    })

    const newBtn = page.getByRole('button', { name: /nowa wizyta|dodaj wizytę|utwórz wizytę/i }).first()
    if (!(await newBtn.isVisible({ timeout: 8_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await newBtn.click()
    await expect(dialog(page)).toBeVisible({ timeout: 10_000 })
    await dialog(page).getByRole('button', { name: /zapisz|utwórz|potwierdź/i }).first().click()

    const checkbox = page.getByRole('checkbox', { name: /akceptuję kolizję|zapisz mimo/i })
    await expect(checkbox).toBeVisible({ timeout: 10_000 })

    const overrideBtn = page.getByRole('button', { name: /zapisz mimo konfliktu/i })
    await expect(overrideBtn).toBeDisabled()
    await checkbox.check()
    await expect(overrideBtn).toBeEnabled()
  })

  test('booking dialog shows equipment section when API returns equipment_name', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/calendar`)
    await page.route(/\/api\/bookings\/[a-f0-9-]+$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '00000000-0000-0000-0000-000000000001',
            service_name: 'Usługa testowa',
            employee_id: randomUUID(),
            start_time: '2099-01-01T10:00:00Z',
            status: 'confirmed',
            equipment_name: 'Fotel Premium',
          }),
        })
      } else {
        await route.continue()
      }
    })

    const card = page.locator('[class*=booking], [data-booking], .fc-event').first()
    if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await card.click()
    await expect(dialog(page)).toBeVisible({ timeout: 10_000 })
    await expect(dialog(page).getByText(/Sprzęt|Stanowisko|Fotel Premium/i)).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('S14 — Booking Edit API', () => {
  test('PATCH /api/bookings/[id] endpoint exists — not 405', async ({ page }) => {
    const response = await page.request.patch('/api/bookings/00000000-0000-0000-0000-000000000000', {
      data: { service_id: randomUUID() },
    })
    expect(response.status()).not.toBe(405)
    expect([400, 401, 403, 404, 422]).toContain(response.status())
  })

  test('POST /api/bookings/group/[groupId]/add endpoint exists — not 405', async ({ page }) => {
    const response = await page.request.post('/api/bookings/group/00000000-0000-0000-0000-000000000000/add', {
      data: {
        service_id: randomUUID(),
        employee_id: randomUUID(),
        start_time: '2099-01-01T10:00:00Z',
      },
    })
    expect(response.status()).not.toBe(405)
    expect(response.status()).not.toBe(500)
  })

  test('authenticated PATCH /api/bookings/[id] with force_override is not 403', async ({ page }) => {
    await login(page)
    const response = await page.request.patch('/api/bookings/00000000-0000-0000-0000-000000000000', {
      data: { service_id: randomUUID(), force_override: true },
    })
    expect(response.status()).not.toBe(403)
    expect(response.status()).not.toBe(405)
  })
})

test.describe('S15 — Booking Edit UI', () => {
  test('booking dialog in edit mode shows services editor section', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/calendar`)
    await page.route(/\/api\/bookings\/[a-f0-9-]+$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            service_id: randomUUID(),
            service_name: 'Strzyżenie',
            employee_id: randomUUID(),
            start_time: '2099-06-01T10:00:00Z',
            status: 'confirmed',
            group_booking_id: null,
            equipment_name: null,
          }),
        })
      } else {
        await route.continue()
      }
    })

    const card = page.locator('[class*=booking], [data-booking], .fc-event').first()
    if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await card.click()
    await expect(dialog(page)).toBeVisible({ timeout: 10_000 })

    const section = dialog(page).getByText(/Usługi w wizycie|Zmień usługę|Dodaj usługę/i)
    const addBtn = dialog(page).getByRole('button', { name: /Dodaj usługę/i })
    const visibleSection = await section.isVisible({ timeout: 8_000 }).catch(() => false)
    const visibleAddBtn = await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)

    expect(visibleSection || visibleAddBtn).toBe(true)
  })
})

test.describe('S16 — Client Balance API', () => {
  test('GET /api/clients/[id]/balance returns 401 without auth', async ({ page }) => {
    const response = await page.request.get('/api/clients/00000000-0000-0000-0000-000000000000/balance')
    expect(response.status()).toBe(401)
  })

  test('GET /api/clients/[id]/balance returns balance + transactions when authenticated', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/clients`)
    await page.locator('main').getByRole('heading', { level: 3 }).first().click()
    await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })

    const clientId = extractUuidFromUrl(page)
    const response = await page.request.get(`/api/clients/${clientId}/balance`)
    expect(response.status()).toBe(200)

    const body = (await response.json()) as { balance: unknown; transactions: unknown }
    expect(typeof body.balance).toBe('number')
    expect(Array.isArray(body.transactions)).toBe(true)
  })

  test('POST /api/clients/[id]/balance/deposit with amount=0 is rejected', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/clients`)
    await page.locator('main').getByRole('heading', { level: 3 }).first().click()
    await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })

    const clientId = extractUuidFromUrl(page)
    const response = await page.request.post(`/api/clients/${clientId}/balance/deposit`, { data: { amount: 0 } })
    expect([400, 422]).toContain(response.status())
  })

  test('POST /api/clients/[id]/balance/debit with amount > balance returns 422', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)
    await page.goto(`/${slug}/clients`)
    await page.locator('main').getByRole('heading', { level: 3 }).first().click()
    await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })

    const clientId = extractUuidFromUrl(page)
    const response = await page.request.post(`/api/clients/${clientId}/balance/debit`, {
      data: { amount: 99_999_999 },
    })
    expect([400, 422]).toContain(response.status())

    const body = (await response.json()) as Record<string, unknown>
    expect(JSON.stringify(body)).toMatch(/balance|saldo|insufficient|przekracza/i)
  })

  test('POST /api/clients/[id]/balance/refund endpoint exists — not 405', async ({ page }) => {
    const response = await page.request.post(
      '/api/clients/00000000-0000-0000-0000-000000000000/balance/refund',
      { data: { amount: 10 } }
    )
    expect(response.status()).not.toBe(405)
    expect([401, 403, 404, 500]).toContain(response.status())
  })
})
