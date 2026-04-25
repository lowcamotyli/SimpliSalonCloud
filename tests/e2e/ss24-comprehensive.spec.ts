import { expect, test, type Page } from '@playwright/test'

const slug = process.env.E2E_SLUG || 'anastazja'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

const priceTypes = ['fixed', 'variable', 'from', 'hidden', 'free']

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function arrayProperty(value: unknown, key: string): unknown[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return []
  }

  return value[key]
}

async function cookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies()
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

async function openFirstServiceDialog(page: Page): Promise<void> {
  await page.goto(`/${slug}/services`)
  await expect(page.getByRole('heading', { name: /Usługi/i })).toBeVisible({ timeout: 15_000 })
  await page.locator('button[title="Edytuj"]').first().click({ force: true })
  await expect(page.getByText(/Edytuj us/i)).toBeVisible({ timeout: 15_000 })
}

async function choosePriceType(page: Page, optionName: RegExp): Promise<void> {
  await page.locator('#price_type').click()
  await page.getByRole('option', { name: optionName }).click()
}

async function openNewBookingMenu(page: Page): Promise<void> {
  await page.goto(`/${slug}/calendar`)
  await expect(page.getByRole('button', { name: /Nowa wizyta/i })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Nowa wizyta/i }).click()
}

async function openReportsTab(page: Page, tabName: RegExp): Promise<void> {
  await page.goto(`/${slug}/reports`)
  await expect(page.getByRole('heading', { name: /Raporty/i })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('tab', { name: tabName }).click()
}

test.describe('Sprint 26 — Service pricing types', () => {
  test('service edit dialog has a required price type select with 5 options', async ({ page }) => {
    await login(page)
    await openFirstServiceDialog(page)

    await expect(page.getByText('Typ ceny *')).toBeVisible({ timeout: 15_000 })
    await page.locator('#price_type').click()

    for (const option of ['Stala', 'Zmienna', 'Od kwoty', 'Ukryta', 'Bezplatna']) {
      await expect(page.getByRole('option', { name: option })).toBeVisible({ timeout: 15_000 })
    }
  })

  test('selecting free hides the price input', async ({ page }) => {
    await login(page)
    await openFirstServiceDialog(page)

    await choosePriceType(page, /Bezplatna/i)
    await expect(page.locator('#price')).toHaveCount(0)
  })

  test('selecting variable changes the price label to Cena od', async ({ page }) => {
    await login(page)
    await openFirstServiceDialog(page)

    await choosePriceType(page, /Zmienna/i)
    await expect(page.getByText('Cena od')).toBeVisible({ timeout: 15_000 })
  })

  test('public services API omits price for hidden services when available', async ({ request }) => {
    const response = await request.get('/api/public/services', {
      headers: {
        'X-API-Key': 'staging-test-key',
      },
    })

    expect([200, 401, 403]).toContain(response.status())

    if (response.status() === 200) {
      const payload: unknown = await response.json()
      const services = arrayProperty(payload, 'services')

      for (const service of services) {
        if (isRecord(service) && service.price_type === 'hidden') {
          expect(service).not.toHaveProperty('price')
        }
      }
    }
  })
})

test.describe('Sprint 27 — Service creation: gallery + employee assignment', () => {
  test('service edit dialog has gallery section and add photo button', async ({ page }) => {
    await login(page)
    await openFirstServiceDialog(page)

    await page.getByRole('tab', { name: /Media|Zdjęcia|Galeria/i }).click()
    await expect(page.getByText('Galeria zdjęć')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /Dodaj zdjęcie|Dodaj/i })).toBeVisible({ timeout: 15_000 })
  })

  test('new service dialog has all required fields including category', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/services`)
    await expect(page.getByRole('heading', { name: /Usługi/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Dodaj usługę|Dodaj us/i }).first().click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Nowa usługa' })
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await expect(dialog.locator('#category')).toBeVisible()
    await expect(dialog.locator('#subcategory')).toBeVisible()
    await expect(dialog.locator('[name="name"]')).toBeVisible()
    await expect(dialog.locator('[name="duration"]')).toBeVisible()
    await expect(dialog.locator('button[type="submit"]')).toBeVisible()
  })
})

test.describe('Sprint 29 — Absences + Time reservations', () => {
  test('employees absences page renders heading', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/employees/absences`)
    await expect(page.getByRole('heading', { name: /Nieobecności|Nieobecno/i })).toBeVisible({ timeout: 15_000 })
  })

  test('add absence opens dialog with date fields', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/employees/absences`)
    await page.getByRole('button', { name: /Dodaj nieobecność|Dodaj nieobecno/i }).click()
    await expect(page.getByRole('heading', { name: /Dodaj nieobecność|Dodaj nieobecno/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('textbox', { name: /Od/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('textbox', { name: /Do/i })).toBeVisible({ timeout: 15_000 })
  })

  test('absence can be created and deleted', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page)

    await page.goto(`/${slug}/employees/absences`)
    await expect(page.getByRole('heading', { name: /Nieobecności|Nieobecno/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Dodaj nieobecność|Dodaj nieobecno/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })

    const employeeCombo = page.getByRole('combobox').first()
    if (await employeeCombo.count() > 0) {
      await employeeCombo.click()
      await page.getByRole('option').first().click()
    }

    const startInput = page.locator('input[type="date"]').first()
    const endInput = page.locator('input[type="date"]').nth(1)
    await startInput.fill('2026-12-01')
    await endInput.fill('2026-12-05')
    await page.getByRole('button', { name: /Zapisz/i }).click()

    await expect(page.getByText(/01\.12\.2026|2026-12-01/)).toBeVisible({ timeout: 15_000 })
    const row = page.locator('tr').filter({ hasText: /01\.12\.2026|2026-12-01/ }).first()
    await row.getByRole('button', { name: /Usuń|Usu/i }).click()
    await page.getByRole('button', { name: /Usuń|Usu/i }).last().click()
    await expect(page.getByText(/01\.12\.2026|2026-12-01/)).toHaveCount(0, { timeout: 15_000 })
  })

  test('calendar new booking menu includes reservation and absence options', async ({ page }) => {
    await login(page)
    await openNewBookingMenu(page)

    await expect(page.getByRole('menuitem', { name: /Rezerwacja czasu/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('menuitem', { name: /Nieobecność|Nieobecno/i })).toBeVisible({ timeout: 15_000 })
  })

  test('calendar opens time reservation dialog from dropdown', async ({ page }) => {
    await login(page)
    await openNewBookingMenu(page)

    await page.getByRole('menuitem', { name: /Rezerwacja czasu/i }).click()
    await expect(page.getByText(/Rezerwacja czasu/i)).toBeVisible({ timeout: 15_000 })
  })

  test('calendar opens absence dialog from dropdown', async ({ page }) => {
    await login(page)
    await openNewBookingMenu(page)

    await page.getByRole('menuitem', { name: /Nieobecność|Nieobecno/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Sprint 31 — Clients list view', () => {
  test('clients page has a list view toggle button', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/clients`)
    await expect(page.getByRole('heading', { name: /Klienci/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('button[aria-label*="list"], button[title*="list"], button[aria-label*="listy"], button[title*="lista"]').first()).toBeVisible({ timeout: 15_000 })
  })

  test('localStorage list view mode renders table after reload', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/clients`)
    await page.evaluate(() => localStorage.setItem('clients-view-mode', 'list'))
    await page.reload()
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  test('list view sorting writes sort parameter to URL', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/clients`)
    await page.evaluate(() => localStorage.setItem('clients-view-mode', 'list'))
    await page.reload()
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })

    await page.locator('th button').filter({ hasText: /Imię|Nazwisko|Imie/i }).first().click()
    await page.waitForURL(/sort=/, { timeout: 15_000 })
  })
})

test.describe('Sprint 32 — Reports: Payment methods + Hours worked', () => {
  test('reports revenue tab shows payment methods', async ({ page }) => {
    await login(page)
    await openReportsTab(page, /Przychody/i)

    await expect(page.getByText('Metody platnosci')).toBeVisible({ timeout: 15_000 })
  })

  test('reports employees tab shows hours worked table', async ({ page }) => {
    await login(page)
    await openReportsTab(page, /Pracownicy/i)

    await expect(page.getByText('Godziny przepracowane')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  test('reports employees tab shows employee hours filter select', async ({ page }) => {
    await login(page)
    await openReportsTab(page, /Pracownicy/i)

    await expect(page.getByLabel('Filtruj raport godzin wedlug pracownika')).toBeVisible({ timeout: 15_000 })
  })

  test('reports revenue tab shows CSV export link', async ({ page }) => {
    await login(page)
    await openReportsTab(page, /Przychody/i)

    await expect(page.getByText('Eksportuj CSV')).toBeVisible({ timeout: 15_000 })
  })

  test('payment methods API returns success or auth denial', async ({ request }) => {
    const response = await request.get('/api/reports/payment-methods', {
      params: {
        from: '2026-01-01',
        to: '2026-04-25',
      },
    })

    expect([200, 401, 403]).toContain(response.status())
  })

  test('hours worked API returns success or auth denial', async ({ request }) => {
    const response = await request.get('/api/reports/hours-worked', {
      params: {
        from: '2026-01-01',
        to: '2026-04-25',
      },
    })

    expect([200, 401, 403]).toContain(response.status())
  })
})

test.describe('Sprint 33 — Equipment list/tiles + service assignment', () => {
  test('equipment page renders heading', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/equipment`)
    await expect(page.getByRole('heading', { name: /Sprzęt|Sprzet|Equipment/i })).toBeVisible({ timeout: 15_000 })
  })

  test('equipment page exposes tiles and list view buttons', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/equipment`)
    await expect(page.locator("button[title='Widok kafelki']")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator("button[title='Widok lista']")).toBeVisible({ timeout: 15_000 })
  })

  test('clicking list view shows table', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/equipment`)
    await page.locator("button[title='Widok lista']").click()
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  test('localStorage list view mode renders equipment table after reload', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/equipment`)
    await page.evaluate(() => localStorage.setItem('equipment-view-mode', 'list'))
    await page.reload()
    await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })
  })

  test('adding equipment opens service assignment modal', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page)

    const equipmentName = `E2E Equipment ${Date.now()}`
    await page.goto(`/${slug}/equipment`)
    await page.getByRole('button', { name: /Dodaj sprzęt|Dodaj sprzet/i }).click()
    await expect(page.getByRole('heading', { name: /Dodaj nowy sprzęt|Dodaj nowy sprz/i })).toBeVisible({ timeout: 15_000 })
    await page.getByLabel(/Nazwa sprzętu|Nazwa sprz/i).fill(equipmentName)
    await page.getByRole('button', { name: /Dodaj sprzęt|Dodaj sprz/i }).last().click()

    await expect(page.getByRole('heading', { name: /Przypisz do usługi|Przypisz do uslugi/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Pomiń|Pomin/i }).click()
  })
})

test.describe('Sprint 34 — Services API returns price_type', () => {
  test('authenticated services API includes valid price_type for nested services', async ({ page }) => {
    await login(page)

    const cookies = await cookieHeader(page)
    const response = await page.context().request.get('/api/services', {
      headers: {
        Cookie: cookies,
      },
    })

    expect(response.status()).toBe(200)
    const payload: unknown = await response.json()
    const groups = arrayProperty(payload, 'services')

    for (const group of groups) {
      for (const subcategory of arrayProperty(group, 'subcategories')) {
        for (const service of arrayProperty(subcategory, 'services')) {
          expect(isRecord(service)).toBe(true)
          if (isRecord(service)) {
            expect(service).toHaveProperty('price_type')
            expect(priceTypes).toContain(service.price_type)
          }
        }
      }
    }
  })
})

test.describe('Sprint 35 — RBAC hardening', () => {
  test('unauthenticated absences API is denied', async ({ request }) => {
    const response = await request.get('/api/absences')
    expect([401, 403]).toContain(response.status())
  })

  test('unauthenticated time reservations API is denied', async ({ request }) => {
    const response = await request.get('/api/time-reservations')
    expect([401, 403]).toContain(response.status())
  })

  test('authenticated absences API returns array payload', async ({ page }) => {
    await login(page)

    const response = await page.context().request.get('/api/absences', {
      headers: {
        Cookie: await cookieHeader(page),
      },
    })

    expect(response.status()).toBe(200)
    const payload: unknown = await response.json()
    expect(Array.isArray(isRecord(payload) ? payload.absences : undefined)).toBe(true)
  })

  test('authenticated time reservations API returns array payload', async ({ page }) => {
    await login(page)

    const response = await page.context().request.get('/api/time-reservations', {
      headers: {
        Cookie: await cookieHeader(page),
      },
    })

    expect(response.status()).toBe(200)
    const payload: unknown = await response.json()
    expect(Array.isArray(isRecord(payload) ? payload.reservations : undefined)).toBe(true)
  })
})

test.describe('Sprint 25 — Hotfix: revenue header', () => {
  test('reports page shows dynamic revenue header with day count', async ({ page }) => {
    await login(page)

    await page.goto(`/${slug}/reports`)
    await expect(page.getByText(/Suma Przychodów.*\d+ dni/i)).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Sprint 38 — Group booking: terms_accepted', () => {
  test('public group booking without terms_accepted is not accepted', async ({ request }) => {
    const response = await request.post('/api/public/group-bookings', {
      data: {
        name: 'E2E Terms Test',
        phone: '500500500',
        email: 'e2e@example.com',
        items: [],
      },
    })

    expect([400, 401, 404, 422]).toContain(response.status())
    expect(response.status()).not.toBe(200)
  })
})

test.describe('Sprint 39 — Availability timezone', () => {
  test('public availability for non-existent service does not return 500', async ({ request }) => {
    const response = await request.get('/api/public/availability', {
      params: {
        date: '2026-05-01',
        serviceId: 'non-existent-id',
      },
    })

    expect(response.status()).not.toBe(500)
  })
})

test.describe('Sprint 40 — Calendar timezone rendering', () => {
  test('calendar navigation does not trigger 500 from time reservations endpoint', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page)

    const timeReservationStatuses: number[] = []
    page.on('response', (response) => {
      if (response.url().includes('/api/time-reservations')) {
        timeReservationStatuses.push(response.status())
      }
    })

    await page.goto(`/${slug}/calendar`)
    await expect(page.getByRole('button', { name: /Nowa wizyta/i })).toBeVisible({ timeout: 15_000 })

    const nextDayButton = page.locator("button[aria-label*='Następny'], button[aria-label*='Nastepny'], button[title*='Następny'], button[title*='Nastepny']").first()
    if (await nextDayButton.count()) {
      await nextDayButton.click()
      await page.waitForTimeout(1_000)
    }

    expect(timeReservationStatuses).not.toContain(500)
  })
})
