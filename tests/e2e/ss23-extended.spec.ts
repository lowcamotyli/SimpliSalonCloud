import { randomUUID } from 'node:crypto'
import { expect, test, type Locator, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const apiKey = process.env.PUBLIC_API_KEY || 'staging-test-key'

async function login(page: Page) {
  if (!email || !password) {
    throw new Error('Missing E2E_EMAIL or E2E_PASSWORD environment variables')
  }

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/Hasło|Haslo/i).fill(password)
  await page.getByRole('button', { name: /zaloguj/i }).click()
  await page.waitForURL(new RegExp(`/${slug}/`), { timeout: 30_000 })
}

async function openFirstClientProfile(page: Page) {
  await page.goto(`/${slug}/clients`)

  const firstClientHeading = page.locator('main').getByRole('heading', { level: 3 }).first()
  await expect(firstClientHeading).toBeVisible({ timeout: 20_000 })
  await firstClientHeading.click()
  await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })
  await expect(page.getByText(/Saldo klienta/i)).toBeVisible({ timeout: 20_000 })
}

async function getBalanceAmount(page: Page) {
  const balanceText = await page.getByText(/-?\d+[,.]\d{2}\s*zł/i).first().innerText()
  return balanceText.trim()
}

function extractUuidFromUrl(page: Page): string {
  const match = page.url().match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)
  if (!match) {
    throw new Error(`No UUID found in URL: ${page.url()}`)
  }
  return match[0]
}

async function getBalanceValue(page: Page, clientId: string): Promise<number> {
  const response = await page.request.get(`/api/clients/${clientId}/balance`)
  expect(response.status()).toBe(200)
  const payload = (await response.json()) as { balance?: number }
  return Number(payload.balance ?? 0)
}

async function expectNoVisibleError(page: Page) {
  const errorUi = page
    .locator('[role="alert"], [data-sonner-toast], [data-testid="toast"]')
    .filter({ hasText: /błąd|blad|error|failed|nie udało|nie udalo|przekracza|insufficient|za dużo|za duzo/i })
    .first()

  await expect(errorUi).toBeHidden({ timeout: 3_000 })
}

function dialog(page: Page): Locator {
  return page.getByRole('dialog').last()
}

function unaccentedPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const normalized = escaped
    .replace(/[aą]/gi, '[aą]')
    .replace(/[cć]/gi, '[cć]')
    .replace(/[eę]/gi, '[eę]')
    .replace(/[lł]/gi, '[lł]')
    .replace(/[nń]/gi, '[nń]')
    .replace(/[oó]/gi, '[oó]')
    .replace(/[sś]/gi, '[sś]')
    .replace(/[zźż]/gi, '[zźż]')
  return new RegExp(normalized, 'i')
}

test.describe('SS2.3 extended coverage', () => {
  test('S13: force_override flag accepted on booking creation', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/calendar`)
    await expect(page).toHaveURL(new RegExp(`/${slug}/calendar`))

    const response = await page.request.post('/api/bookings', {
      data: {
        serviceId: randomUUID(),
        employeeId: randomUUID(),
        startTime: '2099-01-01T10:00:00Z',
        force_override: true,
        clientPhone: '+48500000000',
      },
    })

    const responseText = await response.text()
    expect([200, 201, 400, 409, 422]).toContain(response.status())
    expect(response.status()).not.toBe(403)
    expect(responseText).not.toMatch(/force_override is not allowed/i)
  })

  test('S13: public bookings API ignores force_override', async ({ page }) => {
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
        'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 200) + 10}`,
      },
      data: {
        name: 'Test E2E',
        phone: `+48500${String(Date.now()).slice(-6)}`,
        serviceId,
        date: '2099-01-01',
        time: '10:00',
        force_override: true,
      },
    })

    const responseText = await response.text()
    expect([400, 404, 409, 422]).toContain(response.status())
    expect(response.status()).not.toBe(500)
    expect(responseText).not.toContain('"force_override":true')
    expect(responseText).not.toContain('"force_override": true')
  })

  test('S16/S17: client balance full flow - deposit and debit', async ({ page }) => {
    test.setTimeout(90_000)

    await login(page)
    await openFirstClientProfile(page)

    const clientId = extractUuidFromUrl(page)
    const initialBalance = await getBalanceValue(page, clientId)

    await page.getByRole('button', { name: /Doładuj|Doladuj/i }).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('heading', { name: /Doładowanie|Doladowanie|Doładuj saldo|Doladuj saldo/i })).toBeVisible()
    await dialog(page).getByLabel(/Kwota/i).fill('50')
    await dialog(page).getByRole('button', { name: /Doładuj|Doladuj/i }).click()
    await expect.poll(async () => await getBalanceValue(page, clientId), { timeout: 20_000 }).toBeGreaterThan(initialBalance)
    if (await dialog(page).isVisible().catch(() => false)) {
      await dialog(page).getByRole('button', { name: /Anuluj/i }).click()
    }

    const afterDeposit = await getBalanceValue(page, clientId)

    await page.getByRole('button', { name: /Pobierz/i }).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('heading', { name: /Pobierz z salda/i })).toBeVisible()
    await dialog(page).getByLabel(/Kwota/i).fill('20')
    await dialog(page).getByRole('button', { name: /Pobierz/i }).click()
    await expectNoVisibleError(page)
    await expect.poll(async () => await getBalanceValue(page, clientId), { timeout: 20_000 }).toBeLessThan(afterDeposit)
    if (await dialog(page).isVisible().catch(() => false)) {
      await dialog(page).getByRole('button', { name: /Anuluj/i }).click()
    }
  })

  test('S17: overdraft validation - debit more than balance', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page)
    await openFirstClientProfile(page)

    await page.getByRole('button', { name: /Pobierz/i }).click()
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByLabel(/Kwota/i).fill('999999')

    const submitButton = dialog(page).getByRole('button', { name: /Pobierz/i })
    await submitButton.click()

    const overdraftError = page.getByText(unaccentedPattern('Kwota nie może przekraczać dostępnego salda')).first()

    await expect
      .poll(async () => {
        if (await overdraftError.isVisible().catch(() => false)) {
          return 'error'
        }

        return (await submitButton.isEnabled().catch(() => false)) ? 'enabled' : 'disabled'
      })
      .toMatch(/error|disabled/)
  })

  test('S17: payment link dialog opens from client profile', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page)
    await openFirstClientProfile(page)

    await expect(page.getByRole('button', { name: /Wyślij link do płatności|Wyslij link do platnosci/i })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: /Wyślij link do płatności|Wyslij link do platnosci/i }).click()

    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('heading', { name: /Wygeneruj link do płatności|Wygeneruj link do platnosci/i })).toBeVisible()
    await expect(dialog(page).getByText(/Pełna kwota|Pelna kwota|Własna kwota|Wlasna kwota|Doładowanie salda|Doladowanie salda/i).first()).toBeVisible()
  })

  test('S18: service description textarea visible in edit form', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/services`)

    const editButton = page.getByRole('button', { name: /Edytuj/i }).first()
    await expect(editButton.or(page.locator('button[title="Edytuj"]').first())).toBeVisible({ timeout: 20_000 })
    await page.locator('button[title="Edytuj"]').first().click({ force: true })

    await expect(page.getByText(/Edytuj usługę|Edytuj usluge/i)).toBeVisible()
    const descriptionField = page.getByLabel(/Opis usługi|Opis uslugi/i)
    await expect(descriptionField).toBeVisible()
    await descriptionField.fill('Opis testowy e2e')

    await page.getByRole('button', { name: /zapisz/i }).click()
    await expectNoVisibleError(page)
  })

  test('S19: salon terms section visible in business settings', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/settings/business`)

    await expect(page.getByLabel(/Treść regulaminu|Tresc regulaminu/i)).toBeVisible()
    await expect(page.getByLabel(/URL regulaminu/i)).toBeVisible()
  })
})
