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

test.describe('SS2.3 staging heavy browser checks', () => {
  test('clients detail renders balance widget', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page)

    await page.goto(`/${slug}/clients`)
    await expect(page.getByRole('heading', { name: 'Klienci' })).toBeVisible()
    await expect(page.getByText('Tagi')).toBeVisible()

    const firstClientHeading = page.locator('main h3').first()
    await expect(firstClientHeading).toBeVisible()
    await firstClientHeading.click()
    await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })

    await expect(page.getByText('Saldo klienta')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Doładuj' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pobierz' })).toBeVisible()

    await page.getByRole('button', { name: 'Historia transakcji' }).click()
    await expect(page.getByRole('heading', { name: 'Historia transakcji' })).toBeVisible()
  })

  test('client tags can be added and removed from the detail page', async ({ page }) => {
    await login(page)

    const testTag = `e2e-tag-${Date.now()}`

    await page.goto(`/${slug}/clients`)
    const firstClientHeading = page.locator('main h3').first()
    await expect(firstClientHeading).toBeVisible()
    await firstClientHeading.click()
    await page.waitForURL(new RegExp(`/${slug}/clients/[a-f0-9-]+$`), { timeout: 20_000 })

    await expect(page.getByText('Tagi')).toBeVisible()

    const tagInput = page.getByPlaceholder('Add a tag')
    await tagInput.fill(testTag)
    await page.getByRole('button', { name: '+' }).click()
    await expect(page.getByText(testTag)).toBeVisible({ timeout: 15_000 })

    const removeButton = page.getByLabel(`Remove tag ${testTag}`)
    await expect(removeButton).toBeEnabled({ timeout: 15_000 })
    await removeButton.click()
    await expect(page.getByText(testTag)).toHaveCount(0)
  })

  test('services page exposes bulk actions and SS2.3 edit controls', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/services`)
    await expect(page.getByRole('heading', { name: 'Usługi' })).toBeVisible()

    const firstServiceCheckbox = page.locator('[aria-label^="Zaznacz usługę"]').first()
    await expect(firstServiceCheckbox).toBeVisible()
    await firstServiceCheckbox.click()

    const bulkBar = page.locator('div').filter({ hasText: /Zaznaczono:\s*1 usł/ }).last()
    await expect(bulkBar).toBeVisible()
    await expect(bulkBar.getByRole('button', { name: 'Aktywuj', exact: true })).toBeVisible()
    await expect(bulkBar.getByRole('button', { name: 'Dezaktywuj', exact: true })).toBeVisible()
    await expect(bulkBar.getByRole('button', { name: 'Przypisz dodatki', exact: true })).toBeVisible()
    await expect(bulkBar.getByRole('button', { name: 'Usuń przypisanie', exact: true })).toBeVisible()
    await bulkBar.getByRole('button', { name: 'Odznacz wszystkie', exact: true }).click()

    await page.locator('button[title="Edytuj"]').first().click({ force: true })
    await expect(page.getByText('Edytuj usługę')).toBeVisible()
    await expect(page.getByLabel('Opis usługi')).toBeVisible()
    await expect(page.getByText('Galeria zdjęć')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dodaj zdjęcie' })).toBeVisible()
  })

  test('addon templates can be created, bulk-assigned, bulk-removed and cleaned up', async ({ page }) => {
    await login(page)

    const templateName = `E2E Addon ${Date.now()}`

    await page.goto(`/${slug}/services/addon-templates`)
    await expect(page.getByRole('heading', { name: 'Szablony Dodatków' })).toBeVisible()

    await page.getByLabel('Nazwa').fill(templateName)
    await page.getByLabel('Zmiana ceny (PLN)').fill('19')
    await page.getByLabel('Zmiana czasu (min)').fill('10')
    await page.getByRole('button', { name: 'Dodaj szablon' }).click()
    await expect(page.getByText(templateName)).toBeVisible({ timeout: 15_000 })

    await page.goto(`/${slug}/services`)
    const firstServiceCheckbox = page.locator('[aria-label^="Zaznacz usługę"]').first()
    await firstServiceCheckbox.click()

    const bulkBar = page.locator('div').filter({ hasText: /Zaznaczono:\s*1 usł/ }).last()
    await bulkBar.getByRole('button', { name: 'Przypisz dodatki', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Przypisz dodatki do uslug' })).toBeVisible()
    await page.getByLabel(templateName).click()
    await page.getByRole('button', { name: 'Przypisz dodatki', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Przypisz dodatki do uslug' })).toHaveCount(0)

    await page.goto(`/${slug}/services`)
    const firstServiceCheckboxAgain = page.locator('[aria-label^="Zaznacz usługę"]').first()
    const firstServiceEdit = page.locator('button[title="Edytuj"]').first()
    await firstServiceCheckboxAgain.click()
    const bulkBarAgain = page.locator('div').filter({ hasText: /Zaznaczono:\s*1 usł/ }).last()
    await bulkBarAgain.getByRole('button', { name: 'Odznacz wszystkie', exact: true }).click()
    await firstServiceEdit.click({ force: true })

    await expect(page.getByText(templateName)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByText('Edytuj usługę')).toHaveCount(0)

    await firstServiceCheckboxAgain.click()
    const bulkBarRemove = page.locator('div').filter({ hasText: /Zaznaczono:\s*1 usł/ }).last()
    await bulkBarRemove.getByRole('button', { name: 'Usuń przypisanie', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Usun dodatki z uslug' })).toBeVisible()
    await page.getByLabel(templateName).click()
    await page.getByRole('button', { name: 'Usun dodatki', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Usun dodatki z uslug' })).toHaveCount(0)

    await page.goto(`/${slug}/services`)
    await firstServiceEdit.click({ force: true })
    await expect(page.getByText(templateName)).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.goto(`/${slug}/services/addon-templates`)
    const row = page.locator('div.rounded-md.border.p-3').filter({ hasText: templateName }).first()
    await row.getByRole('button', { name: 'Usuń' }).click()
    await expect(page.getByText(templateName)).toHaveCount(0)
  })

  test('service media can be uploaded and deleted', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/services`)
    await page.locator('button[title="Edytuj"]').first().click({ force: true })
    await expect(page.getByText('Galeria zdjęć')).toBeVisible()

    const fileInput = page.locator('input[type="file"]')
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9wAAAABJRU5ErkJggg==',
      'base64'
    )

    const existingDeleteButtons = await page.getByLabel('Usuń zdjęcie').count()
    await fileInput.setInputFiles({
      name: 'ss23-e2e.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    })

    await expect.poll(async () => await page.getByLabel('Usuń zdjęcie').count(), { timeout: 20_000 }).toBeGreaterThan(existingDeleteButtons)
    await page.getByLabel('Usuń zdjęcie').last().click()
    await expect.poll(async () => await page.getByLabel('Usuń zdjęcie').count(), { timeout: 20_000 }).toBe(existingDeleteButtons)
  })

  test('public API exposes salon terms, services images and premium availability metadata', async ({ request }) => {
    test.setTimeout(120_000)

    const apiKey = 'staging-test-key'
    const salonId = 'f5d0f479-5959-4cf8-8a3f-24f63a981f9b'

    const termsResponse = await request.get('/api/public/salon-settings', {
      headers: {
        'X-Salon-Id': salonId,
      },
    })
    expect(termsResponse.status()).toBe(200)
    const termsPayload = await termsResponse.json()
    expect(termsPayload).toHaveProperty('has_terms')

    const servicesResponse = await request.get('/api/public/services', {
      headers: {
        'X-API-Key': apiKey,
      },
    })
    expect([200, 401]).toContain(servicesResponse.status())

    if (servicesResponse.status() === 200) {
      const servicesPayload = await servicesResponse.json()
      expect(Array.isArray(servicesPayload.services)).toBe(true)
      const firstService = servicesPayload.services[0]
      expect(firstService).toHaveProperty('description')
      expect(firstService).toHaveProperty('images')

      const availabilityResponse = await request.get('/api/public/availability', {
        headers: {
          'X-API-Key': apiKey,
        },
        params: {
          date: '2026-04-30',
          serviceId: firstService.id,
        },
      })
      expect([200, 400, 404]).toContain(availabilityResponse.status())

      if (availabilityResponse.status() === 200) {
        const availabilityPayload = await availabilityResponse.json()
        expect(availabilityPayload).toHaveProperty('premiumMeta')
      }
    }
  })

  test('premium hours create and delete flow works', async ({ page }) => {
    await login(page)

    const slotName = `E2E Premium ${Date.now()}`

    await page.goto(`/${slug}/settings/premium-hours`)
    await expect(page.getByRole('heading', { name: 'Premium godziny' })).toBeVisible()

    await page.getByLabel('Nazwa').fill(slotName)
    await page.getByLabel('Data').fill('2026-04-30')
    await page.getByLabel('Godzina od').fill('08:00')
    await page.getByLabel('Godzina do').fill('09:00')
    await page.getByLabel(/Mnożnik ceny/).fill('1.25')
    await page.getByLabel(/Tylko dla klientów z tagami/).fill('vip,e2e')
    await page.getByLabel('Wymagaj przedpłaty').click()
    await page.getByRole('button', { name: 'Dodaj slot' }).click()

    const slotCard = page.locator(`text=${slotName}`).first()
    await expect(slotCard).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('#vip')).toBeVisible()
    await expect(page.getByText('#e2e')).toBeVisible()
    await expect(page.getByText('Wymagana przedpłata')).toBeVisible()

    const row = page.locator('div.rounded-lg.border.p-4').filter({ hasText: slotName }).first()
    await row.getByRole('button', { name: 'Usuń' }).click()
    await expect(page.getByText(slotName)).toHaveCount(0)
  })
})
